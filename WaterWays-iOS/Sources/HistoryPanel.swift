import Charts
import ClerkKit
import ClerkKitUI
import SwiftUI

enum HistoryMode: String, CaseIterable, Identifiable {
    case timeline, seasonal
    var id: String { rawValue }
    var title: String { self == .timeline ? "Over time" : "Typical year" }
}

enum HistoryRange: String, CaseIterable, Identifiable {
    case days30, days90, year1, years5, years10, years25, all, custom
    var id: String { rawValue }
    var title: String {
        switch self {
        case .days30: "Past 30 days"
        case .days90: "Past 90 days"
        case .year1: "Past year"
        case .years5: "Past 5 years"
        case .years10: "Past 10 years"
        case .years25: "Past 25 years"
        case .all: "All records"
        case .custom: "Custom"
        }
    }

    /// Length in days; nil for all records and custom ranges.
    var days: Int? {
        switch self {
        case .days30: 30
        case .days90: 90
        case .year1: 365
        case .years5: 5 * 365 + 1
        case .years10: 10 * 365 + 2
        case .years25: 25 * 365 + 6
        case .all, .custom: nil
        }
    }

    /// A typical year needs several years of data to average.
    var supportsSeasonal: Bool { days.map { $0 >= 5 * 365 } ?? true }
}

enum HistoryInterval: String, CaseIterable, Identifiable {
    case day, week, month, year
    var id: String { rawValue }
    var title: String {
        switch self {
        case .day: "Daily"
        case .week: "Weekly"
        case .month: "Monthly"
        case .year: "Yearly"
        }
    }

    /// Daily means are only archived for about a year, so the server limits these spans.
    var maximumSpanDays: Int? { self == .day || self == .week ? 366 : nil }

    /// Spacing between points beyond which the line breaks, because data is missing.
    var gapThreshold: TimeInterval {
        let day: TimeInterval = 24 * 60 * 60
        switch self {
        case .day: return 1.5 * day
        case .week: return 8.5 * day
        case .month: return 45 * day
        case .year: return 400 * day
        }
    }

    func label(for date: Date) -> String {
        switch self {
        case .day: date.formatted(date: .abbreviated, time: .omitted)
        case .week: "Week of \(date.formatted(.dateTime.month(.abbreviated).day().year()))"
        case .month: date.formatted(.dateTime.month(.wide).year())
        case .year: date.formatted(.dateTime.year())
        }
    }
}

enum HistoryDates {
    /// Server dates are calendar days, so they're read in the local time zone to keep labels on the right day.
    static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func date(_ string: String?) -> Date? { string.flatMap(formatter.date(from:)) }
    static func string(_ date: Date) -> String { formatter.string(from: date) }
}

struct HistoryChartPoint: Identifiable {
    let date: Date
    let average: Double
    let low: Double
    let high: Double
    let count: Int?
    /// Consecutive points share a segment; a gap in the data starts a new one.
    let segment: Int
    var id: Date { date }
}

struct HistoryPanel: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    let station: RiverStation
    @AppStorage("historyMode") private var mode: HistoryMode = .timeline
    @AppStorage("historyRange") private var range: HistoryRange = .years5
    @AppStorage("historyInterval") private var interval: HistoryInterval = .month
    @State private var metric: WaterMetric = .waterLevel
    @State private var customFrom = Calendar.current.date(byAdding: .year, value: -10, to: .now) ?? .now
    @State private var customTo = Date.now
    @State private var history: WaterHistory?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isLocked = false
    @State private var isAuthPresented = false
    @State private var selectedPoint: HistoryChartPoint?
    @State private var selectedMonth: Int?
    @State private var records: WaterRecords?

    private var spanDays: Int? {
        range == .custom ? Calendar.current.dateComponents([.day], from: customFrom, to: customTo).day : range.days
    }

    private func isAvailable(_ option: HistoryInterval) -> Bool {
        guard let limit = option.maximumSpanDays else { return true }
        return spanDays.map { $0 <= limit } ?? false
    }

    /// Falls back to monthly averages when the range is too long for daily data.
    private var effectiveInterval: HistoryInterval { isAvailable(interval) ? interval : .month }

    private var requestDates: (from: String?, to: String?) {
        switch range {
        case .custom:
            return (HistoryDates.string(customFrom), HistoryDates.string(customTo))
        case .all:
            return (nil, nil)
        default:
            let from = Calendar.current.date(byAdding: .day, value: -(range.days ?? 0), to: .now) ?? .now
            return (HistoryDates.string(from), nil)
        }
    }

    private var requestKey: String {
        [
            station.stationID, metric.rawValue, mode.rawValue, effectiveInterval.rawValue,
            requestDates.from ?? "", requestDates.to ?? "", clerk.user?.id ?? "", "\(appState.isPremiumSubscriber)"
        ].joined(separator: "|")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if clerk.user == nil {
                    lockedState(signedIn: false)
                } else if !appState.hasCheckedSubscription || (appState.isCheckingSubscription && !appState.isPremiumSubscriber) {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 250)
                } else if appState.subscriptionPlan == nil && !appState.isPremiumSubscriber {
                    // The status request failed; don't ask a member who may already pay to upgrade.
                    ErrorState(message: "Couldn’t check your membership.") {
                        try? await appState.refreshSubscriptionStatus(clerk: clerk)
                    }
                    .frame(minHeight: 250)
                } else if !appState.isPremiumSubscriber || isLocked {
                    lockedState(signedIn: true)
                } else {
                    controls
                    content
                    if let recordsMetric = metric == .waterLevel ? records?.waterLevel : records?.discharge {
                        recordsCard(recordsMetric)
                    }
                }
            }
            .padding(16)
        }
        .task(id: requestKey) { await load() }
        // Records don't depend on the range or interval, so they load once per station.
        .task(id: "\(station.stationID)|\(clerk.user?.id ?? "")|\(appState.isPremiumSubscriber)") { await loadRecords() }
        .refreshable { await load() }
        .onChange(of: mode) {
            if mode == .seasonal && !range.supportsSeasonal { range = .all }
        }
        .onChange(of: metric) { selectedPoint = nil; selectedMonth = nil }
        .sheet(isPresented: $isAuthPresented) { AuthView() }
    }

    private func lockedState(signedIn: Bool) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 40, weight: .medium))
                .foregroundStyle(Theme.accent)
            Text("Historical data").font(.title3.weight(.bold))
            Text("See years of archived water levels and flows, averaged by day, week, month or year, and compare this year with a typical one.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if signedIn {
                NavigationLink { MembershipView() } label: {
                    Label("Unlock with Premium", systemImage: "crown.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            } else {
                Button { isAuthPresented = true } label: {
                    Text("Sign In").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Text("Historical data is included with Premium.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .cardBackground(cornerRadius: 16)
    }

    private var controls: some View {
        VStack(spacing: 10) {
            Picker("Metric", selection: $metric) {
                ForEach(WaterMetric.allCases) { option in Text(option.title).tag(option) }
            }
            .pickerStyle(.segmented)
            Picker("View", selection: $mode) {
                ForEach(HistoryMode.allCases) { option in Text(option.title).tag(option) }
            }
            .pickerStyle(.segmented)
            HStack(spacing: 10) {
                Menu {
                    ForEach(HistoryRange.allCases.filter { mode == .timeline || $0.supportsSeasonal }) { option in
                        Button { range = option } label: {
                            if range == option { Label(option.title, systemImage: "checkmark") } else { Text(option.title) }
                        }
                    }
                } label: {
                    menuLabel(title: "Range", value: range.title)
                }
                if mode == .timeline {
                    Menu {
                        Section("Daily and weekly cover up to a year") {
                            ForEach(HistoryInterval.allCases) { option in
                                Button { interval = option } label: {
                                    if effectiveInterval == option { Label(option.title, systemImage: "checkmark") } else { Text(option.title) }
                                }
                                .disabled(!isAvailable(option))
                            }
                        }
                    } label: {
                        menuLabel(title: "Average", value: effectiveInterval.title)
                    }
                }
            }
            if range == .custom {
                VStack(spacing: 0) {
                    DatePicker("From", selection: $customFrom, in: earliestDate...customTo, displayedComponents: .date)
                        .padding(.vertical, 6)
                    Divider()
                    DatePicker("To", selection: $customTo, in: customFrom...Date.now, displayedComponents: .date)
                        .padding(.vertical, 6)
                }
                .padding(.horizontal, 12)
                .cardBackground(cornerRadius: 12)
            }
        }
    }

    private var earliestDate: Date {
        HistoryDates.date(history?.coverage.earliest) ?? Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1)) ?? .distantPast
    }

    private func menuLabel(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                Text(value).font(.subheadline.weight(.semibold))
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
            }
            .foregroundStyle(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 12)
    }

    @ViewBuilder
    private var content: some View {
        // Earlier results stay on screen (dimmed) while new parameters load, unless they're for the other view.
        if let history, (mode == .seasonal) == (history.interval == "season") {
            Group {
                if history.points.isEmpty {
                    ContentUnavailableView(
                        "No archived data",
                        systemImage: "clock.arrow.circlepath",
                        description: Text("There are no records for this range. Try a longer one.")
                    )
                    .frame(minHeight: 250)
                } else if mode == .seasonal {
                    seasonalSection(history)
                } else {
                    timelineSection(history)
                }
            }
            .opacity(isLoading ? 0.5 : 1)
        } else if let errorMessage {
            ErrorState(message: errorMessage) { await load() }.frame(minHeight: 250)
        } else {
            ProgressView("Loading history").frame(maxWidth: .infinity, minHeight: 250)
        }
    }

    // MARK: Over time

    private func timelinePoints(_ history: WaterHistory) -> [HistoryChartPoint] {
        let interval = HistoryInterval(rawValue: history.interval) ?? .month
        var segment = 0
        var previous: Date?
        return history.points.compactMap { point in
            guard let date = HistoryDates.date(point.date) else { return nil }
            if let previous, date.timeIntervalSince(previous) > interval.gapThreshold { segment += 1 }
            previous = date
            return HistoryChartPoint(date: date, average: point.average, low: point.low, high: point.high, count: point.count, segment: segment)
        }
    }

    @ViewBuilder
    private func timelineSection(_ history: WaterHistory) -> some View {
        let interval = HistoryInterval(rawValue: history.interval) ?? .month
        let points = timelinePoints(history)
        let partialYears = interval == .year ? points.filter { ($0.count ?? 12) < 12 }.count : 0
        // Markers only fit when there are few points.
        let showsMarkers = points.count < 40

        Chart {
            ForEach(points) { point in
                AreaMark(
                    x: .value("Date", point.date),
                    yStart: .value("Low", point.low),
                    yEnd: .value("High", point.high),
                    series: .value("Segment", point.segment)
                )
                .foregroundStyle(metric.color.opacity(0.15))
                LineMark(x: .value("Date", point.date), y: .value("Average", point.average), series: .value("Segment", point.segment))
                    .foregroundStyle(metric.color)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                if showsMarkers, interval == .year, (point.count ?? 12) < 12 {
                    PointMark(x: .value("Date", point.date), y: .value("Average", point.average))
                        .symbol {
                            Circle().strokeBorder(metric.color, lineWidth: 1.5)
                                .background(Circle().fill(Theme.surface))
                                .frame(width: 8, height: 8)
                        }
                } else if showsMarkers {
                    PointMark(x: .value("Date", point.date), y: .value("Average", point.average))
                        .foregroundStyle(metric.color)
                        .symbolSize(18)
                }
            }
            if let selectedPoint {
                RuleMark(x: .value("Selected", selectedPoint.date))
                    .foregroundStyle(.secondary.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, spacing: 8, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(interval.label(for: selectedPoint.date))
                            Text("Avg \(formatted(selectedPoint.average))").fontWeight(.semibold)
                            if selectedPoint.high > selectedPoint.low {
                                Text("\(formatted(selectedPoint.low)) – \(formatted(selectedPoint.high))")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .font(.caption)
                        .padding(8)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                    }
            }
        }
        .chartYScale(domain: yDomain(points.flatMap { [$0.low, $0.high] }))
        .chartYAxisLabel(metric.unit)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine()
                AxisValueLabel(format: xAxisFormat(points))
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0).onChanged { gesture in
                            guard let plotFrame = proxy.plotFrame else { return }
                            let x = gesture.location.x - geometry[plotFrame].minX
                            guard let date: Date = proxy.value(atX: x) else { return }
                            selectedPoint = points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
                        }
                    )
            }
        }
        .frame(height: 260)
        .padding(.top, 8)
        .cardBackground(cornerRadius: 14)
        .onChange(of: history.points.count) { selectedPoint = nil }

        if let summary = history.summary {
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    SummaryTile(title: "Average", value: formatted(summary.average), detail: "\(interval.title) averages")
                        .gridCellColumns(2)
                }
                GridRow {
                    SummaryTile(title: "Lowest", value: formatted(summary.low), detail: dateLabel(summary.lowDate, interval: interval), systemImage: "arrow.down")
                    SummaryTile(title: "Highest", value: formatted(summary.high), detail: dateLabel(summary.highDate, interval: interval), systemImage: "arrow.up")
                }
            }
        }
        footnote(history, notes: [
            Set(points.map(\.segment)).count > 1 ? "Breaks in the line are periods with no archived data." : nil,
            partialYears == 0 ? nil : showsMarkers
                ? "Hollow points are years with less than 12 months of data."
                : "\(partialYears) of \(points.count) years have less than 12 months of data, so their averages lean toward the months recorded."
        ])
    }

    // MARK: Typical year

    @ViewBuilder
    private func seasonalSection(_ history: WaterHistory) -> some View {
        let typical = history.points.filter { $0.month != nil }
        let recent = (history.recent ?? []).compactMap { point -> (month: Int, date: Date, average: Double)? in
            guard let date = HistoryDates.date(point.date) else { return nil }
            return (Calendar.current.component(.month, from: date), date, point.average)
        }
        .sorted { $0.month < $1.month }
        let monthSymbols = Calendar.current.shortMonthSymbols

        Chart {
            ForEach(typical) { point in
                AreaMark(x: .value("Month", point.month ?? 0), yStart: .value("Low", point.low), yEnd: .value("High", point.high))
                    .foregroundStyle(metric.color.opacity(0.15))
                LineMark(x: .value("Month", point.month ?? 0), y: .value("Typical", point.average), series: .value("Series", "Typical"))
                    .foregroundStyle(metric.color)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
            }
            ForEach(recent, id: \.month) { point in
                LineMark(x: .value("Month", point.month), y: .value("Last 12 months", point.average), series: .value("Series", "Recent"))
                    .foregroundStyle(.orange)
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 3]))
                PointMark(x: .value("Month", point.month), y: .value("Last 12 months", point.average))
                    .foregroundStyle(.orange)
                    .symbolSize(24)
            }
            if let selectedMonth, let point = typical.first(where: { $0.month == selectedMonth }) {
                RuleMark(x: .value("Selected", selectedMonth))
                    .foregroundStyle(.secondary.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, spacing: 8, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(Calendar.current.monthSymbols[selectedMonth - 1])
                            Text("Typical \(formatted(point.average))").fontWeight(.semibold)
                            if let lowYear = point.lowYear, let highYear = point.highYear {
                                Text("Low \(formatted(point.low)) (\(String(lowYear)))").foregroundStyle(.secondary)
                                Text("High \(formatted(point.high)) (\(String(highYear)))").foregroundStyle(.secondary)
                            }
                            if let latest = recent.first(where: { $0.month == selectedMonth }) {
                                Text("\(latest.date.formatted(.dateTime.year())): \(formatted(latest.average))").foregroundStyle(.orange)
                            }
                        }
                        .font(.caption)
                        .padding(8)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                    }
            }
        }
        .chartXScale(domain: 1...12)
        .chartYScale(domain: yDomain(typical.flatMap { [$0.low, $0.high] } + recent.map(\.average)))
        .chartYAxisLabel(metric.unit)
        .chartXAxis {
            AxisMarks(values: Array(stride(from: 1, through: 12, by: 2))) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let month = value.as(Int.self), (1...12).contains(month) { Text(monthSymbols[month - 1]) }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0).onChanged { gesture in
                            guard let plotFrame = proxy.plotFrame else { return }
                            let x = gesture.location.x - geometry[plotFrame].minX
                            guard let month: Double = proxy.value(atX: x) else { return }
                            selectedMonth = min(max(Int(month.rounded()), 1), 12)
                        }
                    )
            }
        }
        .frame(height: 260)
        .padding(.top, 8)
        .cardBackground(cornerRadius: 14)

        HStack(spacing: 16) {
            legendItem(color: metric.color, title: "Typical")
            legendItem(color: metric.color.opacity(0.3), title: "Range across years", isBand: true)
            if !recent.isEmpty { legendItem(color: .orange, title: "Last 12 months") }
        }
        .font(.caption)
        .foregroundStyle(.secondary)

        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            if let latest = recent.max(by: { $0.date < $1.date }),
               let usual = typical.first(where: { $0.month == latest.month }) {
                GridRow {
                    SummaryTile(
                        title: latest.date.formatted(.dateTime.month(.wide).year()),
                        value: formatted(latest.average),
                        detail: comparison(latest.average, to: usual.average, month: latest.month)
                    )
                    .gridCellColumns(2)
                }
            }
            if let peak = typical.max(by: { $0.average < $1.average }),
               let trough = typical.min(by: { $0.average < $1.average }),
               let peakMonth = peak.month, let troughMonth = trough.month {
                GridRow {
                    SummaryTile(title: "Usually highest", value: Calendar.current.monthSymbols[peakMonth - 1], detail: "Typical \(formatted(peak.average))", systemImage: "arrow.up")
                    SummaryTile(title: "Usually lowest", value: Calendar.current.monthSymbols[troughMonth - 1], detail: "Typical \(formatted(trough.average))", systemImage: "arrow.down")
                }
            }
        }
        footnote(history, notes: [
            typical.map { $0.count ?? 0 }.max().map { "Typical values average \($0) years of monthly records." }
        ])
    }

    private func legendItem(color: Color, title: String, isBand: Bool = false) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 14, height: isBand ? 10 : 3)
            Text(title)
        }
    }

    private func comparison(_ value: Double, to typical: Double, month: Int) -> String {
        let monthName = Calendar.current.monthSymbols[month - 1]
        guard typical != 0 else { return "Typical \(monthName): \(formatted(typical))" }
        let percent = (value - typical) / abs(typical) * 100
        if abs(percent) < 2 { return "Close to a typical \(monthName)" }
        return "\(abs(percent).formatted(.number.precision(.fractionLength(0))))% \(percent > 0 ? "above" : "below") a typical \(monthName)"
    }

    // MARK: Shared

    private func footnote(_ history: WaterHistory, notes: [String?]) -> some View {
        let earliest = HistoryDates.date(history.coverage.earliest).map { "Records for this station start in \($0.formatted(.dateTime.month(.wide).year()))." }
        let lines = ([earliest] + notes).compactMap { $0 }
        return Text(lines.joined(separator: " "))
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func dateLabel(_ string: String, interval: HistoryInterval) -> String {
        HistoryDates.date(string).map(interval.label(for:)) ?? string
    }

    private func xAxisFormat(_ points: [HistoryChartPoint]) -> Date.FormatStyle {
        guard let first = points.first?.date, let last = points.last?.date else { return .dateTime.year() }
        let span = last.timeIntervalSince(first)
        if span > 3 * 365 * 24 * 60 * 60 { return .dateTime.year() }
        if span > 120 * 24 * 60 * 60 { return .dateTime.month(.abbreviated).year(.twoDigits) }
        return .dateTime.month(.abbreviated).day()
    }

    private func yDomain(_ values: [Double]) -> ClosedRange<Double> {
        guard let minimum = values.min(), let maximum = values.max() else { return 0...1 }
        let padding = max((maximum - minimum) * 0.1, abs(maximum) * 0.002, 0.005)
        return (minimum - padding)...(maximum + padding)
    }

    /// Official yearly extremes; the period can differ by metric (a gauge's level record may be shorter).
    private func recordsCard(_ records: WaterRecords.Metric) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Label("Records", systemImage: "trophy").font(.headline)
                Spacer(minLength: 8)
                if let firstYear = records.firstYear, let lastYear = records.lastYear {
                    Text(firstYear == lastYear ? "\(firstYear)" : "\(String(firstYear))–\(String(lastYear))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let high = records.recordHigh {
                LabeledContent("Highest", value: "\(formatted(high.value)) · \(recordDate(high.date))")
            }
            if let low = records.recordLow {
                LabeledContent("Lowest", value: "\(formatted(low.value)) · \(recordDate(low.date))")
            }
            if let typicalHigh = records.typicalHigh {
                LabeledContent("Typical yearly high", value: formatted(typicalHigh))
            }
            if let typicalLow = records.typicalLow {
                LabeledContent("Typical yearly low", value: formatted(typicalLow))
            }
            Text("Each year's highest and lowest instantaneous readings from Environment Canada's archive (\(records.years) years). The latest year or two may not be included yet.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .font(.subheadline)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(cornerRadius: 14)
    }

    private func recordDate(_ date: String) -> String {
        HistoryDates.date(date)?.formatted(date: .abbreviated, time: .omitted) ?? date
    }

    @MainActor
    private func loadRecords() async {
        guard clerk.user != nil, appState.isPremiumSubscriber else {
            records = nil
            return
        }
        do {
            guard let token = try await clerk.auth.getToken() else { return }
            records = try await APIClient.waterRecords(stationID: station.stationID, token: token)
        } catch {
            // Records are extra context; without them the card simply isn't shown.
            if !error.isCancellation { records = nil }
        }
    }

    private func formatted(_ value: Double) -> String {
        let digits = metric == .discharge && abs(value) >= 100 ? 0 : 2
        return "\(value.formatted(.number.precision(.fractionLength(digits)))) \(metric.unit)"
    }

    @MainActor
    private func load() async {
        guard clerk.user != nil, appState.isPremiumSubscriber else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            guard let token = try await clerk.auth.getToken() else { throw APIError.invalidResponse }
            let dates = requestDates
            let result = try await APIClient.waterHistory(
                stationID: station.stationID,
                metric: metric == .waterLevel ? "water_level" : "discharge",
                interval: mode == .seasonal ? "season" : effectiveInterval.rawValue,
                from: dates.from,
                to: dates.to,
                token: token
            )
            history = result
            isLocked = false
            selectedPoint = nil
            selectedMonth = nil
        } catch APIError.server(statusCode: 403) {
            isLocked = true
        } catch {
            // A parameter change cancels the previous request; that isn't an error to show.
            if Task.isCancelled || error.isCancellation { return }
            errorMessage = error.localizedDescription
        }
    }
}
