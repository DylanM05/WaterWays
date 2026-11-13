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
