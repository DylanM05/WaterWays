import Charts
import SwiftUI

enum WaterMetric: String, CaseIterable, Identifiable {
    case waterLevel, discharge
    var id: String { rawValue }
    var title: String { self == .waterLevel ? "Water level" : "Discharge" }
    var unit: String { self == .waterLevel ? "m" : "m³/s" }
    var color: Color { self == .waterLevel ? Theme.accent : Theme.flow }
    func value(_ reading: WaterSeriesReading) -> Double? {
        self == .waterLevel ? reading.waterLevel : reading.discharge
    }
    /// The reading's own low and high: an hourly figure's range, or the value itself for a single reading.
    func range(_ reading: WaterSeriesReading) -> (low: Double, high: Double)? {
        guard let value = value(reading) else { return nil }
        let low = self == .waterLevel ? reading.waterLevelMin : reading.dischargeMin
        let high = self == .waterLevel ? reading.waterLevelMax : reading.dischargeMax
        return (low ?? value, high ?? value)
    }
}

struct WaterPoint: Identifiable, Sendable {
    let reading: WaterSeriesReading
    let time: Date
    let value: Double
    // A thinned chart can plot an hourly figure's low and high at the same time, so the value is part of the ID.
    var id: String { "\(reading.id)|\(value)" }
}

/// Context for one metric over the full fetched history, independent of the selected chart window.
struct WaterMetricSummary: Sendable {
    let latest: Double
    let latestTime: Date
    let change24h: Double?
    let change7d: Double?
    let average: Double
    let low: Double
    let high: Double

    init?(_ samples: [(time: Date, value: Double, low: Double, high: Double)]) {
        let values = samples.map(\.value)
        guard let last = samples.last, let low = samples.map(\.low).min(), let high = samples.map(\.high).max() else { return nil }
        latest = last.value
        latestTime = last.time
        average = values.reduce(0, +) / Double(values.count)
        self.low = low
        self.high = high
        change24h = Self.change(in: samples, overHours: 24)
        change7d = Self.change(in: samples, overHours: 24 * 7)
    }

    /// Where the latest reading sits between the low (0) and high (1).
    var positionInRange: Double {
        high > low ? (latest - low) / (high - low) : 0.5
    }

    /// Treats changes under 3% of the observed range as steady so sensor noise doesn't read as a trend.
    func isSteady(_ change: Double) -> Bool {
        abs(change) < max((high - low) * 0.03, 0.001)
    }

    /// Difference from the reading nearest the given time before the latest, if one exists within an hour of it.
    private static func change(in samples: [(time: Date, value: Double, low: Double, high: Double)], overHours hours: Double) -> Double? {
        guard let last = samples.last else { return nil }
        let target = last.time.addingTimeInterval(-hours * 60 * 60)
        guard let past = samples.min(by: { abs($0.time.timeIntervalSince(target)) < abs($1.time.timeIntervalSince(target)) }),
              abs(past.time.timeIntervalSince(target)) <= 60 * 60 else { return nil }
        return last.value - past.value
    }
}

struct PreparedWaterData: Sendable {
    let ranges: [Int: PreparedWaterRange]
    let summaries: [WaterMetric: WaterMetricSummary]

    /// Parses one long series once and slices it into each requested window, mirroring the web client.
    init(readings: [WaterSeriesReading], windowDays: [Int], now: Date = .now) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"

        let timestamped = readings.compactMap { reading -> (reading: WaterSeriesReading, time: Date)? in
            let normalized = reading.dateTime.replacingOccurrences(of: "\u{00a0}", with: " ")
            guard let time = formatter.date(from: normalized) else { return nil }
            return (reading, time)
        }
        .sorted { $0.time < $1.time }

        ranges = Dictionary(uniqueKeysWithValues: windowDays.map { days in
            let start = now.addingTimeInterval(-Double(days) * 24 * 60 * 60)
            let windowed = timestamped.filter { $0.time >= start && $0.time <= now }
            return (days, PreparedWaterRange(timestamped: windowed))
        })

        let longestStart = now.addingTimeInterval(-Double(windowDays.max() ?? 30) * 24 * 60 * 60)
        let history = timestamped.filter { $0.time >= longestStart && $0.time <= now }
        var summaries: [WaterMetric: WaterMetricSummary] = [:]
        for metric in WaterMetric.allCases {
            summaries[metric] = WaterMetricSummary(history.compactMap { sample in
                guard let value = metric.value(sample.reading), let range = metric.range(sample.reading) else { return nil }
                return (time: sample.time, value: value, low: range.low, high: range.high)
            })
        }
        self.summaries = summaries
    }
}

struct PreparedWaterRange: Sendable {
    let readings: [WaterSeriesReading]
    let waterLevelPoints: [WaterPoint]
    let dischargePoints: [WaterPoint]
    let waterLevelBounds: (minimum: Double, maximum: Double)?
    let dischargeBounds: (minimum: Double, maximum: Double)?

    fileprivate init(timestamped: [(reading: WaterSeriesReading, time: Date)]) {
        self.readings = timestamped.map(\.reading)
        waterLevelPoints = Self.downsample(Self.points(timestamped, .waterLevel), metric: .waterLevel)
        dischargePoints = Self.downsample(Self.points(timestamped, .discharge), metric: .discharge)
        waterLevelBounds = Self.bounds(timestamped, .waterLevel)
        dischargeBounds = Self.bounds(timestamped, .discharge)
    }

    private static func points(_ timestamped: [(reading: WaterSeriesReading, time: Date)], _ metric: WaterMetric) -> [WaterPoint] {
        timestamped.compactMap { sample in
            metric.value(sample.reading).map { WaterPoint(reading: sample.reading, time: sample.time, value: $0) }
        }
    }

    /// Uses each reading's own range, so an hourly figure's peak sets the chart's high, not its average.
    private static func bounds(_ timestamped: [(reading: WaterSeriesReading, time: Date)], _ metric: WaterMetric) -> (minimum: Double, maximum: Double)? {
        let ranges = timestamped.compactMap { metric.range($0.reading) }
        guard let minimum = ranges.map(\.low).min(), let maximum = ranges.map(\.high).max() else { return nil }
        return (minimum, maximum)
    }

    /// Thins long series to about 500 points by keeping each bucket's lowest and highest value. Hourly figures
    /// (older than a week) contribute their hour's own low and high, so short peaks stay on the chart.
    private static func downsample(_ points: [WaterPoint], metric: WaterMetric) -> [WaterPoint] {
        guard points.count > 500 else { return points }
        let bucketSize = Int(ceil(Double(points.count) / 250))
        var sampled: [WaterPoint] = []
        for start in stride(from: 0, to: points.count, by: bucketSize) {
            let end = min(start + bucketSize, points.count)
            let extremes = points[start..<end].map { point -> (point: WaterPoint, low: Double, high: Double) in
                let range = metric.range(point.reading) ?? (point.value, point.value)
                return (point, range.low, range.high)
            }
            guard let lowest = extremes.min(by: { $0.low < $1.low }),
                  let highest = extremes.max(by: { $0.high < $1.high }) else { continue }
            let low = WaterPoint(reading: lowest.point.reading, time: lowest.point.time, value: lowest.low)
            let high = WaterPoint(reading: highest.point.reading, time: highest.point.time, value: highest.high)
            let ordered = low.time <= high.time ? [low, high] : [high, low]
            sampled.append(ordered[0])
            if ordered[1].id != ordered[0].id { sampled.append(ordered[1]) }
        }
        return sampled
    }
}

/// Prepared 30-day windows per station, kept for the app session like the web client's cache.
@MainActor
enum WaterDataCache {
    static let maxAge: TimeInterval = 10 * 60
    static var entries: [String: (fetchedAt: Date, data: PreparedWaterData)] = [:]

    static func data(for stationID: String) -> PreparedWaterData? {
        guard let entry = entries[stationID], Date.now.timeIntervalSince(entry.fetchedAt) < maxAge else { return nil }
        return entry.data
    }
}

struct WaterChartPanel: View {
    let station: RiverStation
    @State private var days = 1
    @State private var metric: WaterMetric = .waterLevel
    @State private var errorMessage: String?
    @State private var isFetching = false
    @State private var rangesByDays: [Int: PreparedWaterRange] = [:]
    @State private var summaries: [WaterMetric: WaterMetricSummary] = [:]
    private let ranges = [1, 3, 7, 14, 30]

    private var selectedRange: PreparedWaterRange? { rangesByDays[days] }
    private var readings: [WaterSeriesReading] { selectedRange?.readings ?? [] }
    private var isLoading: Bool { selectedRange == nil && errorMessage == nil }
    private var points: [WaterPoint] {
        metric == .waterLevel ? selectedRange?.waterLevelPoints ?? [] : selectedRange?.dischargePoints ?? []
    }

    private var recentReadings: [WaterSeriesReading] {
        Array(readings.suffix(5).reversed())
    }

    private var chartDomain: ClosedRange<Double> {
        guard let bounds = selectedBounds else { return 0...1 }
        let minimum = bounds.minimum
        let maximum = bounds.maximum
        let variation = maximum - minimum
        let padding = max(variation * 0.12, abs(maximum) * 0.002, 0.005)
        return (minimum - padding)...(maximum + padding)
    }

    private var selectedBounds: (minimum: Double, maximum: Double)? {
        metric == .waterLevel ? selectedRange?.waterLevelBounds : selectedRange?.dischargeBounds
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Metric", selection: $metric) {
                    ForEach(WaterMetric.allCases) { option in Text(option.title).tag(option) }
                }
                .pickerStyle(.segmented)
                HStack(spacing: 8) {
                    ForEach(ranges, id: \.self) { range in
                        Button { days = range } label: {
                            HStack(spacing: 4) {
                                Text("\(range)d")
                                if rangesByDays[range] == nil && isFetching {
                                    ProgressView().controlSize(.mini)
                                }
                            }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(days == range ? .white : .primary)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(days == range ? Theme.accent : Theme.surface, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                if isLoading {
                    ProgressView("Loading water readings").frame(maxWidth: .infinity, minHeight: 250)
                } else if let errorMessage {
                    ErrorState(message: errorMessage) {
                        await loadWaterData(force: true)
                    }
                    .frame(minHeight: 250)
                } else if points.isEmpty, station.realtime == false {
                    ContentUnavailableView(
                        "No live readings",
                        systemImage: "clock.arrow.circlepath",
                        description: Text("This station doesn't send real-time data. Any archived history is in the History tab.")
                    )
                    .frame(minHeight: 250)
                } else if points.isEmpty {
                    ContentUnavailableView("No readings available", systemImage: "water.waves").frame(minHeight: 250)
                } else {
                    if let stats = selectedBounds {
                        HStack {
                            Label("Low \(stats.minimum.formatted(.number.precision(.fractionLength(2)))) \(metric.unit)", systemImage: "arrow.down.to.line")
                            Spacer(minLength: 8)
                            Label("High \(stats.maximum.formatted(.number.precision(.fractionLength(2)))) \(metric.unit)", systemImage: "arrow.up.to.line")
                        }
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    }
                    // Re-created when the window or metric changes, which also clears the selection.
                    WaterLineChart(points: points, metric: metric, days: days, domain: chartDomain)
                        .id("\(days)-\(metric.rawValue)")
                }
                if let summary = summaries[metric] {
                    WaterSummarySection(summary: summary, metric: metric)
                }
                if !recentReadings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recent readings").font(.headline)
                        ForEach(recentReadings) { reading in WaterReadingRow(reading: reading) }
                    }
                }
            }
            .padding(16)
        }
        .task { await loadWaterData(force: false) }
        .refreshable { await loadWaterData(force: true) }
    }

    /// Fetches the longest range once; shorter ranges are derived locally.
    @MainActor
    private func loadWaterData(force: Bool) async {
        if !force, let cached = WaterDataCache.data(for: station.stationID) {
            rangesByDays = cached.ranges
            summaries = cached.summaries
            return
        }
        guard !isFetching, force || rangesByDays.isEmpty else { return }
        isFetching = true
        errorMessage = nil
        defer { isFetching = false }
        do {
            let fetchedReadings = try await APIClient.waterSeries(stationID: station.stationID, days: 30)
            let windowDays = ranges
            let prepared = await Task.detached(priority: .userInitiated) {
                PreparedWaterData(readings: fetchedReadings, windowDays: windowDays)
            }.value
            WaterDataCache.entries[station.stationID] = (.now, prepared)
            rangesByDays = prepared.ranges
            summaries = prepared.summaries
        } catch {
            // Keep showing existing data on a failed refresh.
            if rangesByDays.isEmpty { errorMessage = error.localizedDescription }
        }
    }
}

/// The water line chart. It owns the selection, so dragging redraws only the chart, not the panel below it.
struct WaterLineChart: View {
    let points: [WaterPoint]
    let metric: WaterMetric
    let days: Int
    let domain: ClosedRange<Double>
    @State private var selectedPoint: WaterPoint?

    var body: some View {
        Chart {
            ForEach(points) { point in
                LineMark(x: .value("Time", point.time), y: .value(metric.title, point.value))
                    .foregroundStyle(metric.color)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
            }
            // Outside the loop: one selection line, not one per point.
            if let selectedPoint {
                RuleMark(x: .value("Selected time", selectedPoint.time))
                    .foregroundStyle(.secondary.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, spacing: 8) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(selectedPoint.time.formatted(date: .abbreviated, time: .shortened))
                            Text("\(selectedPoint.value.formatted(.number.precision(.fractionLength(2)))) \(metric.unit)")
                                .fontWeight(.semibold)
                        }
                        .font(.caption)
                        .padding(8)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                    }
            }
        }
        .chartYScale(domain: domain)
        .chartYAxisLabel(metric.unit)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine()
                AxisValueLabel(format: days == 1 ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
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
                                      point.time != selectedPoint?.time else { return }
                                selectedPoint = point
                            }
                    )
            }
        }
        .frame(height: 245)
        .background {
            RoundedRectangle(cornerRadius: 14)
                .fill(Theme.surface)
        }
    }
}

struct WaterSummarySection: View {
    let summary: WaterMetricSummary
    let metric: WaterMetric

    private func formatted(_ value: Double, signed: Bool = false) -> String {
        let number = value.formatted(.number.precision(.fractionLength(2)).sign(strategy: signed ? .always(includingZero: false) : .automatic))
        return "\(number) \(metric.unit)"
    }

    private var averageComparison: String {
        let difference = summary.latest - summary.average
        if summary.isSteady(difference) { return "Now near average" }
        return "Now \(formatted(abs(difference))) \(difference > 0 ? "above" : "below")"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Conditions").font(.headline)
                Spacer(minLength: 8)
                (Text("Updated ") + Text(summary.latestTime, style: .relative) + Text(" ago"))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    changeTile(title: "Last 24 hours", change: summary.change24h)
                    changeTile(title: "Last 7 days", change: summary.change7d)
                }
                GridRow {
                    SummaryTile(title: "30-day average", value: formatted(summary.average), detail: averageComparison)
                        .gridCellColumns(2)
                }
                GridRow {
                    rangeTile.gridCellColumns(2)
                }
            }
        }
    }

    private func changeTile(title: String, change: Double?) -> some View {
        guard let change else {
            return SummaryTile(title: title, value: "—", detail: "Not enough data")
        }
        if summary.isSteady(change) {
            return SummaryTile(title: title, value: formatted(change, signed: true), detail: "Steady", systemImage: "arrow.right")
        }
        return SummaryTile(
            title: title,
            value: formatted(change, signed: true),
            detail: change > 0 ? "Rising" : "Falling",
            systemImage: change > 0 ? "arrow.up.right" : "arrow.down.right"
        )
    }

    private var rangeTile: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("30-day range").font(.caption).foregroundStyle(.secondary)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(metric.color.opacity(0.18))
                    Circle()
                        .fill(metric.color)
                        .frame(width: 12, height: 12)
                        .offset(x: (geometry.size.width - 12) * summary.positionInRange)
                }
            }
            .frame(height: 12)
            HStack {
                Text("Low \(formatted(summary.low))")
                Spacer(minLength: 8)
                Text("High \(formatted(summary.high))")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 12)
        .accessibilityElement(children: .combine)
        .accessibilityValue("Current \(formatted(summary.latest))")
    }
}

struct SummaryTile: View {
    let title: String
    let value: String
    let detail: String
    var systemImage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                if let systemImage {
                    Image(systemName: systemImage).font(.caption.weight(.bold))
                }
                Text(value).font(.subheadline.weight(.semibold)).monospacedDigit()
            }
            Text(detail).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 12)
        .accessibilityElement(children: .combine)
    }
}

struct WaterReadingRow: View {
    let reading: WaterSeriesReading

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(reading.formattedTime).font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                if let level = reading.waterLevel {
                    Text("\(level.formatted(.number.precision(.fractionLength(2)))) m").font(.caption.weight(.semibold))
                }
                if let discharge = reading.discharge {
                    Text("\(discharge.formatted(.number.precision(.fractionLength(2)))) m³/s")
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 10)
            Divider()
        }
    }
}
