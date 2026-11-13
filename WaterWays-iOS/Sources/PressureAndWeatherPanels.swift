import Foundation

struct PressurePoint: Identifiable {
    let time: Date
    let value: Double
    var id: Date { time }
}

/// Pressure now from the server's hourly series (GMT times): the hour nearest now and the change since three
/// hours before it. The Weather tab and the Saved tab's weather use the same rule.
enum PressureNow {
    static func points(_ values: [Double?]?, times: [String]?) -> [PressurePoint] {
        (values ?? []).enumerated().compactMap { index, value in
            guard let value, let times, index < times.count,
                let time = StationDate.parse(times[index], format: "MMMM d yyyy, h:mm:ss a", timeZone: TimeZone(identifier: "UTC")!) else { return nil }
            return PressurePoint(time: time, value: value)
        }
    }

    static func current(_ values: [Double?]?, times: [String]?, now: Date = .now) -> (value: Double, change3h: Double?)? {
        current(points(values, times: times), now: now).map { ($0.point.value, $0.change3h) }
    }

    /// The same rule over hours already parsed (in time order), with the hour it picked.
    static func current(_ hours: [PressurePoint], now: Date = .now) -> (point: PressurePoint, change3h: Double?)? {
        guard let latest = nearest(hours, to: now, time: \.time), abs(latest.time.timeIntervalSince(now)) <= 60 * 60 else { return nil }
        let earlier = nearest(hours, to: latest.time.addingTimeInterval(-3 * 60 * 60), time: \.time)
        let change = earlier.flatMap { abs($0.time.timeIntervalSince(latest.time) + 3 * 60 * 60) <= 60 * 60 ? latest.value - $0.value : nil }
        return (latest, change)
    }

    /// Steady under 0.5 hPa in three hours; 3 hPa or more is a rapid change.
    static func tendency(_ change: Double) -> String {
        if abs(change) < 0.5 { return "Steady" }
        return "\(abs(change) >= 3 ? "Rapidly " : "")\(change > 0 ? "rising" : "falling")".capitalizedFirst
    }
}

private extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
