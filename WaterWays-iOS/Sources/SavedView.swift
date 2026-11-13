import ClerkKit
import ClerkKitUI
import SwiftUI

enum SavedSegment: String {
    case rivers, stations
}

struct FavoritesView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @State private var isAuthPresented = false
    @State private var requestError: String?
    @State private var latestReadings: [String: LatestWaterReading] = [:]
    @State private var lastReported = LatestReadings(readings: [:], lastReported: [:])
    @State private var readingsFailed = false
    @State private var completedReadingIDs: Set<String> = []
    @State private var openedRiver: SavedRiver?
    @State private var stationWeather: [String: SavedStationWeather] = [:]
    @AppStorage("nativeSavedSegment") private var selectedSegment: SavedSegment = .rivers

    private var savedStationIDs: Set<String> {
        Set((appState.favorites + appState.favoriteRivers.flatMap(\.stations)).map(\.stationID))
    }

    private var showsSegmentPicker: Bool {
        !appState.favoriteRivers.isEmpty && !appState.favorites.isEmpty
    }

    /// Falls back to whichever list has content when only one kind is saved.
    private var visibleSegment: SavedSegment {
        if showsSegmentPicker { return selectedSegment }
        return appState.favoriteRivers.isEmpty ? .stations : .rivers
    }

    var body: some View {
        Group {
            if clerk.user == nil {
                ContentUnavailableView {
                    Label("Sign in to view saved rivers and stations", systemImage: "person.crop.circle")
                } description: {
                    Text("Your subscribed favorites are synced to your WaterWays account.")
                } actions: {
                    Button("Sign In") { isAuthPresented = true }
                        .buttonStyle(.borderedProminent)
                }
            } else if appState.isLoadingFavorites {
                ProgressView("Loading saved rivers and stations")
            } else if appState.accountSyncError != nil && appState.favorites.isEmpty && appState.favoriteRivers.isEmpty {
                ErrorState(message: "Couldn’t load your saved rivers and stations.") {
                    try? await appState.syncAccountData(clerk: clerk)
                }
            } else if !appState.hasCheckedSubscription {
                // The account sync started at launch hasn't reached the membership check yet.
                ProgressView("Loading saved rivers and stations")
            } else if !appState.isPremiumSubscriber {
                ContentUnavailableView {
                    Label("Premium membership required", systemImage: "crown")
                } description: {
                    Text("Upgrade your membership to save rivers and stations.")
                } actions: {
                    NavigationLink("View Membership") { MembershipView() }
                        .buttonStyle(.borderedProminent)
                }
            } else if appState.favorites.isEmpty && appState.favoriteRivers.isEmpty {
                ContentUnavailableView {
                    Label("No favorites yet", systemImage: "heart")
                } description: {
                    Text("Save a station or a full river and it will appear here.")
                }
            } else {
                List {
                    if showsSegmentPicker {
                        Picker("Saved items", selection: $selectedSegment) {
                            Text("Rivers (\(appState.favoriteRivers.count))").tag(SavedSegment.rivers)
                            Text("Stations (\(appState.favorites.count))").tag(SavedSegment.stations)
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                    if visibleSegment == .rivers {
                        ForEach(appState.favoriteRivers) { river in
                            Section {
                                ForEach(river.stations) { station in
                                    NavigationLink {
                                        StationDetailView(station: station)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 9) {
                                            Text(station.displaySection).font(.body.weight(.semibold))
                                            Text("Station \(station.stationID)")
                                                .font(.caption).foregroundStyle(.secondary)
                                            readingPreview(for: station)
                                        }
                                        .padding(.vertical, 7)
                                    }
                                }
                            } header: {
                                savedRiverHeader(river)
                            }
                        }
                    } else {
                        Section {
                            ForEach(appState.favorites) { station in
                                NavigationLink {
                                    StationDetailView(station: station)
                                } label: {
                                    VStack(alignment: .leading, spacing: 9) {
                                        Text(station.displayName).font(.body.weight(.semibold))
                                        Text("\(station.province) · Station \(station.stationID)")
                                            .font(.caption).foregroundStyle(.secondary)
                                        readingPreview(for: station)
                                        SavedWeatherRow(details: stationWeather[station.stationID])
                                    }
                                    .padding(.vertical, 7)
                                }
                                .swipeActions {
                                    Button(role: .destructive) {
                                        Task {
                                            do {
                                                _ = try await appState.toggleFavorite(station, clerk: clerk)
                                            } catch {
                                                requestError = error.localizedDescription
                                            }
                                        }
                                    } label: {
                                        Label("Remove", systemImage: "heart.slash")
                                    }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Saved")
        .navigationDestination(item: $openedRiver) { river in
            RiverDetailView(name: river.name, province: river.province, stations: river.stations)
        }
        .task(id: savedStationIDs) { await loadLatestReadings() }
        .task(id: Set(appState.favorites.map(\.stationID))) { await loadStationWeather() }
        .refreshable {
            guard clerk.user != nil else { return }
            do {
                try await appState.syncAccountData(clerk: clerk)
                await loadLatestReadings()
            } catch where !error.isCancellation {
                requestError = error.localizedDescription
            } catch {}
        }
        .sheet(isPresented: $isAuthPresented) { AuthView() }
        .alert("Saved", isPresented: Binding(
            get: { requestError != nil },
            set: { if !$0 { requestError = nil } }
        )) {
            Button("OK", role: .cancel) { requestError = nil }
        } message: {
            Text(requestError ?? "Please try again.")
        }
    }

    private func savedRiverHeader(_ river: SavedRiver) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "water.waves").foregroundStyle(brandColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(river.name.displayTitle)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .textCase(nil)
                Text("\(river.province) · \(stationCount(river.stations.count))")
                    .font(.caption)
                    .textCase(nil)
            }
            Spacer(minLength: 8)
            Menu {
                Button {
                    openedRiver = river
                } label: {
                    Label("View river", systemImage: "water.waves")
                }
                Button(role: .destructive) {
                    Task {
                        do {
                            _ = try await appState.toggleFavoriteRiver(
                                name: river.name,
                                province: river.province,
                                stations: river.stations,
                                clerk: clerk
                            )
                        } catch {
                            requestError = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Remove river", systemImage: "heart.slash")
                }
            } label: {
                Image(systemName: "ellipsis.circle").font(.title3)
            }
            .disabled(appState.isUpdatingFavoriteRiver(name: river.name, province: river.province))
            .accessibilityLabel("Options for \(river.name.displayTitle)")
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func readingPreview(for station: RiverStation) -> some View {
        if let reading = latestReadings[station.stationID] {
            StationReadingSummary(reading: reading, trend: lastReported.trends[station.stationID])
        } else if completedReadingIDs.contains(station.stationID), readingsFailed {
            Label("Couldn’t load the latest reading · pull to refresh", systemImage: "exclamationmark.triangle")
                .font(.caption).foregroundStyle(.secondary)
        } else if completedReadingIDs.contains(station.stationID) {
            VStack(alignment: .leading, spacing: 2) {
                Text(station.noReadingMessage)
                // Seasonal or paused gauges: when they last sent data.
                if station.realtime != false, let label = lastReported.lastReportedLabel(for: station.stationID) {
                    Text(label)
                }
            }
            .font(.caption).foregroundStyle(.secondary)
        } else {
            ProgressView().controlSize(.small)
        }
    }

    /// Weather for each saved station (not each station of a saved river), loaded in parallel; each row fills in
    /// as its station's weather arrives.
    @MainActor
    private func loadStationWeather() async {
        let stationIDs = appState.favorites.map(\.stationID)
        stationWeather = stationWeather.filter { stationIDs.contains($0.key) }
        await withTaskGroup(of: (String, SavedStationWeather).self) { group in
            for stationID in stationIDs {
                group.addTask {
                    async let weather = try? APIClient.currentWeather(stationID: stationID)
                    async let pressure = try? APIClient.pressureSeries(stationID: stationID)
                    async let alerts = try? APIClient.weatherAlerts(stationID: stationID)
                    let series = await pressure
                    let now = series.flatMap { PressureNow.current($0.pressureMsl, times: $0.time) }
                    return (stationID, SavedStationWeather(
                        weather: await weather, pressure: now?.value, pressureChange: now?.change3h, alerts: await alerts ?? []
                    ))
                }
            }
            for await (stationID, details) in group where !Task.isCancelled {
                stationWeather[stationID] = details
            }
        }
    }

    @MainActor
    private func loadLatestReadings() async {
        latestReadings = [:]
        completedReadingIDs = []
        let stationIDs = savedStationIDs.sorted()
        guard !stationIDs.isEmpty else { return }
        let result: LatestReadings
        do {
            result = try await APIClient.latestWaterData(stationIDs: stationIDs)
            readingsFailed = false
        } catch {
            if error.isCancellation || Task.isCancelled { return }
            // Shown as a failure, not as "no recent readings", so it isn't mistaken for missing data.
            result = LatestReadings(readings: [:], lastReported: [:])
            readingsFailed = true
        }
        // The saved list changed while this was loading; the newer load fills the rows.
        guard !Task.isCancelled else { return }
        latestReadings = result.readings
        lastReported = result
        completedReadingIDs = Set(stationIDs)
    }
}

struct SavedStationWeather {
    let weather: CurrentWeather?
    let pressure: Double?
    let pressureChange: Double?
    let alerts: [WeatherAlert]
}

/// The weather at a saved station, as on the website's favourites: any active alert, the temperature and
/// conditions, wind, and sea-level pressure with its 3-hour tendency.
struct SavedWeatherRow: View {
    let details: SavedStationWeather?
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"

    var body: some View {
        if let details, details.weather != nil || details.pressure != nil {
            VStack(alignment: .leading, spacing: 8) {
                if let alert = details.alerts.first {
                    Label {
                        Text(details.alerts.count > 1 ? "\(alert.title) and \(details.alerts.count - 1) more" : alert.title)
                            .font(.caption.weight(.semibold))
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(alert.tint)
                    }
                }
                Divider()
                HStack(alignment: .top, spacing: 12) {
                    if let weather = details.weather {
                        WeatherFigure(title: "Weather", value: degrees(weather.temperature, unit: temperatureUnit), detail: weather.weather)
                        if let wind = weather.wind {
                            WeatherFigure(
                                title: "Wind", value: "\(Int(wind.rounded())) km/h",
                                detail: [weather.windDirection, weather.windGusts.map { "gusts \(Int($0.rounded()))" }].compactMap { $0 }.joined(separator: " · ")
                            )
                        }
                    }
                    if let pressure = details.pressure {
                        WeatherFigure(title: "Pressure", value: "\(Int(pressure.rounded())) hPa", detail: details.pressureChange.map(PressureNow.tendency))
                    }
                }
            }
        }
    }
}

/// One figure in a saved station's weather: lighter than the water tiles above it, so the two read apart.
private struct WeatherFigure: View {
    let title: String
    let value: String
    let detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold))
            if let detail, !detail.isEmpty {
                Text(detail).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
