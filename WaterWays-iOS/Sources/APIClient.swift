import Foundation

struct Province: Hashable, Identifiable {
    let name: String
    let code: String

    var id: String { code }
    var isTerritory: Bool { ["NT", "NU", "YT"].contains(code) }

    static let all: [Province] = [
        Province(name: "Alberta", code: "AB"),
        Province(name: "British Columbia", code: "BC"),
        Province(name: "Manitoba", code: "MB"),
        Province(name: "New Brunswick", code: "NB"),
        Province(name: "Newfoundland and Labrador", code: "NL"),
        Province(name: "Northwest Territories", code: "NT"),
        Province(name: "Nova Scotia", code: "NS"),
        Province(name: "Nunavut", code: "NU"),
        Province(name: "Ontario", code: "ON"),
        Province(name: "Prince Edward Island", code: "PE"),
        Province(name: "Quebec", code: "QC"),
        Province(name: "Saskatchewan", code: "SK"),
        Province(name: "Yukon", code: "YT")
    ]
}

extension String {
    /// Small English words stay lower case inside a name. French articles are left capitalized, because names
    /// such as "Lac La Ronge" keep them.
    private static let minorTitleWords: Set<String> = ["a", "above", "an", "and", "at", "below", "by", "from", "in", "near", "of", "on", "the", "to"]

    /// Government station data is mostly all caps; show it in title case for readability:
    /// "FRASER RIVER AT HOPE" becomes "Fraser River at Hope".
    var displayTitle: String {
        guard self == uppercased() else { return self }
        let words = lowercased().capitalized(with: Locale(identifier: "en_CA")).split(separator: " ", omittingEmptySubsequences: false)
        return words.enumerated().map { index, word in
            index > 0 && Self.minorTitleWords.contains(word.lowercased()) ? word.lowercased() : String(word)
        }.joined(separator: " ")
    }
}

struct RiverStation: Codable, Hashable, Identifiable {
    let stationName: String
    let stationID: String
    let province: String
    let latitude: String?
    let longitude: String?
    let section: String?
    /// False when Environment Canada's catalogue lists no real-time feed for the station; nil when unknown.
    var realtime: Bool? = nil

    var id: String { stationID }
    var displayName: String { stationName.displayTitle }
    var displaySection: String {
        guard let section, !section.isEmpty else { return displayName }
        return section.displayTitle
    }

    enum CodingKeys: String, CodingKey {
        case stationName
        case stationID = "station_id"
        case province
        case latitude
        case longitude
        case section
        case realtime
    }
}

extension RiverStation {
    /// What to show when a station has no recent reading.
    var noReadingMessage: String { realtime == false ? "No live readings" : "No recent readings" }
}

struct SearchResult: Decodable, Identifiable {
    let stationName: String
    let stationID: String
    let province: String

    var id: String { stationID }
    var station: RiverStation {
        RiverStation(stationName: stationName, stationID: stationID, province: province, latitude: nil, longitude: nil, section: nil)
    }

    enum CodingKeys: String, CodingKey {
        case stationName
        case stationID = "station_id"
        case province
    }
}

struct FavoriteRecord: Decodable, Identifiable {
    let stationID: String
    let favoriteType: String?
    let stationName: String?
    let province: String?
    let riverName: String?
    let stations: [FavoriteStationRecord]?
    var id: String { stationID }

    enum CodingKeys: String, CodingKey {
        case stationID = "stationId"
        case favoriteType
        case stationName
        case province
        case riverName
        case stations
    }
}

struct FavoriteStationRecord: Decodable {
    let stationID: String
    let stationName: String?
    let province: String?
    let latitude: String?
    let longitude: String?
    let section: String?

    enum CodingKeys: String, CodingKey {
        case stationID = "stationId"
        case stationName
        case province
        case latitude
        case longitude
        case section
    }
}

struct SubscriptionStatus: Decodable {
    let subscribed: Bool
    let plan: String?
    let source: String?
    let expiresAt: String?
    let cancelAtPeriodEnd: Bool?

    enum CodingKeys: String, CodingKey {
        case subscribed
        case plan
        case source
        case expiresAt
        case cancelAtPeriodEnd
    }
}

private struct AppleAccountTokenResponse: Decodable {
    let appAccountToken: String
}

struct SavedUserSettings: Codable {
    var temperatureUnit: String
    var distanceUnit: String
    var timeFormat: String
    var defaultTab: String
    var theme: String

    static let defaults = SavedUserSettings(
        temperatureUnit: "celsius",
        distanceUnit: "metric",
        timeFormat: "12h",
        defaultTab: "water",
        theme: "light"
    )
}

private struct SettingsResponse: Decodable {
    let settings: SavedUserSettings?
}

struct LatestReadings: Decodable, Sendable {
    var readings: [String: LatestWaterReading]
    var lastReported: [String: String]
    /// Each reporting station's last day, from servers with the includeTrend option.
    var trends: [String: WaterTrend] = [:]

    enum CodingKeys: String, CodingKey {
        case readings
        case lastReported
        case trends
    }

    /// "Last reported Sep 30, 2026", or "Last reported Aug 2024" when only the month is known.
    func lastReportedLabel(for stationID: String) -> String? {
        guard let value = lastReported[stationID] else { return nil }
        // The server sends UTC calendar dates; format them in UTC so they don't shift a day.
        let utc = TimeZone(identifier: "UTC")!
        if value.count == 7, let month = StationDate.parse(value, format: "yyyy-MM", timeZone: utc) {
            return "Last reported \(month.formatted(Date.FormatStyle(timeZone: utc).month(.abbreviated).year()))"
        }
        guard let date = StationDate.parse(value, format: "yyyy-MM-dd", timeZone: utc) else { return nil }
        return "Last reported \(date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: utc)))"
    }
}

extension LatestReadings {
    /// Servers without the includeLastReported option send the readings map on its own; accept both, so an
    /// app talking to an older server still shows readings.
    init(from decoder: Decoder) throws {
        let container = try? decoder.container(keyedBy: CodingKeys.self)
        if let container, container.contains(.readings) {
            readings = try container.decode([String: LatestWaterReading].self, forKey: .readings)
            lastReported = try container.decodeIfPresent([String: String].self, forKey: .lastReported) ?? [:]
            // Trends are extra; one that can't be read never costs the readings.
            trends = (try? container.decodeIfPresent([String: WaterTrend].self, forKey: .trends)) ?? [:]
        } else {
            readings = try decoder.singleValueContainer().decode([String: LatestWaterReading].self)
            lastReported = [:]
            trends = [:]
        }
    }
}

/// A station's last day: hourly means over the 24 hours up to its newest reading, oldest first, and the
/// change across them (nil when the readings span less than 20 hours).
struct WaterTrend: Decodable, Sendable {
    struct Change: Decodable, Sendable {
        let waterLevel: Double?
        let discharge: Double?

        enum CodingKeys: String, CodingKey {
            case waterLevel = "water_level"
            case discharge
        }
    }

    struct Hour: Decodable, Sendable {
        let dateTime: String
        let waterLevel: Double?
        let discharge: Double?

        enum CodingKeys: String, CodingKey {
            case dateTime = "date_time"
            case waterLevel = "water_level"
            case discharge
        }
    }

    let change: Change
    let hourly: [Hour]
}

struct LatestWaterReading: Decodable, Sendable {
    let dateTime: String
    let waterLevel: Double?
    let discharge: Double?

    /// When the reading was taken; the server sends UTC.
    var date: Date? {
        StationDate.parse(dateTime, format: "yyyy-MM-dd HH:mm:ss", timeZone: TimeZone(identifier: "UTC")!)
    }

    var formattedTime: String {
        guard let date else {
            return dateTime.replacingOccurrences(of: "\u{00a0}", with: " ")
        }
        return Self.displayFormatter.string(from: date)
    }

    private static let displayFormatter = StationDate.displayFormatter(dateStyle: .long)

    enum CodingKeys: String, CodingKey {
        case dateTime = "date_time"
        case waterLevel = "water_level"
        case discharge
    }
}

/// Averaged archive data from /details/water-history. Seasonal responses use `month` instead of `date`.
struct WaterHistory: Decodable, Sendable {
    struct Point: Decodable, Identifiable, Sendable {
        let date: String?
        let month: Int?
        let average: Double
        let low: Double
        let high: Double
        let count: Int?
        let lowYear: Int?
        let highYear: Int?

        var id: String { date ?? "month-\(month ?? 0)" }
    }

    struct Summary: Decodable, Sendable {
        let average: Double
        let low: Double
        let lowDate: String
        let high: Double
        let highDate: String
    }

    struct Coverage: Decodable, Sendable {
        let earliest: String?
        let latest: String?
    }

    let interval: String
    let coverage: Coverage
    let summary: Summary?
    let points: [Point]
    let recent: [Point]?
}

/// An Environment Canada weather alert covering a station (/details/alerts).
struct WeatherAlert: Decodable, Identifiable, Sendable {
    let type: String?
    let name: String
    let colour: String?
    let area: String?
    let issued: String?
    let expires: String?
    let eventEnds: String?
    let text: String

    var id: String { "\(name)|\(issued ?? "")" }
    /// "rainfall warning" -> "Rainfall warning"
    var title: String { name.prefix(1).uppercased() + name.dropFirst() }

    private static let parser: ISO8601DateFormatter = {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser
    }()

    static func date(_ value: String?) -> Date? {
        value.flatMap { parser.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) }
    }
}

private struct WeatherAlertsResponse: Decodable {
    let alerts: [WeatherAlert]
}

/// Official record highs and lows from Environment Canada's yearly peaks (/details/water-records).
struct WaterRecords: Decodable, Sendable {
    struct Extreme: Decodable, Sendable {
        let value: Double
        let date: String
    }

    struct Metric: Decodable, Sendable {
        let recordHigh: Extreme?
        let recordLow: Extreme?
        let typicalHigh: Double?
        let typicalLow: Double?
        let firstYear: Int?
        let lastYear: Int?
        let years: Int
    }

    let waterLevel: Metric?
    let discharge: Metric?

    enum CodingKeys: String, CodingKey {
        case waterLevel = "water_level"
        case discharge
    }
}

struct WaterSeriesReading: Decodable, Identifiable, Sendable {
    let dateTime: String
    let waterLevel: Double?
    let discharge: Double?
    // Readings older than a week are hourly averages; these carry each hour's own low and high.
    let waterLevelMin: Double?
    let waterLevelMax: Double?
    let dischargeMin: Double?
    let dischargeMax: Double?

    var id: String { dateTime }
    var date: Date? {
        // The backend serializes hydrometric timestamps in UTC.
        StationDate.parse(dateTime, format: "yyyy-MM-dd HH:mm:ss", timeZone: TimeZone(identifier: "UTC")!)
    }
    var formattedTime: String {
        guard let date else { return dateTime }
        return Self.displayFormatter.string(from: date)
    }

    private static let displayFormatter = StationDate.displayFormatter(dateStyle: .medium)

    enum CodingKeys: String, CodingKey {
        case dateTime = "date_time"
        case waterLevel = "water_level"
        case discharge
        case waterLevelMin = "water_level_min"
        case waterLevelMax = "water_level_max"
        case dischargeMin = "discharge_min"
        case dischargeMax = "discharge_max"
    }
}

enum StationDate {
    static func parse(_ value: String, format: String, timeZone: TimeZone = .current) -> Date? {
        let normalized = value
            .replacingOccurrences(of: "\u{00a0}", with: " ")
            .replacingOccurrences(of: "(?<=\\d)(st|nd|rd|th)", with: "", options: .regularExpression)
        return parser(format: format, timeZone: timeZone).date(from: normalized)
    }

    /// Times shown to the user, in the device's time zone (following changes while the app runs).
    static func displayFormatter(dateStyle: DateFormatter.Style) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateStyle = dateStyle
        formatter.timeStyle = .short
        return formatter
    }

    // Building a DateFormatter is slow and charts parse a date per point, so each format is built once.
    // Parsing can run off the main thread, hence the lock.
    private static let lock = NSLock()
    private static var parsers: [String: DateFormatter] = [:]

    private static func parser(format: String, timeZone: TimeZone) -> DateFormatter {
        let key = "\(format)|\(timeZone.identifier)"
        lock.lock()
        defer { lock.unlock() }
        if let cached = parsers[key] { return cached }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        parsers[key] = formatter
        return formatter
    }
}

struct PressureSeries: Decodable {
    let time: [String]
    let surfacePressure: [Double?]
    let pressureMsl: [Double?]
}

struct CurrentWeather: Decodable {
    let weather: String
    let temperature: Double
    let apparentTemperature: Double?
    let humidity: Double?
    let precipitation: CurrentPrecipitation?
    let pressure: CurrentPressure?
    let wind: Double?
    let windDirection: String?
    let windGusts: Double?
    let cloudCover: Double?
    let isDay: Int?
    let time: String?
}

struct CurrentPrecipitation: Decodable {
    let total: Double
    let type: String?
}

struct CurrentPressure: Decodable {
    let msl: Double?
    let surface: Double?
}

struct HourlyForecast: Decodable {
    let time: [String]
    let temperature: [Double?]
    let weatherCode: [Int?]
    let relativeHumidity: [Double?]
    let apparentTemperature: [Double?]
    let precipitationProbability: [Double?]
    // Added with the station-local time zone backend change; absent from older servers.
    let rawTime: [String]?
    let utcOffsetSeconds: Int?
    let timezone: String?
    let precipitation: [Double?]?
    let windSpeed: [Double?]?
    let windGusts: [Double?]?
    let windDirection: [Double?]?
    let isDay: [Int?]?
}

struct WeeklyForecast: Decodable {
    let dates: [String]
    let rawDates: [String]
    let utcOffsetSeconds: Int?
    let timezone: String?
    let weather: WeeklyWeather
    let temperature: WeeklyTemperature
    let precipitation: WeeklyPrecipitation
    let wind: WeeklyWind
    let uv: WeeklyUV
    let sun: WeeklySun
}

struct WeeklyWeather: Decodable {
    let codes: [Int]
    let descriptions: [String]
}

struct WeeklyTemperature: Decodable {
    let maximum: [Double]
    let minimum: [Double]

    enum CodingKeys: String, CodingKey {
        case maximum = "max"
        case minimum = "min"
    }
}

struct WeeklyPrecipitation: Decodable {
    let total: [Double]
    let probability: [Double?]?
}

struct WeeklyWind: Decodable {
    let maximumSpeed: [Double]
    let maximumGusts: [Double?]?
    let dominantDirection: [Double?]?

    enum CodingKeys: String, CodingKey {
        case maximumSpeed = "maxSpeed"
        case maximumGusts = "maxGusts"
        case dominantDirection
    }
}

struct WeeklyUV: Decodable {
    let maximum: [Double]

    enum CodingKeys: String, CodingKey {
        case maximum = "max"
    }
}

struct WeeklySun: Decodable {
    let sunrise: [String]
    let sunset: [String]
    let daylightDuration: [String]
    let rawSunrise: [String]?
    let rawSunset: [String]?
}

enum JSONValue: Decodable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        if let container = try? decoder.container(keyedBy: DynamicJSONKey.self) {
            var values: [String: JSONValue] = [:]
            for key in container.allKeys {
                values[key.stringValue] = try container.decode(JSONValue.self, forKey: key)
            }
            self = .object(values)
            return
        }
        if var container = try? decoder.unkeyedContainer() {
            var values: [JSONValue] = []
            while !container.isAtEnd {
                values.append(try container.decode(JSONValue.self))
            }
            self = .array(values)
            return
        }

        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    var summary: String {
        switch self {
        case .object(let values):
            values.keys.sorted().map { "\($0.capitalized): \(values[$0]?.summary ?? "—")" }.joined(separator: " · ")
        case .array(let values):
            values.prefix(4).map(\.summary).joined(separator: ", ") + (values.count > 4 ? " …" : "")
        case .string(let value): value
        case .number(let value): value.formatted(.number.precision(.fractionLength(0...2)))
        case .bool(let value): value ? "Yes" : "No"
        case .null: "—"
        }
    }
}

private struct DynamicJSONKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil

    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

enum APIClient {
    #if DEBUG
    /// Debug builds can point at a server on this Mac (Preferences → Developer). The simulator shares the Mac's localhost.
    static let localServerKey = "debugUseLocalServer"
    static let localServerURL = URL(string: "http://localhost:42069")!
    #endif

    private static var baseURL: URL {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: localServerKey) { return localServerURL }
        #endif
        return URL(string: "https://backend.water-ways.ca")!
    }

    static func rivers(in province: Province) async throws -> [String: [RiverStation]] {
        let url = baseURL
            .appending(path: "details")
            .appending(path: "rivers")
            .appending(path: province.code.lowercased())
        let data = try await data(from: url)
        return try JSONDecoder().decode([String: [RiverStation]].self, from: data)
    }

    static func search(query: String) async throws -> [SearchResult] {
        var components = URLComponents(url: baseURL.appending(path: "search/search-all-rivers"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "query", value: query)]
        let data = try await data(from: components.url!)
        return try JSONDecoder().decode([SearchResult].self, from: data)
    }

    static func stationData(path: String) async throws -> JSONValue {
        let data = try await data(from: baseURL.appending(path: path))
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    /// Latest reading for each station, keyed by station ID; for stations without a recent reading, the date
    /// ("2026-09-30") they last reported, when known; and each reporting station's last day.
    static func latestWaterData(stationIDs: [String]) async throws -> LatestReadings {
        var result = LatestReadings(readings: [:], lastReported: [:])
        // The server accepts up to 100 stations per request.
        for start in stride(from: 0, to: stationIDs.count, by: 100) {
            let batch = stationIDs[start..<min(start + 100, stationIDs.count)]
            var components = URLComponents(url: baseURL.appending(path: "details/latest-water-data"), resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "ids", value: batch.joined(separator: ",")),
                URLQueryItem(name: "includeLastReported", value: "true"),
                URLQueryItem(name: "includeTrend", value: "true")
            ]
            let page = try JSONDecoder().decode(LatestReadings.self, from: await data(from: components.url!))
            result.readings.merge(page.readings) { current, _ in current }
            result.lastReported.merge(page.lastReported) { current, _ in current }
            result.trends.merge(page.trends) { current, _ in current }
        }
        return result
    }

    static func waterSeries(stationID: String, days: Int) async throws -> [WaterSeriesReading] {
        let url = baseURL
            .appending(path: "details")
            .appending(path: "water-data")
            .appending(path: stationID)
            .appending(path: String(days))
        return try JSONDecoder().decode([WaterSeriesReading].self, from: await data(from: url))
    }

    static func waterHistory(
        stationID: String,
        metric: String,
        interval: String,
        from: String?,
        to: String?,
        token: String
    ) async throws -> WaterHistory {
        var request = authenticatedRequest(path: "details/water-history/\(stationID)", token: token)
        var queryItems = [URLQueryItem(name: "metric", value: metric), URLQueryItem(name: "interval", value: interval)]
        if let from { queryItems.append(URLQueryItem(name: "from", value: from)) }
        if let to { queryItems.append(URLQueryItem(name: "to", value: to)) }
        request.url?.append(queryItems: queryItems)
        return try JSONDecoder().decode(WaterHistory.self, from: await data(for: request))
    }

    static func waterRecords(stationID: String, token: String) async throws -> WaterRecords {
        let request = authenticatedRequest(path: "details/water-records/\(stationID)", token: token)
        return try JSONDecoder().decode(WaterRecords.self, from: await data(for: request))
    }

    static func weatherAlerts(stationID: String) async throws -> [WeatherAlert] {
        let url = baseURL.appending(path: "details/alerts/\(stationID)")
        return try JSONDecoder().decode(WeatherAlertsResponse.self, from: await data(from: url)).alerts
    }

    static func pressureSeries(stationID: String) async throws -> PressureSeries {
        let url = baseURL.appending(path: "details/pressure/\(stationID)")
        return try JSONDecoder().decode(PressureSeries.self, from: await data(from: url))
    }

    static func currentWeather(stationID: String) async throws -> CurrentWeather {
        let url = baseURL.appending(path: "details/weather/\(stationID)")
        return try JSONDecoder().decode(CurrentWeather.self, from: await data(from: url))
    }

    static func hourlyForecast(stationID: String) async throws -> HourlyForecast {
        let url = baseURL.appending(path: "details/weather/hourly/\(stationID)")
        return try JSONDecoder().decode(HourlyForecast.self, from: await data(from: url))
    }

    static func weeklyForecast(stationID: String) async throws -> WeeklyForecast {
        let url = baseURL.appending(path: "details/weather/weekly/\(stationID)")
        return try JSONDecoder().decode(WeeklyForecast.self, from: await data(from: url))
    }

    static func favorites(token: String) async throws -> [FavoriteRecord] {
        var request = authenticatedRequest(path: "u/favorites", token: token)
        request.url?.append(queryItems: [URLQueryItem(name: "includeRivers", value: "true")])
        return try JSONDecoder().decode([FavoriteRecord].self, from: await data(for: request))
    }

    static func addFavorite(station: RiverStation, token: String) async throws {
        var request = authenticatedRequest(path: "u/favorites", token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "stationId": station.stationID,
            "stationName": station.stationName,
            "province": station.province
        ])
        _ = try await data(for: request)
    }

    static func addRiverFavorite(name: String, province: String, stations: [RiverStation], token: String) async throws -> FavoriteRecord {
        var request = authenticatedRequest(path: "u/favorites/rivers", token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "riverName": name,
            "province": province,
            "stations": stations.map { station in
                [
                    "stationId": station.stationID,
                    "stationName": station.stationName,
                    "province": station.province,
                    "latitude": station.latitude as Any? ?? NSNull(),
                    "longitude": station.longitude as Any? ?? NSNull(),
                    "section": station.section as Any? ?? NSNull()
                ]
            }
        ])
        let response = try JSONDecoder().decode(FavoriteMutationResponse.self, from: await data(for: request))
        return response.favorite
    }

    static func removeRiverFavorite(favoriteID: String, token: String) async throws {
        var request = authenticatedRequest(path: "u/favorites/rivers/\(favoriteID)", token: token)
        request.httpMethod = "DELETE"
        _ = try await data(for: request)
    }

    static func removeFavorite(stationID: String, token: String) async throws {
        var request = authenticatedRequest(path: "u/favorites/\(stationID)", token: token)
        request.httpMethod = "DELETE"
        _ = try await data(for: request)
    }

    static func coordinates(stationID: String) async throws -> RiverStation {
        let url = baseURL.appending(path: "details/coordinates/\(stationID)")
        return try JSONDecoder().decode(RiverStation.self, from: await data(from: url))
    }

    static func subscriptionStatus(token: String) async throws -> SubscriptionStatus {
        let request = authenticatedRequest(path: "sub/status", token: token)
        return try JSONDecoder().decode(SubscriptionStatus.self, from: await data(for: request))
    }

    static func appleAccountToken(token: String) async throws -> UUID {
        let request = authenticatedRequest(path: "sub/apple/account-token", token: token)
        let response = try JSONDecoder().decode(AppleAccountTokenResponse.self, from: await data(for: request))
        guard let token = UUID(uuidString: response.appAccountToken) else {
            throw APIError.invalidResponse
        }
        return token
    }

    static func verifyAppleTransaction(signedTransaction: String, token: String) async throws {
        var request = authenticatedRequest(path: "sub/apple/verify-transaction", token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["signedTransaction": signedTransaction])
        _ = try await data(for: request)
    }

    static func cancelSubscription(token: String) async throws {
        var request = authenticatedRequest(path: "sub/cancel", token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["reason": "Managed from the iOS app"])
        _ = try await data(for: request)
    }

    static func userSettings(userID: String, token: String) async throws -> SavedUserSettings? {
        let request = authenticatedRequest(path: "s/\(userID)", token: token)
        let response = try JSONDecoder().decode(SettingsResponse.self, from: await data(for: request))
        return response.settings
    }

    static func saveUserSettings(userID: String, settings: SavedUserSettings, token: String) async throws {
        var request = authenticatedRequest(path: "s/\(userID)", token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(SettingsBody(settings: settings))
        _ = try await data(for: request)
    }

    private struct SettingsBody: Encodable {
        let settings: SavedUserSettings
    }

    private struct FavoriteMutationResponse: Decodable {
        let favorite: FavoriteRecord
    }

    private static func authenticatedRequest(path: String, token: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func data(from url: URL) async throws -> Data {
        try await data(for: URLRequest(url: url))
    }

    /// Fails a stalled request after 20 seconds instead of the 60-second default, so screens can offer a retry sooner.
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        return URLSession(configuration: configuration)
    }()

    private static func data(for request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            throw APIError.server(statusCode: response.statusCode)
        }
        return data
    }
}

extension Error {
    /// True when a request was cancelled (its view went away or a refresh restarted), which says nothing about the server.
    var isCancellation: Bool {
        self is CancellationError || (self as? URLError)?.code == .cancelled
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an invalid response."
        case .server(let statusCode):
            return "The server returned an error (\(statusCode)). Try again shortly."
        }
    }
}