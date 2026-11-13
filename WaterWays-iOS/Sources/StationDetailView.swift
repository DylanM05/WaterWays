import ClerkKit
import ClerkKitUI
import MapKit
import SwiftUI

struct StationDetailView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @AppStorage("nativeDefaultStationTab") private var defaultStationTab = "water"
    let station: RiverStation
    @State private var selectedTab: StationDataTab = .water
    @State private var isAuthPresented = false
    @State private var showSubscriptionPrompt = false
    @State private var favoriteError: String?
    @State private var alerts: [WeatherAlert] = []
    /// The station's catalogue entry, for its name and location when it was opened from a search result.
    @State private var details: RiverStation?
    /// Pull to refresh bumps this; each tab reloads when it changes.
    @State private var refreshToken = 0

    private var shown: RiverStation { details ?? station }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !alerts.isEmpty {
                    WeatherAlertBanner(alerts: alerts)
                }
                SegmentedPills(options: StationDataTab.allCases.map { ($0, $0.title) }, selection: $selectedTab, fill: true)
                switch selectedTab {
                case .water: WaterTab(station: shown, refreshToken: refreshToken)
                case .weather: StationWeatherTab(station: shown, refreshToken: refreshToken)
                case .history: StationHistoryTab(station: shown, refreshToken: refreshToken)
                case .map: StationMapView(station: shown)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .background(Theme.bg)
        .navigationTitle(shown.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            selectedTab = StationDataTab(setting: defaultStationTab)
        }
        .refreshable { refreshToken += 1 }
        // Safety information, so it's shown to everyone; a failed check just shows no banner.
        .task(id: refreshToken) { alerts = (try? await APIClient.weatherAlerts(stationID: station.stationID)) ?? [] }
        .task {
            guard station.latitude == nil || station.province.isEmpty else { return }
            details = try? await APIClient.coordinates(stationID: station.stationID)
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    Text(shown.displayName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text(station.stationID)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.ink3)
                }
                .accessibilityElement(children: .combine)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    guard clerk.user != nil else {
                        isAuthPresented = true
                        return
                    }
                    Task {
                        do {
                            let result = try await appState.toggleFavorite(shown, clerk: clerk)
                            showSubscriptionPrompt = result == .subscriptionRequired
                            if result == .signedOut { isAuthPresented = true }
                        } catch {
                            favoriteError = error.localizedDescription
                        }
                    }
                } label: {
                    Image(systemName: appState.isFavorite(station) ? "heart.fill" : "heart")
                        .foregroundStyle(appState.isFavorite(station) ? Theme.accent : Theme.ink)
                }
                .disabled(appState.isUpdatingFavorite(station))
                .accessibilityLabel(appState.isFavorite(station) ? "Remove from saved stations" : "Save station")
            }
        }
        .sheet(isPresented: $isAuthPresented) { AuthView() }
        .alert("Premium required", isPresented: $showSubscriptionPrompt) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("A premium membership is required to save stations.")
        }
        .alert("Couldn’t update saved stations", isPresented: Binding(
            get: { favoriteError != nil },
            set: { if !$0 { favoriteError = nil } }
        )) {
            Button("OK", role: .cancel) { favoriteError = nil }
        } message: {
            Text(favoriteError ?? "Please try again.")
        }
    }
}

enum StationDataTab: String, CaseIterable, Identifiable {
    case water, weather, history, map
    var id: String { rawValue }
    var title: String {
        switch self {
        case .water: "Water"
        case .weather: "Weather"
        case .history: "History"
        case .map: "Map"
        }
    }

    /// The saved default tab. Pressure and the forecasts were tabs of their own before they joined Weather.
    init(setting: String) {
        switch setting {
        case "pressure", "hourly", "weekly", "hourlyforecast", "weeklyforecast": self = .weather
        default: self = StationDataTab(rawValue: setting) ?? .water
        }
    }
}

struct StationMetricCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(title, systemImage: icon).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline).foregroundStyle(.primary)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 13)
    }
}

struct StationMapView: View {
    let station: RiverStation

    var body: some View {
        Group {
            if let latitude = station.latitude.flatMap(Double.init),
               let longitude = station.longitude.flatMap(Double.init) {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                    span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
                ))) {
                    Marker(station.displayName, coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
                        .tint(Theme.accent)
                }
                .mapControls { MapCompass(); MapScaleView() }
            } else {
                ContentUnavailableView("Location unavailable", systemImage: "map")
            }
        }
        .frame(height: 440)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.line))
    }
}

/// Environment Canada alerts covering the station; tapping shows the full text.
struct WeatherAlertBanner: View {
    let alerts: [WeatherAlert]
    @State private var isPresented = false

    var body: some View {
        let palette = AlertPalette(alerts.first)
        Button { isPresented = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.on)
                    .frame(width: 28, height: 28)
                    .background(palette.mark, in: Circle())
                (Text(alerts[0].title).fontWeight(.bold)
                    + Text(alerts.count > 1 ? " and \(alerts.count - 1) more" : ""))
                    .font(.system(size: 13))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(palette.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(palette.background, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(palette.line))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Shows the full alert")
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                List {
                    ForEach(alerts) { alert in
                        Section {
                            if let area = alert.area { LabeledContent("Area", value: area) }
                            if let issued = WeatherAlert.date(alert.issued) {
                                LabeledContent("Issued", value: issued.formatted(date: .abbreviated, time: .shortened))
                            }
                            if let ends = WeatherAlert.date(alert.eventEnds ?? alert.expires) {
                                LabeledContent("Until", value: ends.formatted(date: .abbreviated, time: .shortened))
                            }
                            Text(alert.text).font(.callout).textSelection(.enabled)
                        } header: {
                            Text(alert.title)
                        }
                    }
                    Section {
                        Text("Source: Environment and Climate Change Canada. Contains information licensed under the Open Government Licence – Canada.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .navigationTitle("Weather alerts")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { isPresented = false }
                    }
                }
            }
        }
    }
}
