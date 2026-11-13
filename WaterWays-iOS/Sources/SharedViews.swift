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
