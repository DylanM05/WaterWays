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

    var body: some View {
        VStack(spacing: 0) {
            if !alerts.isEmpty {
                WeatherAlertBanner(alerts: alerts)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StationDataTab.allCases) { tab in
                        Button { selectedTab = tab } label: {
                            HStack(spacing: 5) {
                                if tab == .history && !appState.isPremiumSubscriber {
                                    Image(systemName: "lock.fill").font(.caption2)
                                }
                                Text(tab.title)
                            }
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(selectedTab == tab ? .white : .primary)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(selectedTab == tab ? Theme.accent : Theme.surface, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            if selectedTab == .map {
                StationMapView(station: station)
            } else {
                StationDataPanel(station: station, tab: selectedTab)
            }
        }
        .background(Theme.bg)
        .navigationTitle(station.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            selectedTab = StationDataTab(rawValue: defaultStationTab) ?? .water
        }
        // Safety information, so it's shown to everyone; a failed check just shows no banner.
        .task { alerts = (try? await APIClient.weatherAlerts(stationID: station.stationID)) ?? [] }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    guard clerk.user != nil else {
                        isAuthPresented = true
                        return
                    }
                    Task {
                        do {
                            let result = try await appState.toggleFavorite(station, clerk: clerk)
                            showSubscriptionPrompt = result == .subscriptionRequired
                            if result == .signedOut { isAuthPresented = true }
                        } catch {
                            favoriteError = error.localizedDescription
                        }
                    }
                } label: {
                    Image(systemName: appState.isFavorite(station) ? "heart.fill" : "heart")
                        .foregroundStyle(appState.isFavorite(station) ? .red : .primary)
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
    case water, history, pressure, weather, hourly, weekly, map
    var id: String { rawValue }
    var title: String {
        switch self {
        case .water: "Water"
        case .history: "History"
        case .pressure: "Pressure"
        case .weather: "Current weather"
        case .hourly: "Hourly forecast"
        case .weekly: "Weekly forecast"
        case .map: "Map"
        }
    }
    var path: String? {
        switch self {
        case .water: "details/water-data/{id}/1"
        case .history: nil
        case .pressure: "details/pressure/{id}"
        case .weather: "details/weather/{id}"
        case .hourly: "details/weather/hourly/{id}"
        case .weekly: "details/weather/weekly/{id}"
        case .map: nil
        }
    }
}

struct StationDataPanel: View {
    let station: RiverStation
    let tab: StationDataTab

    var body: some View {
        switch tab {
        case .water: WaterChartPanel(station: station)
        case .history: HistoryPanel(station: station)
        case .pressure: PressureChartPanel(station: station)
        case .weather: CurrentWeatherPanel(station: station)
        case .hourly: HourlyForecastPanel(station: station)
        case .weekly: WeeklyForecastPanel(station: station)
        case .map: StationMapView(station: station)
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
        if let latitude = station.latitude.flatMap(Double.init),
           let longitude = station.longitude.flatMap(Double.init) {
            Map(initialPosition: .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
            ))) {
                Marker(station.displayName, coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
            }
            .mapControls { MapCompass(); MapScaleView() }
        } else {
            ContentUnavailableView("Location unavailable", systemImage: "map")
        }
    }
}

extension WeatherAlert {
    /// Environment Canada's risk colour when it gives one, otherwise by alert type.
    var tint: Color {
        switch colour?.lowercased() ?? "" {
        case "red": return .red
        case "orange": return .orange
        case "yellow": return .yellow
        default:
            switch type {
            case "warning": return .red
            case "watch": return .orange
            default: return .yellow
            }
        }
    }
}

/// Environment Canada alerts covering the station; tapping shows the full text.
struct WeatherAlertBanner: View {
    let alerts: [WeatherAlert]
    @State private var isPresented = false

    private var tint: Color { alerts.first?.tint ?? .yellow }

    var body: some View {
        Button { isPresented = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill").font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(alerts[0].title).font(.subheadline.weight(.semibold))
                    Text(alerts.count > 1 ? "and \(alerts.count - 1) more · Environment Canada" : "Environment Canada")
                        .font(.caption)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }
            .foregroundStyle(tint == .yellow ? Color.black : Color.white)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(tint, in: RoundedRectangle(cornerRadius: 12))
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
