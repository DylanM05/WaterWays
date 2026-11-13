import SwiftUI

struct MetricRow: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.caption.weight(.medium)).foregroundStyle(.secondary)
            Text(value).font(.title3.weight(.semibold)).textSelection(.enabled)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 14)
    }
}

struct ErrorState: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn’t load data", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
        }
    }
}

extension JSONValue {
    var displayEntries: [DisplayEntry]? {
        switch self {
        case .object(let values):
            return values.keys.sorted().map { DisplayEntry(title: $0, value: values[$0]?.summary ?? "—") }
        case .array(let values):
            guard let first = values.first, case .object(let fields) = first else {
                return values.isEmpty ? nil : [DisplayEntry(title: "Readings", value: "\(values.count) values")]
            }
            var entries = fields.keys.sorted().map { DisplayEntry(title: $0, value: fields[$0]?.summary ?? "—") }
            entries.insert(DisplayEntry(title: "Readings", value: "\(values.count) records"), at: 0)
            return entries
        default:
            return [DisplayEntry(title: "Reading", value: summary)]
        }
    }
}

struct DisplayEntry: Identifiable {
    let title: String
    let value: String
    var id: String { title }
}

/// The item nearest in time to `date`, for chart scrubbing. `items` must be sorted by time.
func nearest<Item>(_ items: [Item], to date: Date, time: (Item) -> Date) -> Item? {
    guard !items.isEmpty else { return nil }
    var low = 0
    var high = items.count - 1
    while low < high {
        let middle = (low + high) / 2
        if time(items[middle]) < date { low = middle + 1 } else { high = middle }
    }
    // `low` is the first item at or after `date`; the one before it may be closer.
    if low > 0, abs(time(items[low - 1]).timeIntervalSince(date)) <= abs(time(items[low]).timeIntervalSince(date)) {
        return items[low - 1]
    }
    return items[low]
}

/// The reading a card leads with: the level, or the flow at stations that only measure flow, with its change
/// over the last day.
struct LeadReading {
    let value: Double
    let unit: String
    let decimals: Int
    let isFlow: Bool
    let change: Double?

    init?(reading: LatestWaterReading, trend: WaterTrend?) {
        if let level = reading.waterLevel {
            (value, unit, decimals, isFlow, change) = (level, "m", 2, false, trend?.change.waterLevel)
        } else if let flow = reading.discharge {
            (value, unit, decimals, isFlow, change) = (flow, "m³/s", WaterFormat.flowDecimals(flow), true, trend?.change.discharge)
        } else {
            return nil
        }
    }

    /// A summary figure with its change; the decimals follow the value, as for a reading.
    init(value: Double, isFlow: Bool, change: Double?) {
        self.value = value
        self.isFlow = isFlow
        self.change = change
        unit = isFlow ? "m³/s" : "m"
        decimals = isFlow ? WaterFormat.flowDecimals(value) : 2
    }

    var formatted: String { WaterFormat.number(value, decimals: decimals) }
}

/// A value with its unit set small beside it, as in "3.42 m".
struct ReadingNumber: View {
    let value: String
    let unit: String
    var size: CGFloat = 28

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: size * 0.08) {
            Text(value).font(.number(size)).tracking(-size * 0.02)
                .minimumScaleFactor(0.5)
            Text(unit).font(.number(max(size * 0.42, 11), weight: 500)).foregroundStyle(Theme.ink2)
        }
        .foregroundStyle(Theme.ink)
        .lineLimit(1)
        .accessibilityElement(children: .combine)
    }
}

/// The change over 24 hours: an arrow and the amount, or "Steady". Rises are in the accent (the flow colour for
/// flows); falls stay neutral. Shows nothing when the change isn't known.
struct ChangeLabel: View {
    let lead: LeadReading
    var showsUnit = true

    var body: some View {
        if let change = lead.change {
            let steady = (abs(change) * pow(10, Double(lead.decimals))).rounded() == 0
            let amount = WaterFormat.number(abs(change), decimals: lead.decimals)
            HStack(spacing: 3) {
                Image(systemName: steady ? "minus" : change > 0 ? "arrow.up" : "arrow.down")
                    .font(.system(size: 11, weight: .bold))
                Text(steady ? "Steady" : showsUnit ? "\(amount) \(lead.unit)" : amount)
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(!steady && change > 0 ? (lead.isFlow ? Theme.flow : Theme.accent) : Theme.ink2)
            .lineLimit(1)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(steady ? "Steady over 24 hours" : "\(change > 0 ? "Up" : "Down") \(amount) \(lead.unit) in 24 hours")
        }
    }
}

/// "12 min ago", "3 h ago", "4 days ago", as on the website.
enum TimeAgo {
    static func label(_ date: Date, now: Date = .now) -> String {
        let minutes = Int((now.timeIntervalSince(date) / 60).rounded())
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 48 { return "\(hours) h ago" }
        return "\(Int((Double(hours) / 24).rounded())) days ago"
    }
}

/// A section title in the display face, with an optional control at the trailing edge.
struct SectionHeading<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.display(20)).tracking(-0.3).foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            trailing
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 10)
    }
}

extension SectionHeading where Trailing == EmptyView {
    init(_ title: String) {
        self.init(title: title) { EmptyView() }
    }
}

/// The v4 segmented control: options on a sunk track, the chosen one raised. `fill` stretches the options across
/// the width, as for a page's tabs.
struct SegmentedPills<Value: Hashable>: View {
    let options: [(value: Value, title: String)]
    @Binding var selection: Value
    var fill = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.value) { option in
                let selected = option.value == selection
                Button {
                    withAnimation(.snappy(duration: 0.2)) { selection = option.value }
                } label: {
                    Text(option.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(selected ? Theme.ink : Theme.ink2)
                        .lineLimit(1)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .frame(maxWidth: fill ? .infinity : nil)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Theme.surface)
                                    .shadow(color: .black.opacity(0.1), radius: 1.5, y: 1)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Theme.sunk, in: RoundedRectangle(cornerRadius: 11))
    }
}

extension WeatherCondition {
    /// A symbol for the server's description of current conditions ("Overcast", "Light rain").
    static func symbol(forDescription description: String, isDay: Bool) -> String {
        let text = description.lowercased()
        if text.contains("thunder") { return "cloud.bolt.rain.fill" }
        if text.contains("freezing") { return "cloud.sleet.fill" }
        if text.contains("snow") { return "cloud.snow.fill" }
        if text.contains("shower") { return isDay ? "cloud.sun.rain.fill" : "cloud.moon.rain.fill" }
        if text.contains("drizzle") { return "cloud.drizzle.fill" }
        if text.contains("heavy rain") { return "cloud.heavyrain.fill" }
        if text.contains("rain") { return "cloud.rain.fill" }
        if text.contains("fog") { return "cloud.fog.fill" }
        if text.contains("partly") { return isDay ? "cloud.sun.fill" : "cloud.moon.fill" }
        if text.contains("clear") || text.contains("sunny") { return isDay ? "sun.max.fill" : "moon.stars.fill" }
        return "cloud.fill"
    }
}

/// The colours for an alert, by Environment Canada's risk colour or, without one, its type.
struct AlertPalette {
    let mark: Color, on: Color, background: Color, line: Color, ink: Color

    init(_ alert: WeatherAlert?) {
        let colour = alert?.colour?.lowercased() ?? ""
        let level = colour.isEmpty ? (alert?.type == "warning" ? "red" : alert?.type == "watch" ? "orange" : "yellow") : colour
        switch level {
        case "red": (mark, on, background, line, ink) = (Theme.alertRed, Theme.alertRedOn, Theme.alertRedBg, Theme.alertRedLine, Theme.alertRedInk)
        case "orange": (mark, on, background, line, ink) = (Theme.warn, Theme.warnOn, Theme.warnBg, Theme.warnLine, Theme.warnInk)
        default: (mark, on, background, line, ink) = (Theme.alertYellow, Theme.alertYellowOn, Theme.alertYellowBg, Theme.alertYellowLine, Theme.alertYellowInk)
        }
    }
}

/// One station in a river's card: where it is and how old the reading is, the last day as a short line, and the
/// reading with its change.
struct StationRow: View {
    let station: RiverStation
    let readings: LatestReadings
    /// The readings request has finished (or failed) for this station.
    let loaded: Bool
    let failed: Bool

    private var reading: LatestWaterReading? { readings.readings[station.stationID] }
    private var trend: WaterTrend? { readings.trends[station.stationID] }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(station.displaySection)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.leading)
                Text(status)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.ink3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let reading, let lead = LeadReading(reading: reading, trend: trend) {
                let points = TrendPoint.points(from: trend, level: !lead.isFlow)
                if points.count > 1 {
                    TrendSparkline(
                        points: points,
                        minSpan: lead.isFlow ? max(abs(lead.value) * 0.04, 0.05) : 0.05,
                        label: "The past 24 hours",
                        height: 28
                    )
                    .frame(width: 64)
                }
                VStack(alignment: .trailing, spacing: 3) {
                    ReadingNumber(value: lead.formatted, unit: lead.unit, size: 19)
                    ChangeLabel(lead: lead, showsUnit: false)
                }
            } else if !loaded {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var status: String {
        readings.status(for: station, loaded: loaded, failed: failed)
    }
}

extension LatestReadings {
    /// The line under a station's name: how old its reading is, or why there isn't one.
    func status(for station: RiverStation, loaded: Bool, failed: Bool) -> String {
        if let date = readings[station.stationID]?.date { return TimeAgo.label(date) }
        guard loaded else { return station.stationID }
        if failed { return "Couldn’t load the reading" }
        // Seasonal or paused gauges: when they last sent data.
        if station.realtime != false, let label = lastReportedLabel(for: station.stationID) { return label }
        return station.noReadingMessage
    }
}

/// Rows stacked in one card with hairlines between them.
struct CardRows<Item: Identifiable, Row: View>: View {
    let items: [Item]
    @ViewBuilder let row: (Item) -> Row

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Rectangle().fill(Theme.line).frame(height: 1) }
                row(item)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .cardBackground()
    }
}
