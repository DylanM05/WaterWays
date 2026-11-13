import Charts
import SwiftUI

enum PressureMetric: String, CaseIterable, Identifiable {
    case meanSeaLevel, surface
    var id: String { rawValue }
    var title: String { self == .meanSeaLevel ? "Sea-level" : "At station" }
    var valuesLabel: String { self == .meanSeaLevel ? "Sea-level pressure" : "At-station pressure" }
}

struct PressurePoint: Identifiable {
    let time: Date
    let value: Double
    var id: Date { time }
}

/// Pressure now from the server's hourly series (GMT times): the hour nearest now and the change since three
/// hours before it. The pressure tab and the Saved tab's weather use the same rule.
enum PressureNow {
    static func points(_ values: [Double?]?, times: [String]?) -> [PressurePoint] {
        (values ?? []).enumerated().compactMap { index, value in
            guard let value, let times, index < times.count,
                let time = StationDate.parse(times[index], format: "MMMM d yyyy, h:mm:ss a", timeZone: TimeZone(identifier: "UTC")!) else { return nil }
            return PressurePoint(time: time, value: value)
        }
    }

    static func current(_ values: [Double?]?, times: [String]?, now: Date = .now) -> (value: Double, change3h: Double?)? {
        let hours = points(values, times: times)
        guard let latest = nearest(hours, to: now, time: \.time), abs(latest.time.timeIntervalSince(now)) <= 60 * 60 else { return nil }
        let earlier = nearest(hours, to: latest.time.addingTimeInterval(-3 * 60 * 60), time: \.time)
        let change = earlier.flatMap { abs($0.time.timeIntervalSince(latest.time) + 3 * 60 * 60) <= 60 * 60 ? latest.value - $0.value : nil }
        return (latest.value, change)
    }

    /// Steady under 0.5 hPa in three hours; 3 hPa or more is a rapid change.
    static func tendency(_ change: Double) -> String {
        if abs(change) < 0.5 { return "Steady" }
        return "\(abs(change) >= 3 ? "Rapidly " : "")\(change > 0 ? "rising" : "falling")".capitalizedFirst
    }
}

struct PressureChartPanel: View {
    let station: RiverStation
    @State private var metric: PressureMetric = .meanSeaLevel
    @State private var selectedPressurePoint: PressurePoint?
    @State private var pressure: PressureSeries?
    @State private var isLoading = true
    @State private var errorMessage: String?

    /// Every hour the server sends (the past two days and the forecast), in time order.
    private func series(_ values: [Double?]?) -> [PressurePoint] {
        PressureNow.points(values, times: pressure?.time)
    }

    /// The chart: 48 hours either side of now.
    private var points: [PressurePoint] {
        let now = Date.now
        return series(metric == .meanSeaLevel ? pressure?.pressureMsl : pressure?.surfacePressure)
            .filter { abs($0.time.timeIntervalSince(now)) <= 48 * 60 * 60 }
    }

    /// The hour nearest now, and the change since three hours before it.
    private func current(_ values: [Double?]?) -> (value: Double, change3h: Double?)? {
        PressureNow.current(values, times: pressure?.time)
    }

    private func tendency(_ change: Double) -> String { PressureNow.tendency(change) }

    private var pressureDomain: ClosedRange<Double> {
        let values = points.map(\.value)
        guard let minimum = values.min(), let maximum = values.max() else { return 0...1 }
        let padding = max((maximum - minimum) * 0.15, 0.25)
        return (minimum - padding)...(maximum + padding)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Past 48 hours and forecast for the next 48")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("Pressure", selection: $metric) {
                    ForEach(PressureMetric.allCases) { option in Text(option.title).tag(option) }
                }
                .pickerStyle(.segmented)
                if isLoading {
                    ProgressView("Loading pressure readings").frame(maxWidth: .infinity, minHeight: 250)
                } else if let errorMessage {
                    ErrorState(message: errorMessage, retry: load).frame(minHeight: 250)
                } else if points.isEmpty {
                    ContentUnavailableView("No pressure readings", systemImage: "gauge").frame(minHeight: 250)
                } else {
                    Chart {
                        ForEach(points) { point in
                            LineMark(x: .value("Time", point.time), y: .value(metric.valuesLabel, point.value))
                                .foregroundStyle(brandColor)
                                .lineStyle(StrokeStyle(lineWidth: 2.5))
                        }
                        RuleMark(x: .value("Now", Date.now))
                            .foregroundStyle(.secondary.opacity(0.5))
                            .lineStyle(StrokeStyle(lineWidth: 1))
                            .annotation(position: .top, alignment: .leading) {
                                Text("Now").font(.caption2).foregroundStyle(.secondary)
                            }
                        // Outside the loop: one selection line, not one per point.
                        if let selectedPressurePoint {
                            RuleMark(x: .value("Selected time", selectedPressurePoint.time))
                                .foregroundStyle(.secondary.opacity(0.7))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                                .annotation(position: .top, spacing: 8) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(selectedPressurePoint.time.formatted(date: .abbreviated, time: .shortened))
                                        Text("\(selectedPressurePoint.value.formatted(.number.precision(.fractionLength(1)))) hPa")
                                            .fontWeight(.semibold)
                                    }
                                    .font(.caption)
                                    .padding(8)
                                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                                }
                        }
                    }
                    .chartYScale(domain: pressureDomain)
                    .chartYAxisLabel(metric.valuesLabel + " · hPa")
                    .chartYAxis {
                        AxisMarks(position: .leading) { _ in
                            AxisGridLine()
                            AxisValueLabel(format: FloatingPointFormatStyle<Double>.number.precision(.fractionLength(1)))
                        }
                    }
                    .chartXAxis {
                        AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                            AxisGridLine()
                            AxisValueLabel(format: .dateTime.weekday(.abbreviated).hour())
                        }
                    }
                    .chartOverlay { proxy in
                        GeometryReader { geometry in
                            Rectangle()
                                .fill(.clear)
                                .contentShape(Rectangle())
                                .simultaneousGesture(
                                    DragGesture(minimumDistance: 0)
                                        .onChanged { gesture in
                                            guard let plotFrame = proxy.plotFrame else { return }
                                            let frame = geometry[plotFrame]
                                            let xPosition = gesture.location.x - frame.minX
                                            guard xPosition >= 0, xPosition <= frame.width,
                                                  let date: Date = proxy.value(atX: xPosition),
                                                  let point = nearest(points, to: date, time: \.time),
                                                  point.time != selectedPressurePoint?.time else { return }
                                            selectedPressurePoint = point
                                        }
                                )
                        }
                    }
                    .frame(height: 245)
                    .padding(14)
                    .background {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    }
                    if let pressure {
                        HStack(spacing: 12) {
                            if let now = current(pressure.pressureMsl) {
                                StationMetricCard(title: "Sea-level pressure now", value: "\(now.value.formatted(.number.precision(.fractionLength(1)))) hPa", icon: "gauge")
                            }
                            if let now = current(pressure.surfacePressure) {
                                StationMetricCard(title: "Pressure at station now", value: "\(now.value.formatted(.number.precision(.fractionLength(1)))) hPa", icon: "gauge.with.needle")
                            }
                        }
                        if let change = current(pressure.pressureMsl)?.change3h {
                            StationMetricCard(
                                title: "Last 3 hours",
                                value: "\(tendency(change)) · \(change.formatted(.number.precision(.fractionLength(1)).sign(strategy: .always(includingZero: false)))) hPa",
                                icon: change >= 0.5 ? "arrow.up.right" : change <= -0.5 ? "arrow.down.right" : "arrow.right"
                            )
                        }
                        Text("Sea-level pressure is adjusted for elevation. Pressure at station is the forecast pressure at this location.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(16)
        }
        .task { await load() }
        .onChange(of: metric) { selectedPressurePoint = nil }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        do { pressure = try await APIClient.pressureSeries(stationID: station.stationID) }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}

struct CurrentWeatherPanel: View {
    let station: RiverStation
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @State private var weather: CurrentWeather?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading current conditions")
            } else if let errorMessage {
                ErrorState(message: errorMessage, retry: load)
            } else if let weather {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(spacing: 7) {
                            Image(systemName: weather.isDay == 1 ? "sun.max.fill" : "moon.stars.fill")
                                .font(.system(size: 30)).foregroundStyle(brandColor)
                            Text(temperature(weather.temperature))
                                .font(.system(size: 54, weight: .medium, design: .rounded))
                            if let apparent = weather.apparentTemperature {
                                Text("Feels like \(temperature(apparent))").foregroundStyle(.secondary)
                            }
                            Text(weather.weather).font(.title3.weight(.semibold))
                            if let precipitation = weather.precipitation {
                                Text("\(precipitation.total.formatted(.number.precision(.fractionLength(1)))) mm \(precipitation.type ?? "precipitation")")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 22)
                        .background(brandColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            if let humidity = weather.humidity {
                                StationMetricCard(title: "Relative humidity", value: "\(humidity.formatted(.number.precision(.fractionLength(0))))%", icon: "humidity.fill")
                            }
                            if let wind = weather.wind {
                                StationMetricCard(title: "Wind speed", value: "\(wind.formatted(.number.precision(.fractionLength(1)))) km/h\(weather.windDirection.map { " from \($0)" } ?? "")", icon: "wind")
                            }
                            if let gusts = weather.windGusts {
                                StationMetricCard(title: "Wind gusts", value: "\(gusts.formatted(.number.precision(.fractionLength(1)))) km/h", icon: "wind")
                            }
                            if let msl = weather.pressure?.msl {
                                StationMetricCard(title: "Sea-level pressure", value: "\(msl.formatted(.number.precision(.fractionLength(1)))) hPa", icon: "gauge")
                            }
                            if let surfacePressure = weather.pressure?.surface {
                                StationMetricCard(title: "Pressure at station", value: "\(surfacePressure.formatted(.number.precision(.fractionLength(1)))) hPa", icon: "gauge.with.needle")
                            }
                            if let cloudCover = weather.cloudCover {
                                StationMetricCard(title: "Cloud cover", value: "\(cloudCover.formatted(.number.precision(.fractionLength(0))))%", icon: "cloud.fill")
                            }
                            if let time = weather.time {
                                // The server sends GMT ("October 30th 2026, 11:15:00 pm"); show it in local time.
                                let updated = StationDate.parse(time, format: "MMMM d yyyy, h:mm:ss a", timeZone: TimeZone(identifier: "UTC")!)
                                    .map { $0.formatted(date: .abbreviated, time: .shortened) } ?? time
                                StationMetricCard(title: "Updated", value: updated, icon: "clock")
                            }
                        }
                        Text("Sea-level pressure is adjusted to compare locations at a common elevation. Pressure at station is the value at this monitoring location.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(16)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func temperature(_ celsius: Double) -> String {
        if temperatureUnit == "fahrenheit" {
            return "\(((celsius * 9 / 5) + 32).formatted(.number.precision(.fractionLength(1))))°F"
        }
        return "\(celsius.formatted(.number.precision(.fractionLength(1))))°C"
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        do { weather = try await APIClient.currentWeather(stationID: station.stationID) }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
