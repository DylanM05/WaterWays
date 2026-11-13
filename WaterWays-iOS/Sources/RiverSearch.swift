import SwiftUI

/// The Explore search field, set on the animated river.
struct RiverSearchField: View {
    @Binding var text: String
    var focused: FocusState<Bool>.Binding
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 58

    var body: some View {
        ZStack {
            RiverWater(focused: focused.wrappedValue)
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .semibold))
                    .accessibilityHidden(true)
                TextField("Search", text: $text, prompt: Text("Search").foregroundStyle(.white.opacity(0.94)))
                    .font(.system(size: 17, weight: .medium))
                    .tint(.white)
                    .focused(focused)
                    .submitLabel(.search)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Search a river, lake or station")
                if !text.isEmpty {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 17))
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .foregroundStyle(.white)
            .shadow(color: Color(red: 0, green: 0.086, blue: 0.102).opacity(0.5), radius: 1, y: 1)
            .shadow(color: Theme.waterDeep, radius: 6)
            .padding(.horizontal, 22)
        }
        .frame(height: height)
        .contentShape(Rectangle())
        .onTapGesture { focused.wrappedValue = true }
    }
}

/// Rivers and stations whose names match the query, after a pause in typing: up to three rivers and five
/// stations, the stations with their latest reading once it arrives.
struct RiverSearchState {
    enum Status { case idle, searching, done, failed }

    static let minimumLength = 2

    var status = Status.idle
    var text = ""
    var rivers: [SearchResult] = []
    var stations: [SearchResult] = []
    var readings = LatestReadings(readings: [:], lastReported: [:])

    /// Runs inside `.task(id:)`, so a newer query cancels this one.
    @MainActor
    static func run(_ text: String, current: RiverSearchState) async -> RiverSearchState {
        guard text.count >= minimumLength else { return RiverSearchState() }
        var state = current
        state.status = .searching
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return state }
        do {
            async let rivers = APIClient.searchRivers(query: text)
            async let stations = APIClient.searchStations(query: text)
            state = RiverSearchState(status: .done, text: text, rivers: Array(try await rivers.prefix(3)), stations: Array(try await stations.prefix(5)))
        } catch {
            return RiverSearchState(status: Task.isCancelled ? .searching : .failed, text: text)
        }
        // The rows show without readings if these don't come.
        if !state.stations.isEmpty, let readings = try? await APIClient.latestWaterData(stationIDs: state.stations.map(\.stationID)) {
            state.readings = readings
        }
        return state
    }
}

struct RiverSearchPanel: View {
    let state: RiverSearchState
    let query: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if state.status == .failed {
                message("Search isn’t working right now", detail: "Check your connection and try again.")
            } else if state.rivers.isEmpty && state.stations.isEmpty {
                if state.status == .done {
                    message("No rivers or stations match “\(query)”", detail: "Search by the name of a river, lake or the place a station is at.")
                } else {
                    message(nil, detail: "Searching…")
                }
            } else {
                if !state.rivers.isEmpty {
                    group("Rivers")
                    ForEach(state.rivers) { river in
                        NavigationLink {
                            RiverLoaderView(name: river.stationName, province: river.province)
                        } label: {
                            row(icon: "water.waves", name: river.stationName.displayTitle) {
                                Text(Province.name(for: river.province))
                            } trailing: {
                                EmptyView()
                            }
                        }
                        .buttonStyle(SearchRowButtonStyle())
                    }
                }
                if !state.stations.isEmpty {
                    group("Stations")
                    ForEach(state.stations) { station in
                        NavigationLink {
                            StationDetailView(station: station.station)
                        } label: {
                            row(icon: "drop", name: station.stationName.displayTitle) {
                                Text(station.stationID).font(.system(size: 12, design: .monospaced))
                            } trailing: {
                                if let reading = state.readings.readings[station.stationID],
                                   let lead = LeadReading(reading: reading, trend: state.readings.trends[station.stationID]) {
                                    VStack(alignment: .trailing, spacing: 2) {
                                        ReadingNumber(value: lead.formatted, unit: lead.unit, size: 18)
                                        ChangeLabel(lead: lead)
                                    }
                                }
                            }
                        }
                        .buttonStyle(SearchRowButtonStyle())
                    }
                }
            }
        }
        .padding(6)
        .cardBackground(cornerRadius: 16)
        .shadow(color: Color(red: 0.03, green: 0.11, blue: 0.13).opacity(0.18), radius: 20, y: 12)
    }

    private func group(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(Theme.ink3)
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 4)
            .accessibilityAddTraits(.isHeader)
    }

    private func message(_ title: String?, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let title { Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink) }
            Text(detail).font(.system(size: 13.5)).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row<Sub: View, Trailing: View>(
        icon: String, name: String, @ViewBuilder sub: () -> Sub, @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 32, height: 32)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 9))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(highlighted(name)).font(.system(size: 14.5)).foregroundStyle(Theme.ink)
                sub().font(.system(size: 12.5)).foregroundStyle(Theme.ink3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    /// The matched part of the name in bold.
    private func highlighted(_ name: String) -> AttributedString {
        var text = AttributedString(name)
        if let range = text.range(of: query, options: .caseInsensitive) {
            text[range].font = .system(size: 14.5, weight: .bold)
        }
        return text
    }
}

private struct SearchRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .background(configuration.isPressed ? Theme.sunk : .clear, in: RoundedRectangle(cornerRadius: 11))
    }
}

extension Province {
    static func name(for code: String) -> String {
        all.first { $0.code == code.uppercased() }?.name ?? code
    }
}

/// A river found by search: its stations come from the province's river list.
struct RiverLoaderView: View {
    let name: String
    let province: String
    @State private var stations: [RiverStation]?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let stations, !stations.isEmpty {
                RiverDetailView(name: name, province: province, stations: stations)
            } else if stations != nil {
                ContentUnavailableView("No stations found", systemImage: "water.waves")
            } else if let errorMessage {
                ErrorState(message: errorMessage, retry: load)
            } else {
                ProgressView()
            }
        }
        .background(Theme.bg)
        .task { await load() }
    }

    @MainActor
    private func load() async {
        errorMessage = nil
        guard let place = Province.all.first(where: { $0.code == province.uppercased() }) else {
            stations = []
            return
        }
        do {
            let rivers = try await APIClient.rivers(in: place)
            stations = rivers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
