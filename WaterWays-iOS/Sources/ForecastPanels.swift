import Charts
import SwiftUI

// MARK: - Forecasts

func displayTemperature(_ celsius: Double, unit: String) -> Double {
    unit == "fahrenheit" ? celsius * 9 / 5 + 32 : celsius
}

func degrees(_ celsius: Double?, unit: String) -> String {
    guard let celsius else { return "—" }
    return "\(displayTemperature(celsius, unit: unit).formatted(.number.precision(.fractionLength(0))))°"
}

func compassDirection(_ degrees: Double) -> String {
    let directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    let index = Int((degrees / 22.5).rounded()) % 16
    return directions[(index + 16) % 16]
}

func element<T>(_ array: [T]?, _ index: Int) -> T? {
    guard let array, array.indices.contains(index) else { return nil }
    return array[index]
}

enum WeatherCondition {
    static func symbol(for code: Int?, isDay: Bool = true) -> String {
        switch code {
        case 0: isDay ? "sun.max.fill" : "moon.stars.fill"
        case 1: isDay ? "sun.max.fill" : "moon.fill"
        case 2: isDay ? "cloud.sun.fill" : "cloud.moon.fill"
        case 45, 48: "cloud.fog.fill"
        case 51, 53, 55, 56, 57: "cloud.drizzle.fill"
        case 61, 63: "cloud.rain.fill"
        case 65, 82: "cloud.heavyrain.fill"
        case 66, 67: "cloud.sleet.fill"
        case 71, 73, 75, 85, 86: "cloud.snow.fill"
        case 77: "snowflake"
        case 80, 81: isDay ? "cloud.sun.rain.fill" : "cloud.moon.rain.fill"
        case 95: "cloud.bolt.rain.fill"
        case 96, 99: "cloud.hail.fill"
        default: "cloud.fill"
        }
    }

    static func description(for code: Int?) -> String {
        switch code {
        case 0: "Clear"
        case 1: "Mostly clear"
        case 2: "Partly cloudy"
        case 3: "Cloudy"
        case 45, 48: "Fog"
        case 51: "Light drizzle"
        case 53: "Drizzle"
        case 55: "Heavy drizzle"
        case 56, 57: "Freezing drizzle"
        case 61: "Light rain"
        case 63: "Rain"
        case 65: "Heavy rain"
        case 66, 67: "Freezing rain"
        case 71: "Light snow"
        case 73: "Snow"
        case 75: "Heavy snow"
        case 77: "Snow grains"
        case 80: "Light showers"
        case 81: "Showers"
        case 82: "Heavy showers"
        case 85: "Snow showers"
        case 86: "Heavy snow showers"
        case 95: "Thunderstorms"
        case 96, 99: "Thunderstorms with hail"
        default: "Unknown"
        }
    }

    static func isSnow(_ code: Int?) -> Bool {
        [71, 73, 75, 77, 85, 86].contains(code ?? -1)
    }
}

enum ForecastParsing {
    static func stationTimeZone(identifier: String?, offset: Int?) -> TimeZone? {
        if let identifier, let timeZone = TimeZone(identifier: identifier) { return timeZone }
        return offset.flatMap { TimeZone(secondsFromGMT: $0) }
    }

    static func formatter(_ format: String, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }
}

/// Forecasts change slowly, so switching station tabs reuses recent responses instead of refetching.
@MainActor
final class TimedCache<Value> {
    private let maxAge: TimeInterval
    private var entries: [String: (storedAt: Date, value: Value)] = [:]

    init(maxAge: TimeInterval) { self.maxAge = maxAge }

    func value(for key: String) -> Value? {
        guard let entry = entries[key], Date.now.timeIntervalSince(entry.storedAt) < maxAge else { return nil }
        return entry.value
    }

    func store(_ value: Value, for key: String) {
        entries[key] = (.now, value)
    }
}



@MainActor let hourlyForecastCache = TimedCache<HourlyForecastData>(maxAge: 15 * 60)
@MainActor let weeklyForecastCache = TimedCache<WeeklyForecastData>(maxAge: 15 * 60)

struct ForecastHour: Identifiable {
    let time: Date
    let temperature: Double?
    let feelsLike: Double?
    let code: Int?
    let precipitationChance: Double?
    let precipitation: Double?
    let humidity: Double?
    let windSpeed: Double?
    let windGusts: Double?
    let windDirection: Double?
    let isDay: Bool
    var id: Date { time }
}

struct HourlyForecastData {
    let hours: [ForecastHour]
    let timeZone: TimeZone

    init(_ forecast: HourlyForecast) {
        let times: [Date?]
        if let rawTime = forecast.rawTime,
           let stationZone = ForecastParsing.stationTimeZone(identifier: forecast.timezone, offset: forecast.utcOffsetSeconds) {
            let formatter = ForecastParsing.formatter("yyyy-MM-dd'T'HH:mm", timeZone: stationZone)
            times = rawTime.map { formatter.date(from: $0) }
            timeZone = stationZone
        } else {
            // Older servers send GMT wall-clock times such as "October 21st 2026, 3:00:00 pm".
            let formatter = ForecastParsing.formatter("MMMM d yyyy, h:mm:ss a", timeZone: TimeZone(identifier: "UTC")!)
            times = forecast.time.map {
                formatter.date(from: $0.replacingOccurrences(of: "(?<=\\d)(st|nd|rd|th)", with: "", options: .regularExpression))
            }
            timeZone = .current
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        hours = times.enumerated().compactMap { index, time in
            guard let time else { return nil }
            let isDay = element(forecast.isDay, index).flatMap { $0 }.map { $0 == 1 }
                ?? (7..<20).contains(calendar.component(.hour, from: time))
            return ForecastHour(
                time: time,
                temperature: element(forecast.temperature, index) ?? nil,
                feelsLike: element(forecast.apparentTemperature, index) ?? nil,
                code: element(forecast.weatherCode, index) ?? nil,
                precipitationChance: element(forecast.precipitationProbability, index) ?? nil,
                precipitation: element(forecast.precipitation, index) ?? nil,
                humidity: element(forecast.relativeHumidity, index) ?? nil,
                windSpeed: element(forecast.windSpeed, index) ?? nil,
                windGusts: element(forecast.windGusts, index) ?? nil,
                windDirection: element(forecast.windDirection, index) ?? nil,
                isDay: isDay
            )
        }
    }

    /// The current hour onward, so cached data stays correct as time passes.
    func upcoming(from now: Date = .now, limit: Int = 24) -> [ForecastHour] {
        Array(hours.filter { $0.time > now.addingTimeInterval(-60 * 60) }.prefix(limit))
    }
}

struct ForecastDay: Identifiable {
    let date: Date
    let code: Int?
    let high: Double
    let low: Double
    let precipitation: Double?
    let precipitationChance: Double?
    let windSpeed: Double?
    let windGusts: Double?
    let windDirection: Double?
    let uv: Double?
    let sunrise: Date?
    let sunset: Date?
    let daylight: String?
    var id: Date { date }

    var isWet: Bool {
        (precipitation ?? 0) >= 1 || (precipitationChance ?? 0) >= 60
    }
}

struct WeeklyForecastData {
    let days: [ForecastDay]
    let timeZone: TimeZone
    /// Sunrise and sunset are only shown when the server sends station-local times.
    let hasSunTimes: Bool

    init(_ forecast: WeeklyForecast) {
        timeZone = ForecastParsing.stationTimeZone(identifier: forecast.timezone, offset: forecast.utcOffsetSeconds) ?? .current
        hasSunTimes = forecast.sun.rawSunrise != nil
        let dayFormatter = ForecastParsing.formatter("yyyy-MM-dd", timeZone: timeZone)
        let sunFormatter = ForecastParsing.formatter("yyyy-MM-dd'T'HH:mm", timeZone: timeZone)
        days = Array(forecast.rawDates.enumerated().compactMap { index, rawDate in
            guard let date = dayFormatter.date(from: rawDate),
                  let high = element(forecast.temperature.maximum, index),
                  let low = element(forecast.temperature.minimum, index) else { return nil }
            return ForecastDay(
                date: date,
                code: element(forecast.weather.codes, index),
                high: high,
                low: low,
                precipitation: element(forecast.precipitation.total, index),
                precipitationChance: element(forecast.precipitation.probability, index) ?? nil,
                windSpeed: element(forecast.wind.maximumSpeed, index),
                windGusts: element(forecast.wind.maximumGusts, index) ?? nil,
                windDirection: element(forecast.wind.dominantDirection, index) ?? nil,
                uv: element(forecast.uv.maximum, index),
                sunrise: element(forecast.sun.rawSunrise, index).flatMap { sunFormatter.date(from: $0) },
                sunset: element(forecast.sun.rawSunset, index).flatMap { sunFormatter.date(from: $0) },
                daylight: element(forecast.sun.daylightDuration, index)
            )
        }.prefix(7))
    }
}

// MARK: Shared forecast layout

struct ForecastHero: View {
    let symbol: String
    let headline: String
    let condition: String
    let detail: String
    let summary: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 16) {
                Image(systemName: symbol)
                    .symbolRenderingMode(.multicolor)
                    .font(.system(size: 48))
                    .frame(width: 64)
                VStack(alignment: .leading, spacing: 2) {
                    Text(headline).font(.system(size: 42, weight: .semibold, design: .rounded))
                    Text(condition).font(.headline)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            Divider()
            Text(summary).font(.subheadline)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [brandColor.opacity(0.18), brandColor.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 18)
        )
        .accessibilityElement(children: .combine)
    }
}

struct ForecastCard<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

struct PrecipitationChanceLabel: View {
    let chance: Double?

    var body: some View {
        // Reserve the line even when hidden so icons stay aligned across columns and rows.
        let visible = (chance ?? 0) >= 20
        Text("\((chance ?? 0).formatted(.number.precision(.fractionLength(0))))%")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.blue)
            .opacity(visible ? 1 : 0)
            .accessibilityHidden(!visible)
    }
}

// MARK: Hourly

enum HourlyChartMetric: String, CaseIterable, Identifiable {
    case temperature, precipitation, wind
    var id: String { rawValue }
    var title: String {
        switch self {
        case .temperature: "Temperature"
        case .precipitation: "Precipitation"
        case .wind: "Wind"
        }
    }
}

struct HourlyForecastPanel: View {
    let station: RiverStation
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @State private var forecast: HourlyForecastData?
    @State private var errorMessage: String?
    @State private var chartMetric: HourlyChartMetric = .temperature
    @State private var selectedTime: Date?

    var body: some View {
        Group {
            if let forecast, case let hours = forecast.upcoming(), !hours.isEmpty {
                ScrollView {
                    VStack(spacing: 14) {
                        hero(hours, timeZone: forecast.timeZone)
                        ForecastCard(title: "Next 24 hours", systemImage: "clock") {
                            hourStrip(hours, timeZone: forecast.timeZone)
                        }
                        ForecastCard(title: "Trends", systemImage: "chart.xyaxis.line") {
                            trendChart(hours, timeZone: forecast.timeZone)
                        }
                    }
                    .padding(16)
                }
            } else if let errorMessage {
                ErrorState(message: errorMessage) { await load(force: true) }
            } else if forecast != nil {
                ContentUnavailableView("No hourly forecast available", systemImage: "clock")
            } else {
                ProgressView("Loading hourly forecast").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await load(force: false) }
        .refreshable { await load(force: true) }
        .onChange(of: chartMetric) { selectedTime = nil }
    }

    private func hourStyle(_ timeZone: TimeZone) -> Date.FormatStyle {
        Date.FormatStyle(timeZone: timeZone).hour()
    }

    private func hero(_ hours: [ForecastHour], timeZone: TimeZone) -> some View {
        let current = hours[0]
        let temperatures = hours.compactMap(\.temperature)
        var detail = "H \(degrees(temperatures.max(), unit: temperatureUnit))  L \(degrees(temperatures.min(), unit: temperatureUnit))"
        if let feelsLike = current.feelsLike {
            detail = "Feels like \(degrees(feelsLike, unit: temperatureUnit)) · " + detail
        }
        return ForecastHero(
            symbol: WeatherCondition.symbol(for: current.code, isDay: current.isDay),
            headline: degrees(current.temperature, unit: temperatureUnit),
            condition: WeatherCondition.description(for: current.code),
            detail: detail,
            summary: summary(hours, timeZone: timeZone)
        )
    }

    private func summary(_ hours: [ForecastHour], timeZone: TimeZone) -> String {
        var sentences: [String] = []
        if let index = hours.firstIndex(where: { ($0.precipitationChance ?? 0) >= 50 }) {
            let kind = WeatherCondition.isSnow(hours[index].code) ? "Snow" : "Rain"
            sentences.append(index == 0 ? "\(kind) likely now." : "\(kind) likely around \(hours[index].time.formatted(hourStyle(timeZone))).")
        } else if let peak = hours.compactMap(\.precipitationChance).max(), peak >= 20 {
            sentences.append("Low chance of precipitation, up to \(peak.formatted(.number.precision(.fractionLength(0))))%.")
        } else {
            sentences.append("No precipitation expected in the next 24 hours.")
        }
        if let gustiest = hours.max(by: { ($0.windGusts ?? 0) < ($1.windGusts ?? 0) }),
           let gusts = gustiest.windGusts, gusts >= 40 {
            sentences.append("Gusts up to \(gusts.formatted(.number.precision(.fractionLength(0)))) km/h around \(gustiest.time.formatted(hourStyle(timeZone))).")
        }
        return sentences.joined(separator: " ")
    }

    private func hourStrip(_ hours: [ForecastHour], timeZone: TimeZone) -> some View {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(Array(hours.enumerated()), id: \.element.id) { index, hour in
                    let startsDay = index > 0 && calendar.component(.hour, from: hour.time) == 0
                    let label = index == 0 ? "Now"
                        : startsDay ? hour.time.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated))
                        : hour.time.formatted(hourStyle(timeZone))
                    VStack(spacing: 8) {
                        Text(label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(index == 0 || startsDay ? .primary : .secondary)
                        Image(systemName: WeatherCondition.symbol(for: hour.code, isDay: hour.isDay))
                            .symbolRenderingMode(.multicolor)
                            .font(.title3)
                            .frame(height: 26)
                        PrecipitationChanceLabel(chance: hour.precipitationChance)
                        Text(degrees(hour.temperature, unit: temperatureUnit))
                            .font(.body.weight(.semibold))
                    }
                    .frame(width: 54)
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(label), \(WeatherCondition.description(for: hour.code)), \(degrees(hour.temperature, unit: temperatureUnit))")
                }
            }
        }
    }

    private func trendChart(_ hours: [ForecastHour], timeZone: TimeZone) -> some View {
        let metrics = HourlyChartMetric.allCases.filter { $0 != .wind || hours.contains { $0.windSpeed != nil } }
        let selectedHour = selectedTime.flatMap { time in
            hours.min { abs($0.time.timeIntervalSince(time)) < abs($1.time.timeIntervalSince(time)) }
        }
        return VStack(alignment: .leading, spacing: 12) {
            Picker("Chart", selection: $chartMetric) {
                ForEach(metrics) { metric in Text(metric.title).tag(metric) }
            }
            .pickerStyle(.segmented)

            Chart {
                ForEach(hours) { hour in
                    marks(for: hour)
                }
                if let selectedHour {
                    RuleMark(x: .value("Selected", selectedHour.time))
                        .foregroundStyle(.secondary.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .annotation(position: .top, spacing: 6, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(selectedHour.time.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated).hour()))
                                    .foregroundStyle(.secondary)
                                Text(selectionText(selectedHour)).fontWeight(.semibold)
                            }
                            .font(.caption)
                            .padding(8)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                        }
                }
            }
            .chartXSelection(value: $selectedTime)
            .chartYScale(domain: chartMetric == .precipitation ? .automatic(includesZero: true) : .automatic(includesZero: false))
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: hourStyle(timeZone))
                }
            }
            .frame(height: 200)

            chartLegend
        }
    }

    @ChartContentBuilder
    private func marks(for hour: ForecastHour) -> some ChartContent {
        switch chartMetric {
        case .temperature:
            if let temperature = hour.temperature {
                LineMark(x: .value("Time", hour.time), y: .value("Temperature", displayTemperature(temperature, unit: temperatureUnit)), series: .value("Series", "Temperature"))
                    .foregroundStyle(.orange)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                    .interpolationMethod(.catmullRom)
            }
            if let feelsLike = hour.feelsLike {
                LineMark(x: .value("Time", hour.time), y: .value("Temperature", displayTemperature(feelsLike, unit: temperatureUnit)), series: .value("Series", "Feels like"))
                    .foregroundStyle(.orange.opacity(0.45))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    .interpolationMethod(.catmullRom)
            }
        case .precipitation:
            BarMark(x: .value("Time", hour.time, unit: .hour), y: .value("Chance", hour.precipitationChance ?? 0))
                .foregroundStyle(.blue.gradient)
        case .wind:
            if let speed = hour.windSpeed {
                LineMark(x: .value("Time", hour.time), y: .value("Wind", speed), series: .value("Series", "Wind"))
                    .foregroundStyle(.teal)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                    .interpolationMethod(.catmullRom)
            }
            if let gusts = hour.windGusts {
                LineMark(x: .value("Time", hour.time), y: .value("Wind", gusts), series: .value("Series", "Gusts"))
                    .foregroundStyle(.teal.opacity(0.45))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    .interpolationMethod(.catmullRom)
            }
        }
    }

    private func selectionText(_ hour: ForecastHour) -> String {
        switch chartMetric {
        case .temperature:
            let feelsLike = hour.feelsLike.map { " · feels \(degrees($0, unit: temperatureUnit))" } ?? ""
            return degrees(hour.temperature, unit: temperatureUnit) + feelsLike
        case .precipitation:
            let chance = "\((hour.precipitationChance ?? 0).formatted(.number.precision(.fractionLength(0))))%"
            let amount = hour.precipitation.map { $0 > 0 ? " · \($0.formatted(.number.precision(.fractionLength(1)))) mm" : "" } ?? ""
            return chance + amount
        case .wind:
            let speed = hour.windSpeed.map { "\($0.formatted(.number.precision(.fractionLength(0)))) km/h" } ?? "—"
            let direction = hour.windDirection.map { " \(compassDirection($0))" } ?? ""
            let gusts = hour.windGusts.map { " · gusts \($0.formatted(.number.precision(.fractionLength(0))))" } ?? ""
            return speed + direction + gusts
        }
    }

    @ViewBuilder
    private var chartLegend: some View {
        switch chartMetric {
        case .temperature:
            legend(solid: "Temperature (\(temperatureUnit == "fahrenheit" ? "°F" : "°C"))", dashed: "Feels like", color: .orange)
        case .precipitation:
            Text("Chance of precipitation (%)").font(.caption).foregroundStyle(.secondary)
        case .wind:
            legend(solid: "Wind (km/h)", dashed: "Gusts", color: .teal)
        }
    }

    private func legend(solid: String, dashed: String, color: Color) -> some View {
        HStack(spacing: 14) {
            Label { Text(solid) } icon: { Capsule().fill(color).frame(width: 14, height: 3) }
            Label { Text(dashed) } icon: { Capsule().fill(color.opacity(0.45)).frame(width: 14, height: 2) }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    @MainActor
    private func load(force: Bool) async {
        if !force, let cached = hourlyForecastCache.value(for: station.stationID) {
            forecast = cached
            return
        }
        errorMessage = nil
        do {
            let prepared = HourlyForecastData(try await APIClient.hourlyForecast(stationID: station.stationID))
            hourlyForecastCache.store(prepared, for: station.stationID)
            forecast = prepared
        } catch {
            // Keep showing the previous forecast if a refresh fails.
            if forecast == nil { errorMessage = error.localizedDescription }
        }
    }
}

// MARK: Weekly

struct WeeklyForecastPanel: View {
    let station: RiverStation
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @State private var forecast: WeeklyForecastData?
    @State private var errorMessage: String?
    @State private var expandedDay: Date?

    var body: some View {
        Group {
            if let forecast, let today = forecast.days.first {
                ScrollView {
                    VStack(spacing: 14) {
                        hero(today, forecast: forecast)
                        ForecastCard(title: "7-day forecast", systemImage: "calendar") {
                            dayList(forecast)
                        }
                    }
                    .padding(16)
                }
            } else if let errorMessage {
                ErrorState(message: errorMessage) { await load(force: true) }
            } else if forecast != nil {
                ContentUnavailableView("No weekly forecast available", systemImage: "calendar")
            } else {
                ProgressView("Loading weekly forecast").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await load(force: false) }
        .refreshable { await load(force: true) }
    }

    private func calendar(_ timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    private func dayLabel(_ day: ForecastDay, timeZone: TimeZone, style: Date.FormatStyle.Symbol.Weekday = .abbreviated) -> String {
        calendar(timeZone).isDateInToday(day.date) ? "Today" : day.date.formatted(Date.FormatStyle(timeZone: timeZone).weekday(style))
    }

    private func hero(_ today: ForecastDay, forecast: WeeklyForecastData) -> some View {
        var detail = "Low \(degrees(today.low, unit: temperatureUnit))"
        if let chance = today.precipitationChance, chance >= 20 {
            detail += " · \(chance.formatted(.number.precision(.fractionLength(0))))% chance of precipitation"
        }
        return ForecastHero(
            symbol: WeatherCondition.symbol(for: today.code),
            headline: degrees(today.high, unit: temperatureUnit),
            condition: "\(dayLabel(today, timeZone: forecast.timeZone)) · \(WeatherCondition.description(for: today.code))",
            detail: detail,
            summary: summary(forecast)
        )
    }

    private func summary(_ forecast: WeeklyForecastData) -> String {
        let wetDays = forecast.days.filter(\.isWet)
        var sentences: [String] = []
        if wetDays.isEmpty {
            sentences.append("Mostly dry week ahead.")
        } else {
            let kind = wetDays.allSatisfy { WeatherCondition.isSnow($0.code) } ? "Snow" : "Precipitation"
            let names = wetDays.map { dayLabel($0, timeZone: forecast.timeZone) }
            sentences.append(wetDays.count >= 5 ? "\(kind) on most days this week." : "\(kind) expected \(names.formatted(.list(type: .and))).")
        }
        if let warmest = forecast.days.max(by: { $0.high < $1.high }) {
            sentences.append("Warmest \(dayLabel(warmest, timeZone: forecast.timeZone, style: .wide)) at \(degrees(warmest.high, unit: temperatureUnit)).")
        }
        return sentences.joined(separator: " ")
    }

    private func dayList(_ forecast: WeeklyForecastData) -> some View {
        let weekLow = forecast.days.map(\.low).min() ?? 0
        let weekHigh = forecast.days.map(\.high).max() ?? 0
        return VStack(spacing: 0) {
            ForEach(Array(forecast.days.enumerated()), id: \.element.id) { index, day in
                if index > 0 { Divider() }
                let isExpanded = expandedDay == day.date
                Button {
                    withAnimation(.snappy) { expandedDay = isExpanded ? nil : day.date }
                } label: {
                    HStack(spacing: 10) {
                        Text(dayLabel(day, timeZone: forecast.timeZone))
                            .font(.body.weight(.semibold))
                            .frame(width: 56, alignment: .leading)
                        VStack(spacing: 2) {
                            Image(systemName: WeatherCondition.symbol(for: day.code))
                                .symbolRenderingMode(.multicolor)
                                .font(.title3)
                            PrecipitationChanceLabel(chance: day.precipitationChance)
                        }
                        .frame(width: 40)
                        Text(degrees(day.low, unit: temperatureUnit))
                            .foregroundStyle(.secondary)
                            .frame(width: 38, alignment: .trailing)
                        TemperatureRangeBar(low: day.low, high: day.high, rangeLow: weekLow, rangeHigh: weekHigh)
                        Text(degrees(day.high, unit: temperatureUnit))
                            .fontWeight(.semibold)
                            .frame(width: 38, alignment: .leading)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .monospacedDigit()
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(dayLabel(day, timeZone: forecast.timeZone, style: .wide)), \(WeatherCondition.description(for: day.code)), high \(degrees(day.high, unit: temperatureUnit)), low \(degrees(day.low, unit: temperatureUnit))")
                .accessibilityHint(isExpanded ? "Hides details" : "Shows details")

                if isExpanded {
                    dayDetails(day, forecast: forecast)
                        .padding(.bottom, 12)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    private func dayDetails(_ day: ForecastDay, forecast: WeeklyForecastData) -> some View {
        let timeStyle = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: forecast.timeZone)
        return VStack(alignment: .leading, spacing: 10) {
            Text(WeatherCondition.description(for: day.code)).font(.subheadline.weight(.semibold))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 12) {
                if let precipitation = day.precipitation {
                    ForecastDetailItem(title: "Precipitation", value: "\(precipitation.formatted(.number.precision(.fractionLength(1)))) mm", systemImage: "drop.fill")
                }
                if let speed = day.windSpeed {
                    ForecastDetailItem(title: "Wind", value: "\(speed.formatted(.number.precision(.fractionLength(0)))) km/h\(day.windDirection.map { " \(compassDirection($0))" } ?? "")", systemImage: "wind")
                }
                if let gusts = day.windGusts {
                    ForecastDetailItem(title: "Gusts", value: "\(gusts.formatted(.number.precision(.fractionLength(0)))) km/h", systemImage: "wind")
                }
                if let uv = day.uv {
                    ForecastDetailItem(title: "UV index", value: "\(uv.formatted(.number.precision(.fractionLength(0)))) \(uvLevel(uv))", systemImage: "sun.max.fill")
                }
                if let sunrise = day.sunrise {
                    ForecastDetailItem(title: "Sunrise", value: sunrise.formatted(timeStyle), systemImage: "sunrise.fill")
                }
                if let sunset = day.sunset {
                    ForecastDetailItem(title: "Sunset", value: sunset.formatted(timeStyle), systemImage: "sunset.fill")
                }
                if let daylight = day.daylight {
                    ForecastDetailItem(title: "Daylight", value: daylight, systemImage: "clock")
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func uvLevel(_ uv: Double) -> String {
        switch uv {
        case ..<3: "Low"
        case ..<6: "Moderate"
        case ..<8: "High"
        case ..<11: "Very high"
        default: "Extreme"
        }
    }

    @MainActor
    private func load(force: Bool) async {
        if !force, let cached = weeklyForecastCache.value(for: station.stationID) {
            forecast = cached
            return
        }
        errorMessage = nil
        do {
            let prepared = WeeklyForecastData(try await APIClient.weeklyForecast(stationID: station.stationID))
            weeklyForecastCache.store(prepared, for: station.stationID)
            forecast = prepared
        } catch {
            // Keep showing the previous forecast if a refresh fails.
            if forecast == nil { errorMessage = error.localizedDescription }
        }
    }
}

struct TemperatureRangeBar: View {
    let low: Double
    let high: Double
    let rangeLow: Double
    let rangeHigh: Double

    var body: some View {
        GeometryReader { geometry in
            let span = max(rangeHigh - rangeLow, 1)
            let start = (low - rangeLow) / span * geometry.size.width
            let width = max((high - low) / span * geometry.size.width, 6)
            ZStack(alignment: .leading) {
                Capsule().fill(Color(uiColor: .tertiarySystemFill))
                Capsule()
                    .fill(LinearGradient(colors: [.cyan, .green, .yellow, .orange], startPoint: .leading, endPoint: .trailing))
                    .frame(width: width)
                    .offset(x: start)
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

struct ForecastDetailItem: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold))
        }
        .accessibilityElement(children: .combine)
    }
}
