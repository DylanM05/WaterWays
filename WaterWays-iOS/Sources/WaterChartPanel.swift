import Charts
import SwiftUI

enum WaterMetric: String, CaseIterable, Identifiable {
    case waterLevel, discharge
    var id: String { rawValue }
    var title: String { self == .waterLevel ? "Level" : "Flow" }
    var unit: String { self == .waterLevel ? "m" : "m³/s" }
    var color: Color { self == .waterLevel ? Theme.accent : Theme.flow }
    func decimals(for value: Double) -> Int { self == .waterLevel ? 2 : WaterFormat.flowDecimals(value) }
    func format(_ value: Double) -> String { WaterFormat.number(value, decimals: decimals(for: value)) }
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
    let lowTime: Date
    let highTime: Date

    init?(_ samples: [(time: Date, value: Double, low: Double, high: Double)]) {
        let values = samples.map(\.value)
        guard let last = samples.last,
              let lowest = samples.min(by: { $0.low < $1.low }),
              let highest = samples.max(by: { $0.high < $1.high }) else { return nil }
        latest = last.value
        latestTime = last.time
        average = values.reduce(0, +) / Double(values.count)
        low = lowest.low
        high = highest.high
        lowTime = lowest.time
        highTime = highest.time
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

/// The Water tab: the latest level and flow with a staff gauge, the readings chart, the 30-day conditions, and
/// the readings themselves, newest first.
struct WaterTab: View {
    let station: RiverStation
    let refreshToken: Int
    @State private var days = 30
    @State private var chosenMetric: WaterMetric?
    @State private var errorMessage: String?
    @State private var isFetching = false
    @State private var rangesByDays: [Int: PreparedWaterRange] = [:]
    @State private var summaries: [WaterMetric: WaterMetricSummary] = [:]
    @State private var loaded = false
    private static let windows = [1, 3, 7, 14, 30]

    private var metrics: [WaterMetric] { WaterMetric.allCases.filter { summaries[$0] != nil } }
    private var metric: WaterMetric? {
        if let chosenMetric, summaries[chosenMetric] != nil { return chosenMetric }
        return metrics.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let errorMessage {
                WaterMessage(title: "Couldn’t load this station’s readings", detail: errorMessage) {
                    Task { await load(force: true) }
                }
            } else if !loaded {
                ProgressView("Loading readings")
                    .frame(maxWidth: .infinity, minHeight: 220)
            } else if let metric {
                NowCard(level: summaries[.waterLevel], flow: summaries[.discharge])
                chartCard(metric)
                ConditionsCard(summaries: summaries, metrics: metrics)
                ReadingsCard(readings: rangesByDays[30]?.readings ?? [], metrics: metrics)
            } else if station.realtime == false {
                WaterMessage(title: "No live readings", detail: "This station doesn’t send real-time data. Older records may be in History.")
            } else {
                WaterMessage(title: "No readings in the past 30 days", detail: "This station hasn’t reported recently. Older records may be in History.")
            }
        }
        .task(id: refreshToken) { await load(force: refreshToken > 0) }
    }

    private func chartCard(_ metric: WaterMetric) -> some View {
        let range = rangesByDays[days]
        let points = metric == .waterLevel ? range?.waterLevelPoints ?? [] : range?.dischargePoints ?? []
        let bounds = metric == .waterLevel ? range?.waterLevelBounds : range?.dischargeBounds
        return VStack(alignment: .leading, spacing: 12) {
            Text(Self.windowTitle(days)).font(.display(18)).foregroundStyle(Theme.ink)
            ViewThatFits(in: .horizontal) {
                HStack {
                    metricPicker
                    Spacer(minLength: 8)
                    windowChips
                }
                VStack(alignment: .leading, spacing: 10) {
                    metricPicker
                    windowChips
                }
            }
            if points.isEmpty {
                Text("No \(metric.title.lowercased()) readings in this period")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink2)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else if let bounds {
                let padding = max((bounds.maximum - bounds.minimum) * 0.12, abs(bounds.maximum) * 0.002, 0.005)
                // Re-created when the window or metric changes, which also clears the selection.
                WaterLineChart(points: points, metric: metric, days: days, domain: (bounds.minimum - padding)...(bounds.maximum + padding))
                    .id("\(days)-\(metric.rawValue)")
            }
        }
        .padding(16)
        .cardBackground()
    }

    @ViewBuilder
    private var metricPicker: some View {
        if metrics.count > 1, let metric {
            SegmentedPills(
                options: metrics.map { ($0, $0.title) },
                selection: Binding(get: { metric }, set: { chosenMetric = $0 })
            )
        }
    }

    private var windowChips: some View {
        HStack(spacing: 4) {
            ForEach(Self.windows, id: \.self) { window in
                let selected = window == days
                Button { days = window } label: {
                    Text("\(window)d")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(selected ? Theme.bg : Theme.ink2)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(selected ? Theme.ink : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Self.windowTitle(window))
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private static func windowTitle(_ days: Int) -> String {
        days == 1 ? "Past 24 hours" : "Past \(days) days"
    }

    /// Fetches the longest window once; shorter ones are sliced from it.
    @MainActor
    private func load(force: Bool) async {
        if !force, let cached = WaterDataCache.data(for: station.stationID) {
            rangesByDays = cached.ranges
            summaries = cached.summaries
            loaded = true
            return
        }
        guard !isFetching else { return }
        isFetching = true
        defer { isFetching = false }
        do {
            let fetchedReadings = try await APIClient.waterSeries(stationID: station.stationID, days: 30)
            let windowDays = Self.windows
            let prepared = await Task.detached(priority: .userInitiated) {
                PreparedWaterData(readings: fetchedReadings, windowDays: windowDays)
            }.value
            WaterDataCache.entries[station.stationID] = (.now, prepared)
            rangesByDays = prepared.ranges
            summaries = prepared.summaries
            errorMessage = nil
            loaded = true
        } catch where !error.isCancellation {
            // Keep showing existing data on a failed refresh.
            if !loaded { errorMessage = error.localizedDescription }
        } catch {}
    }
}

private struct WaterMessage: View {
    let title: String
    let detail: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.ink)
            Text(detail).font(.system(size: 14)).foregroundStyle(Theme.ink2)
            if let retry {
                Button("Try Again", action: retry)
                    .buttonStyle(.bordered)
                    .padding(.top, 6)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}

/// The latest reading: the level (or the flow, at stations that only measure flow) large, its change over 24
/// hours, the flow beside it, and a staff gauge of the level against its 30-day range.
private struct NowCard: View {
    let level: WaterMetricSummary?
    let flow: WaterMetricSummary?

    var body: some View {
        let metric: WaterMetric = level != nil ? .waterLevel : .discharge
        if let lead = level ?? flow {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(metric.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.ink2)
                    ReadingNumber(value: metric.format(lead.latest), unit: metric.unit, size: 54)
                    ChangePill(change: lead.change24h, latest: lead.latest, metric: metric)
                    if level != nil, let flow {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("Flow")
                            Text(WaterMetric.discharge.format(flow.latest))
                                .font(.number(16))
                                .foregroundStyle(Theme.ink)
                            Text(WaterMetric.discharge.unit)
                        }
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink2)
                        .padding(.top, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let level {
                    StaffGauge(value: level.latest, low: level.low, high: level.high)
                }
            }
            .padding(18)
            .cardBackground()
        }
    }
}

/// "↑ 0.18 m in 24 h" on the accent when rising, or on the sunk colour when falling or steady.
private struct ChangePill: View {
    let change: Double?
    let latest: Double
    let metric: WaterMetric

    var body: some View {
        if let change {
            let decimals = metric.decimals(for: latest)
            let steady = (abs(change) * pow(10, Double(decimals))).rounded() == 0
            let rising = !steady && change > 0
            let amount = WaterFormat.number(abs(change), decimals: decimals)
            HStack(spacing: 5) {
                Image(systemName: steady ? "minus" : rising ? "arrow.up" : "arrow.down")
                    .font(.system(size: 11, weight: .bold))
                Text(steady ? "Steady over 24 h" : "\(amount) \(metric.unit) in 24 h")
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(rising ? Theme.accent : Theme.ink2)
            .padding(.leading, 9)
            .padding(.trailing, 11)
            .frame(height: 26)
            .background(rising ? Theme.accentSoft : Theme.sunk, in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(steady ? "Steady over 24 hours" : "\(rising ? "Up" : "Down") \(amount) \(metric.unit) in the past 24 hours")
        }
    }
}

/// A staff gauge like the enamel plates at gauging stations: E marks every 10 cm on alternating sides, red at
/// each whole metre with that metre's numeral, water up to the current level, a tag on the left with the level
/// now, and the 30-day range as a bar on the right with its two ends labelled. Ported from the website's
/// StaffGauge.jsx; the scale runs about 0.1 m beyond the range.
struct StaffGauge: View {
    let value: Double
    let low: Double
    let high: Double
    var height: CGFloat = 196
    var plate: CGFloat = 30
    var fontSize: CGFloat = 12

    private var valueText: String { String(format: "%.2f", value) }
    private var highText: String { String(format: "%.2f", high) }
    private var lowText: String { String(format: "%.2f", low) }
    private var tagWidth: CGFloat { max(44, CGFloat(valueText.count) * 7.2 + 14) }
    private var labelWidth: CGFloat { max(60, CGFloat(5 + max(highText.count, lowText.count)) * 6.6 + 6) }
    private var left: CGFloat { tagWidth + 7 }
    private var barX: CGFloat { left + plate + 9 }
    private var width: CGFloat { barX + 4 + 10 + labelWidth }

    var body: some View {
        Canvas { context, _ in draw(in: context) }
            .frame(width: width, height: height)
            .accessibilityElement()
            .accessibilityLabel("Staff gauge: \(valueText) m now; 30-day high \(highText) m, low \(lowText) m")
    }

    private func draw(in context: GraphicsContext) {
        let pad = max(0.1, (high - low) * 0.08)
        let minimum = min(low, value) - pad
        let maximum = max(high, value) + pad
        let top: CGFloat = 10
        let plateHeight = height - 20
        let half = plate / 2
        func y(_ v: Double) -> CGFloat { top + plateHeight * CGFloat(1 - (v - minimum) / (maximum - minimum)) }

        let plateRect = CGRect(x: left, y: top, width: plate, height: plateHeight)
        let platePath = Path(roundedRect: plateRect, cornerRadius: 2)
        context.fill(platePath, with: .color(Theme.gaugePlate))
        context.stroke(platePath, with: .color(Theme.line), lineWidth: 1)

        var inside = context
        inside.clip(to: platePath)
        // Marks are drawn every decimetre while they stay readable; a tall range draws every half metre or metre.
        let pxPerDm = plateHeight / CGFloat((maximum - minimum) * 10)
        let step = pxPerDm >= 3 ? 1 : pxPerDm * 5 >= 3 ? 5 : 10
        let pxPerCm = pxPerDm / 10
        var d = Int(floor(minimum * 10))
        while Double(d) < maximum * 10 {
            defer { d += 1 }
            guard d % step == 0 else { continue }
            let v0 = Double(d) / 10
            let onLeft = (d / step) % 2 == 0
            let metre = d % 10 == 0
            let colour = metre ? Theme.gauge : Theme.gaugeMark
            let x0 = onLeft ? left + 3 : left + half + 1
            let x1 = onLeft ? left + half - 1 : left + plate - 3
            func bar(_ x: CGFloat, _ w: CGFloat, _ a: Double, _ b: Double) {
                inside.fill(Path(CGRect(x: x, y: y(b), width: w, height: max(0.9, y(a) - y(b)))), with: .color(colour))
            }
            if step == 1 && pxPerCm >= 1.5 {
                // An E: the spine, then three 1 cm bars.
                let spine = max(1.6, (x1 - x0) * 0.24)
                bar(onLeft ? x1 - spine : x0, spine, v0, v0 + 0.05)
                bar(x0, x1 - x0, v0, v0 + 0.01)
                bar(x0, x1 - x0, v0 + 0.02, v0 + 0.03)
                bar(x0, x1 - x0, v0 + 0.04, v0 + 0.05)
            } else {
                bar(x0, x1 - x0, v0, v0 + min(0.05, Double(step) / 20))
            }
            if metre {
                // Long numerals (lake levels above sea level, say) shrink to stay inside their half of the plate.
                let numeral = "\(d / 10)"
                let size = min(fontSize, (half - 3) / (0.62 * CGFloat(numeral.count)))
                inside.draw(
                    Text(numeral).font(.display(size, weight: 800, relativeTo: .caption2)).foregroundStyle(Theme.gauge),
                    at: CGPoint(x: onLeft ? left + half * 1.5 : left + half * 0.5, y: y(v0 + 0.025)),
                    anchor: .center
                )
            }
        }
        let waterY = y(value)
        inside.fill(Path(CGRect(x: left, y: waterY, width: plate, height: top + plateHeight - waterY)), with: .color(Theme.accent.opacity(0.22)))
        inside.stroke(Path { $0.move(to: CGPoint(x: left, y: waterY)); $0.addLine(to: CGPoint(x: left + plate, y: waterY)) },
                      with: .color(Theme.accent), lineWidth: 1.8)

        context.stroke(Path { $0.move(to: CGPoint(x: left + plate, y: waterY)); $0.addLine(to: CGPoint(x: barX - 1, y: waterY)) },
                       with: .color(Theme.accent), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
        let tagY = min(max(waterY, 10.5), height - 10.5)
        context.fill(Path(roundedRect: CGRect(x: 0, y: tagY - 10.5, width: tagWidth, height: 21), cornerRadius: 4), with: .color(Theme.accent))
        context.fill(Path { path in
            path.addLines([CGPoint(x: tagWidth, y: tagY - 4), CGPoint(x: tagWidth + 5, y: tagY), CGPoint(x: tagWidth, y: tagY + 4)])
            path.closeSubpath()
        }, with: .color(Theme.accent))
        context.draw(Text(valueText).font(.system(size: 12, weight: .bold)).monospacedDigit().foregroundStyle(Theme.accentInk),
                     at: CGPoint(x: tagWidth / 2, y: tagY), anchor: .center)

        let highY = y(high), lowY = y(low)
        context.fill(Path(roundedRect: CGRect(x: barX, y: highY, width: 4, height: max(lowY - highY, 2)), cornerRadius: 2),
                     with: .color(Theme.ink3.opacity(0.45)))
        // Range labels sit level with the bar's ends, pushed apart when the range is too narrow for both.
        var highLabel = highY, lowLabel = lowY
        if lowLabel - highLabel < 15 {
            let middle = (highLabel + lowLabel) / 2
            highLabel = middle - 7.5
            lowLabel = middle + 7.5
        }
        highLabel = max(highLabel, 7)
        lowLabel = min(max(lowLabel, highLabel + 15), height - 6)
        func label(_ name: String, _ number: String) -> Text {
            Text("\(Text(name).foregroundStyle(Theme.ink2)) \(Text(number).fontWeight(.bold).foregroundStyle(Theme.ink))")
                .font(.system(size: 12, weight: .medium))
        }
        context.draw(label("High", highText).monospacedDigit(), at: CGPoint(x: barX + 12, y: highLabel), anchor: .leading)
        context.draw(label("Low", lowText).monospacedDigit(), at: CGPoint(x: barX + 12, y: lowLabel), anchor: .leading)
    }
}

/// The 24-hour and 7-day changes, average, low and high of each metric, side by side.
private struct ConditionsCard: View {
    let summaries: [WaterMetric: WaterMetricSummary]
    let metrics: [WaterMetric]

    private var latestTime: Date? { metrics.compactMap { summaries[$0]?.latestTime }.max() }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Conditions").font(.display(18)).foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if let latestTime {
                    Text(latestTime, format: .dateTime.month(.abbreviated).day().hour().minute())
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.ink3)
                }
            }
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 0) {
                GridRow {
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    ForEach(metrics) { metric in
                        Text(metric.title).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Theme.ink3)
                    }
                }
                .padding(.bottom, 6)
                row("24 h") { summary, metric in change(summary.change24h, summary, metric) }
                row("7 days") { summary, metric in change(summary.change7d, summary, metric) }
                row("30-day average") { summary, metric in
                    value(summary.average, metric, detail: averageComparison(summary, metric))
                }
                row("30-day low") { summary, metric in value(summary.low, metric, detail: Self.time(summary.lowTime)) }
                row("30-day high") { summary, metric in value(summary.high, metric, detail: Self.time(summary.highTime)) }
            }
        }
        .padding(16)
        .cardBackground()
    }

    private func row<Cell: View>(_ title: String, @ViewBuilder cell: @escaping (WaterMetricSummary, WaterMetric) -> Cell) -> some View {
        Group {
            Rectangle().fill(Theme.line).frame(height: 1).gridCellColumns(metrics.count + 1)
            GridRow(alignment: .firstTextBaseline) {
                Text(title).font(.system(size: 13.5)).foregroundStyle(Theme.ink2)
                ForEach(metrics) { metric in
                    if let summary = summaries[metric] { cell(summary, metric) }
                }
            }
            .padding(.vertical, 10)
        }
    }

    @ViewBuilder
    private func change(_ change: Double?, _ summary: WaterMetricSummary, _ metric: WaterMetric) -> some View {
        if change != nil {
            ChangeLabel(lead: LeadReading(value: summary.latest, isFlow: metric == .discharge, change: change))
        } else {
            Text("—").foregroundStyle(Theme.ink3).accessibilityLabel("Not enough readings")
        }
    }

    private func value(_ value: Double, _ metric: WaterMetric, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ReadingNumber(value: metric.format(value), unit: metric.unit, size: 16)
            Text(detail).font(.system(size: 11.5)).foregroundStyle(Theme.ink3)
        }
    }

    private func averageComparison(_ summary: WaterMetricSummary, _ metric: WaterMetric) -> String {
        let difference = summary.latest - summary.average
        if (abs(difference) * pow(10, Double(metric.decimals(for: summary.latest)))).rounded() == 0 { return "Near average" }
        return difference > 0 ? "Above average" : "Below average"
    }

    private static func time(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }
}

/// Every reading of the past 30 days, newest first, a page at a time.
private struct ReadingsCard: View {
    let readings: [WaterSeriesReading]
    let metrics: [WaterMetric]
    @State private var shown = 10

    private var rows: [WaterSeriesReading] {
        readings.filter { reading in metrics.contains { $0.value(reading) != nil } }.reversed()
    }

    var body: some View {
        let rows = rows
        VStack(alignment: .leading, spacing: 0) {
            Text("Readings").font(.display(18)).foregroundStyle(Theme.ink).padding(.bottom, 10)
            ForEach(rows.prefix(shown)) { reading in
                Rectangle().fill(Theme.line).frame(height: 1)
                HStack(spacing: 12) {
                    Text(reading.date.map { $0.formatted(.dateTime.month(.abbreviated).day().hour().minute()) } ?? reading.formattedTime)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(metrics) { metric in
                        Group {
                            if let value = metric.value(reading) {
                                ReadingNumber(value: metric.format(value), unit: metric.unit, size: 15)
                            } else {
                                Text("—").foregroundStyle(Theme.ink3)
                            }
                        }
                        .frame(minWidth: 72, alignment: .trailing)
                    }
                }
                .padding(.vertical, 9)
            }
            if rows.count > shown {
                Rectangle().fill(Theme.line).frame(height: 1)
                Button("Show more") { shown += 25 }
                    .font(.system(size: 14, weight: .semibold))
                    .tint(Theme.accent)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }
        }
        .padding(16)
        .cardBackground()
    }
}

/// The readings chart: a line over a tinted fill. It owns the selection, so dragging redraws only the chart.
struct WaterLineChart: View {
    let points: [WaterPoint]
    let metric: WaterMetric
    let days: Int
    let domain: ClosedRange<Double>
    @State private var selectedPoint: WaterPoint?

    var body: some View {
        Chart {
            ForEach(points) { point in
                AreaMark(x: .value("Time", point.time), yStart: .value("Base", domain.lowerBound), yEnd: .value(metric.title, point.value))
                    .foregroundStyle(LinearGradient(colors: [metric.color.opacity(0.22), metric.color.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Time", point.time), y: .value(metric.title, point.value))
                    .foregroundStyle(metric.color)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            // Outside the loop: one selection line, not one per point.
            if let selectedPoint {
                RuleMark(x: .value("Selected time", selectedPoint.time))
                    .foregroundStyle(Theme.ink3)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, spacing: 6, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(metric.format(selectedPoint.value)) \(metric.unit)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.ink)
                            Text(selectedPoint.time.formatted(.dateTime.month(.abbreviated).day().hour().minute()))
                                .font(.system(size: 11.5))
                                .foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .cardBackground(cornerRadius: 10)
                    }
                PointMark(x: .value("Selected time", selectedPoint.time), y: .value(metric.title, selectedPoint.value))
                    .foregroundStyle(metric.color)
                    .symbolSize(40)
            }
        }
        .chartYScale(domain: domain)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Theme.line)
                AxisValueLabel(format: days == 1 ? .dateTime.hour() : .dateTime.month(.abbreviated).day())
                    .foregroundStyle(Theme.ink3)
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Theme.line)
                AxisValueLabel().foregroundStyle(Theme.ink3)
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
        .frame(height: 220)
        .accessibilityLabel("\(metric.title) chart")
    }
}
