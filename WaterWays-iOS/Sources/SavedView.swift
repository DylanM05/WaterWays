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
    @State private var readings = LatestReadings(readings: [:], lastReported: [:])
    @State private var readingsFailed = false
    @State private var loaded = false
    @State private var openedRiver: SavedRiver?
    @State private var stationWeather: [String: SavedStationWeather] = [:]
    @State private var isEditing = false
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

    private var hasSaved: Bool {
        clerk.user != nil && appState.isPremiumSubscriber && !(appState.favorites.isEmpty && appState.favoriteRivers.isEmpty)
    }

    var body: some View {
        Group {
            if clerk.user == nil {
                ContentUnavailableView {
                    Label("Sign in to see what you’ve saved", systemImage: "person.crop.circle")
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
                    Label("Saving is part of Premium", systemImage: "crown")
                } actions: {
                    NavigationLink("View Membership") { MembershipView() }
                        .buttonStyle(.borderedProminent)
                }
            } else if appState.favorites.isEmpty && appState.favoriteRivers.isEmpty {
                ContentUnavailableView {
                    Label("Nothing saved yet", systemImage: "heart")
                } description: {
                    Text("Tap the heart on a river or station to save it.")
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if showsSegmentPicker {
                            SegmentedPills(
                                options: [(SavedSegment.rivers, "Rivers"), (SavedSegment.stations, "Stations")],
                                selection: $selectedSegment,
                                fill: true
                            )
                        }
                        if visibleSegment == .rivers {
                            ForEach(appState.favoriteRivers) { river in riverCard(river) }
                        } else {
                            ForEach(appState.favorites) { station in stationCard(station) }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
        .navigationTitle("Saved")
        .toolbar {
            if hasSaved {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isEditing ? "Done" : "Edit") {
                        withAnimation(.snappy) { isEditing.toggle() }
                    }
                    .fontWeight(isEditing ? .semibold : .regular)
                }
            }
        }
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

    private func stationCard(_ station: RiverStation) -> some View {
        HStack(spacing: 12) {
            if isEditing {
                removeButton(label: "Remove \(station.displayName)") { await remove(station) }
            }
            NavigationLink {
                StationDetailView(station: station)
            } label: {
                SavedStationCard(
                    station: station,
                    readings: readings,
                    loaded: loaded,
                    failed: readingsFailed,
                    weather: stationWeather[station.stationID]
                )
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button(role: .destructive) {
                    Task { await remove(station) }
                } label: {
                    Label("Remove", systemImage: "heart.slash")
                }
            }
        }
    }

    private func riverCard(_ river: SavedRiver) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if isEditing {
                removeButton(label: "Remove \(river.name.displayTitle)") { await remove(river) }
                    .padding(.top, 18)
            }
            VStack(spacing: 0) {
                Button {
                    openedRiver = river
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(river.name.displayTitle)
                                .font(.display(18))
                                .foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.leading)
                            Text("\(Province.name(for: river.province)) · \(stationCount(river.stations.count))")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.ink2)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink3)
                    }
                    .padding(14)
                }
                .buttonStyle(CardRowButtonStyle())
                .disabled(appState.isUpdatingFavoriteRiver(name: river.name, province: river.province))
                .contextMenu {
                    Button(role: .destructive) {
                        Task { await remove(river) }
                    } label: {
                        Label("Remove river", systemImage: "heart.slash")
                    }
                }
                ForEach(river.stations) { station in
                    Rectangle().fill(Theme.line).frame(height: 1)
                    NavigationLink {
                        StationDetailView(station: station)
                    } label: {
                        StationRow(station: station, readings: readings, loaded: loaded, failed: readingsFailed)
                    }
                    .buttonStyle(CardRowButtonStyle())
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .cardBackground()
        }
    }

    private func removeButton(label: String, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            Image(systemName: "minus.circle.fill")
                .font(.system(size: 22))
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, Theme.alertRed)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .transition(.move(edge: .leading).combined(with: .opacity))
    }

    @MainActor
    private func remove(_ station: RiverStation) async {
        do {
            _ = try await appState.toggleFavorite(station, clerk: clerk)
        } catch {
            requestError = error.localizedDescription
        }
    }

    @MainActor
    private func remove(_ river: SavedRiver) async {
        do {
            _ = try await appState.toggleFavoriteRiver(name: river.name, province: river.province, stations: river.stations, clerk: clerk)
        } catch {
            requestError = error.localizedDescription
        }
    }

    /// Weather for each saved station (not each station of a saved river), loaded in parallel; each card fills in
    /// as its station's weather arrives.
    @MainActor
    private func loadStationWeather() async {
        let stationIDs = appState.favorites.map(\.stationID)
        stationWeather = stationWeather.filter { stationIDs.contains($0.key) }
        await withTaskGroup(of: (String, SavedStationWeather).self) { group in
            for stationID in stationIDs {
                group.addTask {
                    async let weather = try? APIClient.currentWeather(stationID: stationID)
                    async let alerts = try? APIClient.weatherAlerts(stationID: stationID)
                    return (stationID, SavedStationWeather(weather: await weather, alerts: await alerts ?? []))
                }
            }
            for await (stationID, details) in group where !Task.isCancelled {
                stationWeather[stationID] = details
            }
        }
    }

    @MainActor
    private func loadLatestReadings() async {
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
        readings = result
        loaded = true
    }
}

struct SavedStationWeather {
    let weather: CurrentWeather?
    let alerts: [WeatherAlert]
}

/// A saved station: its name and how old the reading is, the reading and its change, the last day as a line,
/// the weather there now, and any alert.
struct SavedStationCard: View {
    let station: RiverStation
    let readings: LatestReadings
    let loaded: Bool
    let failed: Bool
    let weather: SavedStationWeather?
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"

    private var lead: LeadReading? {
        readings.readings[station.stationID].flatMap { LeadReading(reading: $0, trend: readings.trends[station.stationID]) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(station.displayName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                    Text(readings.status(for: station, loaded: loaded, failed: failed))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.ink3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let lead {
                    VStack(alignment: .trailing, spacing: 3) {
                        ReadingNumber(value: lead.formatted, unit: lead.unit, size: 22)
                        ChangeLabel(lead: lead)
                    }
                } else if !loaded {
                    ProgressView().controlSize(.small)
                }
            }
            let points = lead.map { TrendPoint.points(from: readings.trends[station.stationID], level: !$0.isFlow) } ?? []
            if points.count > 1 || weather?.weather != nil {
                HStack(spacing: 14) {
                    if let lead, points.count > 1 {
                        TrendSparkline(
                            points: points,
                            minSpan: lead.isFlow ? max(abs(lead.value) * 0.04, 0.05) : 0.05,
                            label: "The past 24 hours",
                            height: 30
                        )
                    } else {
                        Spacer()
                    }
                    if let current = weather?.weather {
                        HStack(spacing: 6) {
                            Image(systemName: WeatherCondition.symbol(forDescription: current.weather, isDay: current.isDay != 0))
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.ink2)
                            Text(degrees(current.temperature, unit: temperatureUnit))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(current.weather), \(degrees(current.temperature, unit: temperatureUnit))")
                    }
                }
            }
            if let alert = weather?.alerts.first {
                let palette = AlertPalette(alert)
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(palette.mark)
                    Text(weather!.alerts.count > 1 ? "\(alert.title) and \(weather!.alerts.count - 1) more" : alert.title)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                }
                .font(.system(size: 12.5, weight: .semibold))
            }
        }
        .padding(14)
        .cardBackground()
    }
}
