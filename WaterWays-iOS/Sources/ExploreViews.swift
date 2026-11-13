import Charts
import ClerkKit
import ClerkKitUI
import SwiftUI

struct ExploreView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @State private var query = ""
    @FocusState private var searchFocused: Bool
    @State private var search = RiverSearchState()
    @State private var counts: [String: ProvinceCount] = [:]
    @State private var saved = LatestReadings(readings: [:], lastReported: [:])

    private var searchText: String { query.trimmingCharacters(in: .whitespaces) }

    /// Saving is a premium feature, so a lapsed member's old favourites aren't shown here.
    private var savedStations: [RiverStation] {
        clerk.user != nil && appState.isPremiumSubscriber ? appState.favorites : []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Explore")
                        .font(.display(34, relativeTo: .largeTitle))
                        .tracking(-0.85)
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    AccountAvatar()
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)

                RiverSearchField(text: $query, focused: $searchFocused)
                    .padding(.top, 10)
                    .padding(.bottom, 2)

                if searchText.count >= RiverSearchState.minimumLength {
                    RiverSearchPanel(state: search, query: searchText)
                        .padding(.horizontal, 12)
                        .padding(.top, 6)
                } else {
                    if !savedStations.isEmpty { savedSection }
                    places("Provinces", Province.all.filter { !$0.isTerritory })
                    places("Territories", Province.all.filter(\.isTerritory))
                }
            }
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Theme.bg)
        .navigationTitle("Explore")
        .toolbar(.hidden, for: .navigationBar)
        .task(id: searchText) { search = await RiverSearchState.run(searchText, current: search) }
        #if DEBUG
        .onAppear { if let text = DebugLaunch.search { query = text } }
        .navigationDestination(isPresented: .constant(DebugLaunch.stationID != nil)) {
            if let stationID = DebugLaunch.stationID {
                StationDetailView(station: RiverStation(stationName: stationID, stationID: stationID, province: "", latitude: nil, longitude: nil, section: nil))
            }
        }
        #endif
        .task { await loadCounts() }
        .task(id: savedStations.map(\.stationID)) { await loadSavedReadings() }
        .refreshable {
            await loadCounts()
            await loadSavedReadings()
        }
    }

    private var savedSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(title: "Saved") {
                Button("See all") { appState.selectedTab = .saved }
                    .font(.system(size: 15, weight: .semibold))
                    .tint(Theme.accent)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(savedStations) { station in
                        NavigationLink {
                            StationDetailView(station: station)
                        } label: {
                            SavedMiniCard(
                                station: station,
                                reading: saved.readings[station.stationID],
                                trend: saved.trends[station.stationID]
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func places(_ title: String, _ places: [Province]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(title)
            VStack(spacing: 0) {
                ForEach(Array(places.enumerated()), id: \.element.id) { index, province in
                    if index > 0 { Rectangle().fill(Theme.line).frame(height: 1) }
                    NavigationLink {
                        RiverListView(province: province)
                    } label: {
                        ProvinceRow(province: province, stations: counts[province.code]?.stations)
                    }
                    .buttonStyle(CardRowButtonStyle())
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .cardBackground()
            .padding(.horizontal, 16)
        }
    }

    @MainActor
    private func loadCounts() async {
        // The rows work without counts, so a failure just leaves them off.
        if let result = try? await APIClient.provinceCounts() { counts = result }
    }

    @MainActor
    private func loadSavedReadings() async {
        let stationIDs = savedStations.map(\.stationID)
        guard !stationIDs.isEmpty else { return }
        if let result = try? await APIClient.latestWaterData(stationIDs: stationIDs), !Task.isCancelled {
            saved = result
        }
    }
}

/// The signed-in member's initials (or a person icon), opening the Account tab.
private struct AccountAvatar: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState

    private var initials: String? {
        guard let user = clerk.user else { return nil }
        let letters = [user.firstName, user.lastName].compactMap { $0?.first.map(String.init) }.joined()
        if !letters.isEmpty { return letters.uppercased() }
        return user.primaryEmailAddress?.emailAddress.first.map { String($0).uppercased() }
    }

    var body: some View {
        Button {
            appState.selectedTab = .account
        } label: {
            Group {
                if let initials {
                    Text(initials).font(.system(size: 13, weight: .bold))
                } else {
                    Image(systemName: "person.fill").font(.system(size: 14, weight: .semibold))
                }
            }
            .foregroundStyle(Theme.accent)
            .frame(width: 34, height: 34)
            .background(Theme.accentSoft, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Account")
    }
}

private struct ProvinceRow: View {
    let province: Province
    let stations: Int?

    var body: some View {
        HStack(spacing: 12) {
            Text(province.code)
                .font(.display(12.5, relativeTo: .caption1))
                .foregroundStyle(Theme.accent)
                .frame(width: 34, height: 34)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            Text(province.name)
                .font(.system(size: 16))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let stations {
                Text(stations == 1 ? "1 station" : "\(stations.formatted()) stations")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink3)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.ink3)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 54)
    }
}

/// A saved station on the Explore tab: its name, how old the reading is, the reading and its change, and the
/// last day as a line.
struct SavedMiniCard: View {
    let station: RiverStation
    let reading: LatestWaterReading?
    let trend: WaterTrend?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(station.displayName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(reading?.date.map { TimeAgo.label($0) } ?? " ")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.ink3)
            }
            if let reading, let lead = LeadReading(reading: reading, trend: trend) {
                HStack(alignment: .firstTextBaseline) {
                    ReadingNumber(value: lead.formatted, unit: lead.unit, size: 28)
                    Spacer(minLength: 6)
                    ChangeLabel(lead: lead)
                }
                TrendSparkline(
                    points: TrendPoint.points(from: trend, level: !lead.isFlow),
                    minSpan: lead.isFlow ? max(abs(lead.value) * 0.04, 0.05) : 0.05,
                    label: "The past 24 hours"
                )
            } else {
                Text(reading == nil ? " " : station.noReadingMessage)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink2)
                    .frame(height: 78, alignment: .topLeading)
            }
        }
        .padding(14)
        .frame(width: 236, alignment: .leading)
        .cardBackground()
    }
}

struct RiverListView: View {
    let province: Province
    @State private var rivers: [String: [RiverStation]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var filter = ""

    private var riverNames: [String] {
        let names = rivers.keys.sorted()
        guard !filter.isEmpty else { return names }
        return names.filter { $0.localizedCaseInsensitiveContains(filter) }
    }

    /// Rivers grouped by first letter for the alphabetical sections.
    private var groupedRiverNames: [(letter: String, names: [String])] {
        Dictionary(grouping: riverNames) { String($0.prefix(1)).uppercased() }
            .sorted { $0.key < $1.key }
            .map { (letter: $0.key, names: $0.value) }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading rivers")
            } else if let errorMessage {
                ErrorState(message: errorMessage, retry: loadRivers)
            } else if rivers.isEmpty {
                ContentUnavailableView("No rivers found", systemImage: "water.waves")
            } else {
                List {
                    ForEach(groupedRiverNames, id: \.letter) { group in
                        Section(group.letter) {
                            ForEach(group.names, id: \.self) { name in
                                NavigationLink {
                                    RiverDetailView(name: name, province: province.code, stations: rivers[name] ?? [])
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(name.displayTitle).font(.body.weight(.medium))
                                        Text(stationCount(rivers[name]?.count ?? 0))
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    }
                }
                .themedList()
                .overlay {
                    if riverNames.isEmpty {
                        ContentUnavailableView.search(text: filter)
                    }
                }
            }
        }
        .navigationTitle(province.name)
        .searchable(text: $filter, prompt: "Filter rivers in \(province.name)")
        .task { await loadRivers() }
        .refreshable { await loadRivers() }
    }

    @MainActor
    private func loadRivers() async {
        isLoading = true
        errorMessage = nil
        do {
            rivers = try await APIClient.rivers(in: province)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

func stationCount(_ count: Int) -> String {
    count == 1 ? "1 monitoring station" : "\(count) monitoring stations"
}

struct RiverDetailView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    let name: String
    let province: String
    let stations: [RiverStation]
    @State private var latestReadings: [String: LatestWaterReading] = [:]
    @State private var lastReported = LatestReadings(readings: [:], lastReported: [:])
    @State private var readingsFailed = false
    @State private var completedReadingIDs: Set<String> = []
    @State private var isAuthPresented = false
    @State private var showSubscriptionPrompt = false
    @State private var favoriteError: String?

    private var isFavorite: Bool { appState.isFavoriteRiver(name: name, province: province) }

    var body: some View {
        List {
            Section(stationCount(stations.count)) {
                ForEach(stations) { station in
                    NavigationLink {
                        StationDetailView(station: station)
                    } label: {
                        VStack(alignment: .leading, spacing: 11) {
                            Text(station.displaySection).font(.body.weight(.semibold))
                            Text("Station \(station.stationID)")
                                .font(.caption).foregroundStyle(.secondary)
                            readingPreview(for: station)
                        }
                        .padding(.vertical, 7)
                    }
                }
            }
        }
        .themedList()
        .navigationTitle(name.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    guard clerk.user != nil else {
                        isAuthPresented = true
                        return
                    }
                    Task {
                        do {
                            let result = try await appState.toggleFavoriteRiver(
                                name: name,
                                province: province,
                                stations: stations,
                                clerk: clerk
                            )
                            showSubscriptionPrompt = result == .subscriptionRequired
                            if result == .signedOut { isAuthPresented = true }
                        } catch {
                            favoriteError = error.localizedDescription
                        }
                    }
                } label: {
                    Image(systemName: isFavorite ? "heart.fill" : "heart")
                        .foregroundStyle(isFavorite ? .red : .primary)
                }
                .disabled(appState.isUpdatingFavoriteRiver(name: name, province: province))
                .accessibilityLabel(isFavorite ? "Remove river from favorites" : "Save river")
            }
        }
        .task { await loadLatestReadings() }
        .task(id: isFavorite) {
            await appState.refreshSavedRiverIfNeeded(name: name, province: province, stations: stations, clerk: clerk)
        }
        .refreshable { await loadLatestReadings() }
        .sheet(isPresented: $isAuthPresented) { AuthView() }
        .alert("Premium required", isPresented: $showSubscriptionPrompt) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("A premium membership is required to save rivers.")
        }
        .alert("Couldn’t update saved rivers", isPresented: Binding(
            get: { favoriteError != nil },
            set: { if !$0 { favoriteError = nil } }
        )) {
            Button("OK", role: .cancel) { favoriteError = nil }
        } message: {
            Text(favoriteError ?? "Please try again.")
        }
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

    @MainActor
    private func loadLatestReadings() async {
        latestReadings = [:]
        completedReadingIDs = []
        let stationIDs = stations.map(\.stationID)
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
        // A newer load has started; let it fill the rows.
        guard !Task.isCancelled else { return }
        latestReadings = result.readings
        lastReported = result
        completedReadingIDs = Set(stationIDs)
    }
}

struct CompactReading: View {
    let title: String
    let value: String
    let icon: String
    /// A line under the value, such as the change over 24 hours.
    var detail: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(title, systemImage: icon)
                .font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.bold)).foregroundStyle(.primary)
            if let detail {
                Text(detail)
                    .font(.caption2).foregroundStyle(.secondary)
                    .accessibilityLabel(detail.replacingOccurrences(of: "▲", with: "Up").replacingOccurrences(of: "▼", with: "Down"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 9))
    }
}

/// Levels to the centimetre; flows to about three significant figures. A change is shown to the same
/// decimals as the reading beside it.
enum WaterFormat {
    static func flowDecimals(_ value: Double) -> Int {
        abs(value) >= 100 ? 0 : abs(value) >= 10 ? 1 : 2
    }

    static func number(_ value: Double, decimals: Int) -> String {
        value.formatted(.number.precision(.fractionLength(decimals)))
    }

    static func level(_ value: Double) -> String { number(value, decimals: 2) }
    static func flow(_ value: Double) -> String { number(value, decimals: flowDecimals(value)) }

    /// "▼ 0.07 m in 24 h", "Steady over 24 h", or nil when the change isn't known.
    static func change(_ change: Double?, decimals: Int, unit: String) -> String? {
        guard let change else { return nil }
        if abs(change) < 0.5 * pow(10, -Double(decimals)) { return "Steady over 24 h" }
        return "\(change > 0 ? "▲" : "▼") \(number(abs(change), decimals: decimals)) \(unit) in 24 h"
    }
}

/// A station's latest level and flow, each with its change over 24 hours, a line of the last day, and when
/// it was measured. Used on river pages and the Saved tab.
struct StationReadingSummary: View {
    let reading: LatestWaterReading
    let trend: WaterTrend?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                if let waterLevel = reading.waterLevel {
                    CompactReading(
                        title: "Water level", value: "\(WaterFormat.level(waterLevel)) m", icon: "drop.fill",
                        detail: WaterFormat.change(trend?.change.waterLevel, decimals: 2, unit: "m")
                    )
                }
                if let discharge = reading.discharge {
                    CompactReading(
                        title: "Discharge", value: "\(WaterFormat.flow(discharge)) m³/s", icon: "water.waves",
                        detail: WaterFormat.change(trend?.change.discharge, decimals: WaterFormat.flowDecimals(discharge), unit: "m³/s")
                    )
                }
            }
            let points = trendPoints
            if points.count > 1, let first = points.first, let last = points.last {
                let unit = reading.waterLevel != nil ? "m" : "m³/s"
                let format = reading.waterLevel != nil ? WaterFormat.level : WaterFormat.flow
                TrendSparkline(
                    points: points,
                    minSpan: reading.waterLevel != nil ? 0.05 : max(abs(reading.discharge ?? 0) * 0.04, 0.05),
                    label: "\(reading.waterLevel != nil ? "Water level" : "Discharge") over the past 24 hours, from \(format(first.value)) to \(format(last.value)) \(unit)"
                )
            }
            // "Updated 42 minutes ago", as on the website; older readings show their date.
            if let date = reading.date {
                Label {
                    if Date.now.timeIntervalSince(date) < 2 * 24 * 60 * 60 {
                        Text("Updated \(date, format: .relative(presentation: .named))")
                    } else {
                        Text("Updated \(reading.formattedTime)")
                    }
                } icon: {
                    Image(systemName: "clock")
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var trendPoints: [TrendPoint] {
        TrendPoint.points(from: trend, level: reading.waterLevel != nil)
    }
}

struct TrendPoint: Identifiable {
    let date: Date
    let value: Double
    let run: Int

    var id: Date { date }

    /// The last day's hourly level, or flow when `level` is false. A new run starts after a gap of more than
    /// 90 minutes, so missing hours aren't drawn as a straight line.
    static func points(from trend: WaterTrend?, level: Bool) -> [TrendPoint] {
        guard let trend else { return [] }
        let utc = TimeZone(identifier: "UTC")!
        var points: [TrendPoint] = []
        var run = 0
        for hour in trend.hourly {
            guard let value = level ? hour.waterLevel : hour.discharge,
                  let date = StationDate.parse(hour.dateTime, format: "yyyy-MM-dd HH:mm:ss", timeZone: utc) else { continue }
            if let previous = points.last, date.timeIntervalSince(previous.date) > 90 * 60 { run += 1 }
            points.append(TrendPoint(date: date, value: value, run: run))
        }
        return points
    }
}

/// The last day as a small line over a tinted fill, with the newest hour marked. minSpan is the smallest range
/// the height stands for, so a nearly flat river looks flat.
struct TrendSparkline: View {
    let points: [TrendPoint]
    let minSpan: Double
    let label: String
    var height: CGFloat = 34

    private var domain: ClosedRange<Double> {
        let values = points.map(\.value)
        let low = values.min() ?? 0
        let high = values.max() ?? 0
        let middle = (low + high) / 2
        let half = max(high - low, minSpan) / 2 * 1.25
        return (middle - half)...(middle + half)
    }

    var body: some View {
        let floor = domain.lowerBound
        Chart {
            ForEach(points) { point in
                AreaMark(
                    x: .value("Time", point.date),
                    yStart: .value("Base", floor),
                    yEnd: .value("Value", point.value),
                    series: .value("Run", point.run)
                )
                .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.22), Theme.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Time", point.date), y: .value("Value", point.value), series: .value("Run", point.run))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round))
            }
            if let newest = points.last {
                PointMark(x: .value("Time", newest.date), y: .value("Value", newest.value))
                    .foregroundStyle(Theme.accent)
                    .symbolSize(28)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .chartYScale(domain: domain)
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
