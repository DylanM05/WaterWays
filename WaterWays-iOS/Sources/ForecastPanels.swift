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
}

struct WeeklyForecastData {
    let days: [ForecastDay]
    let timeZone: TimeZone

    init(_ forecast: WeeklyForecast) {
        timeZone = ForecastParsing.stationTimeZone(identifier: forecast.timezone, offset: forecast.utcOffsetSeconds) ?? .current
        let dayFormatter = ForecastParsing.formatter("yyyy-MM-dd", timeZone: timeZone)
        let sunFormatter = ForecastParsing.formatter("yyyy-MM-dd'T'HH:mm", timeZone: timeZone)
        days = forecast.rawDates.enumerated().compactMap { index, rawDate in
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
        }
    }

    /// Seven days from the station's today, so cached data stays correct as days pass.
    func upcoming(from now: Date = .now) -> [ForecastDay] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let today = calendar.startOfDay(for: now)
        return Array(days.filter { $0.date >= today }.prefix(7))
    }
}

// MARK: - Weather tab

/// The station's weather: conditions now, the coming hours, pressure, and seven days. Each card loads on its own,
/// so one failed request leaves the others showing.
struct StationWeatherTab: View {
    let station: RiverStation
    let refreshToken: Int
    @State private var current = Remote<CurrentWeather>()
    @State private var hourly = Remote<HourlyForecastData>()
    @State private var weekly = Remote<WeeklyForecastData>()
    @State private var pressure = Remote<PressureHours>()
    /// The token last loaded; a new one means a pull to refresh, which skips the forecast caches.
    @State private var loadedToken: Int?

    /// The station's clock, from whichever forecast has loaded.
    private var timeZone: TimeZone { hourly.value?.timeZone ?? weekly.value?.timeZone ?? .current }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardLoad(remote: current, loading: "Loading the current weather", failure: "Couldn’t load the current weather.") {
                Task { await loadCurrent() }
            } content: { weather in
                CurrentConditionsCard(weather: weather, today: today, timeZone: timeZone)
            }
            .padding(18)
            .cardBackground()

            CardLoad(remote: hourly, loading: "Loading the hourly forecast", failure: "Couldn’t load the hourly forecast.") {
                Task { await loadHourly(force: true) }
            } content: { forecast in
                HourlyCard(forecast: forecast, pressure: pressure.value?.seaLevel ?? [])
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 14)
            .cardBackground()

            CardLoad(remote: pressure, loading: "Loading the pressure", failure: "Couldn’t load the pressure.") {
                Task { await loadPressure() }
            } content: { hours in
                PressureCard(hours: hours, timeZone: timeZone)
            }
            .padding(16)
            .cardBackground()

            CardLoad(remote: weekly, loading: "Loading the 7-day forecast", failure: "Couldn’t load the 7-day forecast.") {
                Task { await loadWeekly(force: true) }
            } content: { forecast in
                WeeklyCard(forecast: forecast)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
            .cardBackground()
        }
        .task(id: refreshToken) {
            let force = loadedToken != nil
            loadedToken = refreshToken
            async let currentLoad: Void = loadCurrent()
            async let hourlyLoad: Void = loadHourly(force: force)
            async let weeklyLoad: Void = loadWeekly(force: force)
            async let pressureLoad: Void = loadPressure()
            _ = await (currentLoad, hourlyLoad, weeklyLoad, pressureLoad)
        }
    }

    /// Today's forecast where the station is, for the high, low, sunrise and sunset.
    private var today: ForecastDay? {
        guard let forecast = weekly.value, let first = forecast.upcoming().first else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = forecast.timeZone
        return calendar.isDate(first.date, inSameDayAs: .now) ? first : nil
    }

    private func loadCurrent() async {
        await fill($current) { try await APIClient.currentWeather(stationID: station.stationID) }
    }

    private func loadPressure() async {
        await fill($pressure) { PressureHours(try await APIClient.pressureSeries(stationID: station.stationID)) }
    }

    private func loadHourly(force: Bool) async {
        let id = station.stationID
        await fill($hourly, cached: force ? nil : hourlyForecastCache.value(for: id)) {
            let prepared = HourlyForecastData(try await APIClient.hourlyForecast(stationID: id))
            hourlyForecastCache.store(prepared, for: id)
            return prepared
        }
    }

    private func loadWeekly(force: Bool) async {
        let id = station.stationID
        await fill($weekly, cached: force ? nil : weeklyForecastCache.value(for: id)) {
            let prepared = WeeklyForecastData(try await APIClient.weeklyForecast(stationID: id))
            weeklyForecastCache.store(prepared, for: id)
            return prepared
        }
    }

    private func fill<Value>(_ remote: Binding<Remote<Value>>, cached: Value? = nil, fetch: () async throws -> Value) async {
        if let cached {
            remote.wrappedValue = Remote(value: cached)
            return
        }
        remote.wrappedValue.failed = false
        do {
            remote.wrappedValue = Remote(value: try await fetch())
        } catch {
            if error.isCancellation || Task.isCancelled { return }
            // Keep showing what loaded before if a refresh fails.
            if remote.wrappedValue.value == nil { remote.wrappedValue.failed = true }
        }
    }
}

/// One request's result: the latest value, kept through a failed refresh, or that it failed with nothing to show.
private struct Remote<Value> {
    var value: Value?
    var failed = false
}

/// A card's content once its request has loaded; until then a small spinner, or a message with Try again.
private struct CardLoad<Value, Content: View>: View {
    let remote: Remote<Value>
    let loading: String
    let failure: String
    let retry: () -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        if let value = remote.value {
            content(value)
        } else if remote.failed {
            CardMessage(text: failure, retry: retry)
        } else {
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity, minHeight: 72)
                .accessibilityLabel(loading)
        }
    }
}

private struct CardMessage: View {
    let text: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 8) {
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.accent)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 72)
    }
}

// MARK: Current conditions

private struct CurrentConditionsCard: View {
    let weather: CurrentWeather
    let today: ForecastDay?
    let timeZone: TimeZone
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"

    var body: some View {
        let isDay = weather.isDay != 0
        let code = serverConditionCodes[weather.weather]
        let condition = code.map { WeatherCondition.description(for: $0) } ?? weather.weather
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Image(systemName: code.map { WeatherCondition.symbol(for: $0, isDay: isDay) }
                      ?? WeatherCondition.symbol(forDescription: weather.weather, isDay: isDay))
                    .font(.system(size: 44))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 52, height: 52)
                    .accessibilityHidden(true)
                Text(degrees(weather.temperature, unit: temperatureUnit))
                    .font(.number(60))
                    .tracking(-1.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                VStack(alignment: .leading, spacing: 2) {
                    Text(condition)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if let today {
                        Text("High \(degrees(today.high, unit: temperatureUnit)), low \(degrees(today.low, unit: temperatureUnit))")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink3)
                    }
                    if let updated {
                        Text("Updated \(updated)")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink3)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            if !facts.isEmpty {
                FactGrid(facts: facts)
            }
        }
    }

    /// The server sends GMT ("October 30th 2026, 11:15:00 pm"); shown on the station's clock.
    private var updated: String? {
        weather.time
            .flatMap { StationDate.parse($0, format: "MMMM d yyyy, h:mm:ss a", timeZone: TimeZone(identifier: "UTC")!) }
            .map { $0.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone)) }
    }

    private var facts: [Fact] {
        let time = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone)
        var facts: [Fact] = []
        if let apparent = weather.apparentTemperature { facts.append(Fact("Feels like", degrees(apparent, unit: temperatureUnit))) }
        if let wind = windText(weather.wind, direction: weather.windDirection, gusts: weather.windGusts) { facts.append(Fact("Wind", wind)) }
        if let humidity = weather.humidity { facts.append(Fact("Humidity", percent(humidity))) }
        if let cloudCover = weather.cloudCover { facts.append(Fact("Cloud cover", percent(cloudCover))) }
        if let falling = weather.precipitation, falling.total > 0 {
            facts.append(Fact("Precipitation now", ["\(amount(falling.total)) mm", falling.type?.lowercased()].compactMap { $0 }.joined(separator: " ")))
        }
        if let today, today.precipitation != nil || today.precipitationChance != nil {
            facts.append(Fact("Precipitation today", precipitationText(today.precipitation, chance: today.precipitationChance) ?? "None expected"))
        }
        if let sunrise = today?.sunrise { facts.append(Fact("Sunrise", sunrise.formatted(time))) }
        if let sunset = today?.sunset { facts.append(Fact("Sunset", sunset.formatted(time))) }
        return facts
    }
}

/// Current conditions arrive as Open-Meteo's description rather than a code.
private let serverConditionCodes: [String: Int] = [
    "Clear sky": 0, "Mainly clear": 1, "Partly cloudy": 2, "Overcast": 3, "Fog": 45, "Depositing rime fog": 48,
    "Drizzle: Light intensity": 51, "Drizzle: Moderate intensity": 53, "Drizzle: Dense intensity": 55,
    "Freezing Drizzle: Light intensity": 56, "Freezing Drizzle: Dense intensity": 57,
    "Rain: Slight intensity": 61, "Rain: Moderate intensity": 63, "Rain: Heavy intensity": 65,
    "Freezing Rain: Light intensity": 66, "Freezing Rain: Heavy intensity": 67,
    "Snow fall: Slight intensity": 71, "Snow fall: Moderate intensity": 73, "Snow fall: Heavy intensity": 75, "Snow grains": 77,
    "Rain showers: Slight intensity": 80, "Rain showers: Moderate intensity": 81, "Rain showers: Violent intensity": 82,
    "Snow showers: Slight intensity": 85, "Snow showers: Heavy intensity": 86,
    "Thunderstorm: Slight or moderate": 95, "Thunderstorm with slight hail": 96, "Thunderstorm with heavy hail": 99,
]

// MARK: Hourly

private struct HourlyCard: View {
    let forecast: HourlyForecastData
    /// Sea-level pressure by hour, for the picked hour's details.
    let pressure: [PressurePoint]
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @State private var pickedTime: Date?

    var body: some View {
        let hours = forecast.upcoming(limit: 72)
        if let first = hours.first {
            // The first hour until another is picked, or when the picked one has passed.
            let picked = hours.first { $0.time == pickedTime } ?? first
            VStack(alignment: .leading, spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(hours) { hour in
                            cell(hour, selected: hour.time == picked.time)
                        }
                    }
                }
                // The current hour's details are already in the conditions card above.
                if picked.time != first.time {
                    details(picked)
                        .padding(.horizontal, 4)
                }
            }
        } else {
            CardMessage(text: "No hourly forecast for the hours ahead.")
        }
    }

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = forecast.timeZone
        return calendar
    }

    private func isNow(_ hour: ForecastHour) -> Bool { hour.time <= .now }

    /// "Now", "4 PM", or the day at midnight.
    private func label(_ hour: ForecastHour) -> String {
        if isNow(hour) { return "Now" }
        let style = Date.FormatStyle(timeZone: forecast.timeZone)
        return calendar.component(.hour, from: hour.time) == 0 ? hour.time.formatted(style.weekday(.abbreviated)) : hour.time.formatted(style.hour())
    }

    private func fullLabel(_ hour: ForecastHour) -> String {
        isNow(hour) ? "Now" : hour.time.formatted(Date.FormatStyle(timeZone: forecast.timeZone).weekday(.abbreviated).hour())
    }

    private func chance(_ hour: ForecastHour) -> String? {
        hour.precipitationChance.flatMap { $0 >= 10 ? percent($0) : nil }
    }

    private func cell(_ hour: ForecastHour, selected: Bool) -> some View {
        Button {
            pickedTime = hour.time
        } label: {
            VStack(spacing: 8) {
                Text(label(hour))
                    .font(.system(size: 12.5))
                    .foregroundStyle(selected ? Theme.ink : Theme.ink2)
                Image(systemName: WeatherCondition.symbol(for: hour.code, isDay: hour.isDay))
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.ink2)
                    .frame(height: 24)
                Text(degrees(hour.temperature, unit: temperatureUnit))
                    .font(.number(18))
                    .foregroundStyle(Theme.ink)
                // Reserve the line even when empty so the cells stay aligned.
                Text(chance(hour) ?? " ")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.accent)
            }
            .lineLimit(1)
            .frame(width: 58)
            .padding(.vertical, 10)
            .background(selected ? Theme.sunk : .clear, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([fullLabel(hour), degrees(hour.temperature, unit: temperatureUnit), WeatherCondition.description(for: hour.code),
                             chance(hour).map { "\($0) chance of precipitation" }].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private func details(_ hour: ForecastHour) -> some View {
        var facts: [Fact] = []
        if let feelsLike = hour.feelsLike { facts.append(Fact("Feels like", degrees(feelsLike, unit: temperatureUnit))) }
        if let humidity = hour.humidity { facts.append(Fact("Humidity", percent(humidity))) }
        if let wind = windText(hour.windSpeed, direction: hour.windDirection.map(compassDirection), gusts: hour.windGusts) {
            facts.append(Fact("Wind", wind))
        }
        if hour.precipitation != nil || hour.precipitationChance != nil {
            let chance = hour.precipitationChance.map { "\(percent($0)) chance" }
            let fall = hour.precipitation.flatMap { $0 > 0 ? "\(amount($0)) mm" : nil }
            facts.append(Fact("Precipitation", [fall, chance].compactMap { $0 }.joined(separator: ", ")))
        }
        // Pressure comes by GMT hour; pair it with the forecast hour by the instant.
        let key = (hour.time.timeIntervalSince1970 / 3600).rounded()
        if let reading = pressure.first(where: { ($0.time.timeIntervalSince1970 / 3600).rounded() == key }) {
            facts.append(Fact("Pressure", "\(reading.value.formatted(.number.precision(.fractionLength(0)).grouping(.never))) hPa"))
        }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(fullLabel(hour)).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                Text(WeatherCondition.description(for: hour.code)).font(.system(size: 12.5)).foregroundStyle(Theme.ink2)
            }
            .accessibilityElement(children: .combine)
            if !facts.isEmpty {
                FactGrid(facts: facts, tiled: false)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.sunk, in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: Pressure

/// The server's hourly pressure, parsed once.
private struct PressureHours {
    let seaLevel: [PressurePoint]
    let surface: [PressurePoint]

    init(_ series: PressureSeries) {
        seaLevel = PressureNow.points(series.pressureMsl, times: series.time)
        surface = PressureNow.points(series.surfacePressure, times: series.time)
    }
}

/// Sea-level pressure over the past two days (solid, over a tint) and the next two (dashed), with where it is now.
private struct PressureCard: View {
    let hours: PressureHours
    let timeZone: TimeZone
    @State private var selectedTime: Date?

    private static let span: TimeInterval = 48 * 60 * 60

    var body: some View {
        if let now = PressureNow.current(hours.seaLevel) {
            content(now: now.point, change: now.change3h)
        } else {
            CardMessage(text: "No pressure readings.")
        }
    }

    private func content(now: PressurePoint, change: Double?) -> some View {
        let shown = hours.seaLevel.filter { abs($0.time.timeIntervalSince(now.time)) <= Self.span }
        let scale = Self.scale(shown.map(\.value))
        let picked = selectedTime.flatMap { nearest(shown, to: $0, time: \.time) }
        let summary = "\(hpa(now.value, decimals: 0)) hPa" + (change.map { ", \(PressureNow.tendency($0).lowercased())" } ?? "")
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Pressure")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if let picked {
                    // The hour under the finger while scrubbing.
                    HStack(spacing: 6) {
                        Text(picked.time == now.time ? "Now" : picked.time.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated).hour()))
                            .foregroundStyle(Theme.ink2)
                        Text("\(hpa(picked.value, decimals: 1)) hPa").foregroundStyle(Theme.ink)
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                } else {
                    tendencyLabel(summary, change: change)
                }
            }
            chart(shown, now: now, scale: scale, picked: picked)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Sea-level pressure over the past 48 hours and the next 48")
                .accessibilityValue("\(summary) now")
            FactGrid(facts: stats(now: now, change: change))
        }
    }

    private func tendencyLabel(_ summary: String, change: Double?) -> some View {
        let rising = (change ?? 0) >= 0.5
        let falling = (change ?? 0) <= -0.5
        return HStack(spacing: 3) {
            if change != nil {
                Image(systemName: rising ? "arrow.up" : falling ? "arrow.down" : "minus")
                    .font(.system(size: 11, weight: .bold))
            }
            Text(summary)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(rising ? Theme.accent : Theme.ink2)
        .lineLimit(1)
        .accessibilityElement(children: .combine)
    }

    private func chart(_ shown: [PressurePoint], now: PressurePoint, scale: (domain: ClosedRange<Double>, ticks: [Double]), picked: PressurePoint?) -> some View {
        let past = shown.filter { $0.time <= now.time }
        let future = shown.filter { $0.time >= now.time }
        let floor = scale.domain.lowerBound
        let start = now.time.addingTimeInterval(-Self.span)
        let end = now.time.addingTimeInterval(Self.span)
        return Chart {
            ForEach(past) { point in
                AreaMark(
                    x: .value("Time", point.time),
                    yStart: .value("Base", floor),
                    yEnd: .value("Pressure", point.value),
                    series: .value("Part", "Past")
                )
                .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.2), Theme.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Time", point.time), y: .value("Pressure", point.value), series: .value("Part", "Past"))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            }
            ForEach(future) { point in
                LineMark(x: .value("Time", point.time), y: .value("Pressure", point.value), series: .value("Part", "Forecast"))
                    .foregroundStyle(Theme.ink3)
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [4, 4]))
            }
            RuleMark(x: .value("Now", now.time))
                .foregroundStyle(Theme.ink3)
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
            PointMark(x: .value("Time", now.time), y: .value("Pressure", now.value))
                .symbol { dot(fill: Theme.accent, stroke: Theme.surface) }
            if let picked {
                RuleMark(x: .value("Selected", picked.time))
                    .foregroundStyle(Theme.ink2)
                    .lineStyle(StrokeStyle(lineWidth: 1))
                PointMark(x: .value("Time", picked.time), y: .value("Pressure", picked.value))
                    .symbol { dot(fill: Theme.surface, stroke: Theme.ink) }
            }
        }
        .chartXSelection(value: $selectedTime)
        .chartXScale(domain: start...end)
        .chartYScale(domain: scale.domain)
        .chartYAxis {
            AxisMarks(position: .leading, values: scale.ticks) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(Theme.line)
                AxisValueLabel {
                    if let tick = value.as(Double.self) { Text(hpa(tick, decimals: 0)) }
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.ink3)
            }
        }
        .chartXAxis {
            AxisMarks(values: [start, now.time, end]) { value in
                AxisValueLabel(anchor: value.index == 0 ? .topLeading : value.index == 2 ? .topTrailing : .top) {
                    Text(["48 h ago", "Now", "In 48 h"][min(value.index, 2)])
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.ink3)
            }
        }
        .frame(height: 128)
    }

    private func dot(fill: Color, stroke: Color) -> some View {
        Circle()
            .fill(fill)
            .frame(width: 9, height: 9)
            .overlay(Circle().strokeBorder(stroke, lineWidth: 2))
    }

    private func stats(now: PressurePoint, change: Double?) -> [Fact] {
        var facts: [Fact] = []
        if let surface = PressureNow.current(hours.surface)?.point {
            facts.append(Fact("At station", "\(hpa(surface.value, decimals: 1)) hPa"))
        }
        if let change {
            let signed = change.formatted(.number.precision(.fractionLength(1)).sign(strategy: .always(includingZero: false)))
            facts.append(Fact("3 h change", "\(signed) hPa"))
        }
        let lastDay = hours.seaLevel.filter { $0.time <= now.time && $0.time >= now.time.addingTimeInterval(-24 * 60 * 60) }.map(\.value)
        if let high = lastDay.max(), let low = lastDay.min() {
            facts.append(Fact("24 h high", "\(hpa(high, decimals: 1)) hPa"))
            facts.append(Fact("24 h low", "\(hpa(low, decimals: 1)) hPa"))
        }
        return facts
    }

    private func hpa(_ value: Double, decimals: Int) -> String {
        value.formatted(.number.precision(.fractionLength(decimals)).grouping(.never))
    }

    /// Ticks every 5 hPa (10 over a wide range), with at least 10 hPa of range so a calm spell doesn't look stormy.
    private static func scale(_ values: [Double]) -> (domain: ClosedRange<Double>, ticks: [Double]) {
        guard let minimum = values.min(), let maximum = values.max() else { return (0...1, []) }
        var low = ((minimum - 1) / 5).rounded(.down) * 5
        var high = ((maximum + 1) / 5).rounded(.up) * 5
        if high - low < 10 { low -= 5; high += 5 }
        let step: Double = high - low > 20 ? 10 : 5
        let ticks = Array(stride(from: ((low + 1) / step).rounded(.up) * step, to: high, by: step))
        return (low...high, ticks)
    }
}

// MARK: Weekly

private struct WeeklyCard: View {
    let forecast: WeeklyForecastData
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @State private var openDay: Date?

    var body: some View {
        let days = forecast.upcoming()
        if days.isEmpty {
            CardMessage(text: "No 7-day forecast.")
        } else {
            // Each day's bar sits on the week's scale.
            let temperatures = days.flatMap { [$0.low, $0.high] }
            let range = (temperatures.min() ?? 0)...(temperatures.max() ?? 0)
            VStack(spacing: 0) {
                ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                    if index > 0 { Rectangle().fill(Theme.line).frame(height: 1) }
                    let isOpen = openDay == day.date
                    Button {
                        withAnimation(.snappy(duration: 0.25)) { openDay = isOpen ? nil : day.date }
                    } label: {
                        row(day, range: range, isOpen: isOpen)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(accessibilityLabel(day))
                    .accessibilityHint(isOpen ? "Hides details" : "Shows details")
                    if isOpen {
                        FactGrid(facts: details(day), compact: true)
                            .padding(.bottom, 12)
                            .transition(.opacity)
                    }
                }
            }
        }
    }

    private func isToday(_ day: ForecastDay) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = forecast.timeZone
        return calendar.isDate(day.date, inSameDayAs: .now)
    }

    private func dayLabel(_ day: ForecastDay, style: Date.FormatStyle.Symbol.Weekday = .abbreviated) -> String {
        isToday(day) ? "Today" : day.date.formatted(Date.FormatStyle(timeZone: forecast.timeZone).weekday(style))
    }

    private func chance(_ day: ForecastDay) -> String? {
        day.precipitationChance.flatMap { $0 >= 20 ? percent($0) : nil }
    }

    private func row(_ day: ForecastDay, range: ClosedRange<Double>, isOpen: Bool) -> some View {
        HStack(spacing: 10) {
            Text(dayLabel(day))
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 48, alignment: .leading)
            HStack(spacing: 5) {
                Image(systemName: WeatherCondition.symbol(for: day.code))
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 22)
                if let chance = chance(day) {
                    Text(chance)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .frame(width: 58, alignment: .leading)
            Text(degrees(day.low, unit: temperatureUnit))
                .foregroundStyle(Theme.ink3)
                .frame(width: 34, alignment: .trailing)
            TemperatureRangeBar(low: day.low, high: day.high, range: range)
            Text(degrees(day.high, unit: temperatureUnit))
                .fontWeight(.semibold)
                .foregroundStyle(Theme.ink)
                .frame(width: 34, alignment: .leading)
            Image(systemName: "chevron.down")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isOpen ? Theme.ink : Theme.ink3)
                .rotationEffect(.degrees(isOpen ? 180 : 0))
        }
        .font(.system(size: 14.5))
        .monospacedDigit()
        .lineLimit(1)
        .frame(minHeight: 46)
        .contentShape(Rectangle())
    }

    private func accessibilityLabel(_ day: ForecastDay) -> String {
        [dayLabel(day, style: .wide), WeatherCondition.description(for: day.code),
         "high \(degrees(day.high, unit: temperatureUnit))", "low \(degrees(day.low, unit: temperatureUnit))",
         chance(day).map { "\($0) chance of precipitation" }].compactMap { $0 }.joined(separator: ", ")
    }

    private func details(_ day: ForecastDay) -> [Fact] {
        let time = Date.FormatStyle(date: .omitted, time: .shortened, timeZone: forecast.timeZone)
        var facts: [Fact] = []
        if let sunrise = day.sunrise { facts.append(Fact("Sunrise", sunrise.formatted(time))) }
        if let sunset = day.sunset { facts.append(Fact("Sunset", sunset.formatted(time))) }
        if let daylight = day.daylight {
            // "9h 12m" -> "9 h 12 min"
            facts.append(Fact("Daylight", daylight.replacingOccurrences(of: "(\\d+)h (\\d+)m", with: "$1 h $2 min", options: .regularExpression)))
        }
        if let wind = windText(day.windSpeed, direction: day.windDirection.map(compassDirection), gusts: day.windGusts) {
            facts.append(Fact("Wind", wind))
        }
        if day.precipitation != nil || day.precipitationChance != nil {
            facts.append(Fact("Precipitation", precipitationText(day.precipitation, chance: day.precipitationChance) ?? "None"))
        }
        if let uv = day.uv { facts.append(Fact("UV index", "\(uv.formatted(.number.precision(.fractionLength(1)))), \(uvLevel(uv))")) }
        return facts
    }

    private func uvLevel(_ uv: Double) -> String {
        switch uv {
        case ..<3: "low"
        case ..<6: "moderate"
        case ..<8: "high"
        case ..<11: "very high"
        default: "extreme"
        }
    }
}

/// A day's low to high on the week's scale: an accent bar on a sunk track.
private struct TemperatureRangeBar: View {
    let low: Double
    let high: Double
    let range: ClosedRange<Double>

    var body: some View {
        GeometryReader { geometry in
            let span = max(range.upperBound - range.lowerBound, 1)
            let start = (low - range.lowerBound) / span * geometry.size.width
            let width = max((high - low) / span * geometry.size.width, 6)
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.sunk)
                Capsule()
                    .fill(Theme.accent)
                    .frame(width: width)
                    .offset(x: min(start, geometry.size.width - width))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

// MARK: Facts

private struct Fact: Identifiable {
    let name: String
    let value: String
    var id: String { name }

    init(_ name: String, _ value: String) {
        self.name = name
        self.value = value
    }
}

/// Facts two to a row, each on a sunk tile (or plain, inside a sunk panel). An odd last fact takes the whole row.
private struct FactGrid: View {
    let facts: [Fact]
    var tiled = true
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 6 : 8) {
            ForEach(Array(stride(from: 0, to: facts.count, by: 2)), id: \.self) { start in
                HStack(spacing: compact ? 6 : 8) {
                    ForEach(facts[start..<min(start + 2, facts.count)]) { fact in
                        tile(fact)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func tile(_ fact: Fact) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(fact.name)
                .font(.system(size: compact ? 11.5 : 12, weight: .medium))
                .foregroundStyle(Theme.ink3)
            Text(fact.value)
                .font(.system(size: compact ? 13.5 : tiled ? 15 : 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, tiled ? (compact ? 10 : 12) : 0)
        .padding(.vertical, tiled ? (compact ? 8 : 10) : 0)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(tiled ? Theme.sunk : .clear, in: RoundedRectangle(cornerRadius: compact ? 10 : 12))
        .accessibilityElement(children: .combine)
    }
}

// MARK: Formatting

/// One decimal, without a trailing ".0": 2.6, 14, 0.4.
private func amount(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...1)))
}

private func percent(_ value: Double) -> String {
    "\(value.formatted(.number.precision(.fractionLength(0))))%"
}

/// "10 km/h NNW, gusts 18"
private func windText(_ speed: Double?, direction: String?, gusts: Double?) -> String? {
    guard let speed else { return nil }
    let wind = ["\(speed.formatted(.number.precision(.fractionLength(0)))) km/h", direction].compactMap { $0 }.joined(separator: " ")
    return wind + (gusts.map { ", gusts \($0.formatted(.number.precision(.fractionLength(0))))" } ?? "")
}

/// "2.6 mm, 80% chance", or nil when there's neither an amount nor a chance.
private func precipitationText(_ total: Double?, chance: Double?) -> String? {
    let parts = [
        total.flatMap { $0 > 0 ? "\(amount($0)) mm" : nil },
        chance.flatMap { $0 > 0 ? "\(percent($0)) chance" : nil },
    ].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
}
