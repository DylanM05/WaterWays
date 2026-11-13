import Charts
import ClerkKit
import ClerkKitUI
import SwiftUI

private enum HistoryMode: String, CaseIterable, Identifiable {
    case timeline, seasonal
    var id: String { rawValue }
    var title: String { self == .timeline ? "Timeline" : "Typical year" }
}

private enum HistoryRange: String, CaseIterable, Identifiable {
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

    var chipTitle: String {
        switch self {
        case .days30: "30d"
        case .days90: "90d"
        case .year1: "1y"
        case .years5: "5y"
        case .years10: "10y"
        case .years25: "25y"
        case .all: "All"
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

private enum HistoryInterval: String, CaseIterable, Identifiable {
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

private enum HistoryDates {
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

private struct HistoryChartPoint: Identifiable {
    let date: Date
    let average: Double
    let low: Double
    let high: Double
    let count: Int?
    /// Consecutive points share a segment; a gap in the data starts a new one.
    let segment: Int
    var id: Date { date }
}

/// A month of the last 12, drawn over the typical year.
private struct RecentMonth: Identifiable {
    let month: Int
    let year: Int
    let date: Date
    let average: Double
    var id: Date { date }
}

/// The station page's History tab: archived levels and flows averaged over time or as a typical year, and the
/// station's official records. History is part of Premium; everyone else sees what it adds.
struct StationHistoryTab: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    let station: RiverStation
    let refreshToken: Int
    @AppStorage("historyMode") private var mode: HistoryMode = .timeline
    @AppStorage("historyRange") private var range: HistoryRange = .years5
    @AppStorage("historyInterval") private var interval: HistoryInterval = .month
    @State private var metric: WaterMetric = .waterLevel
    @State private var customFrom = Calendar.current.date(byAdding: .year, value: -10, to: .now) ?? .now
    @State private var customTo = Date.now
    @State private var history: WaterHistory?
    /// The metric `history` is for, so a reply for the other one isn't drawn as this one.
    @State private var historyMetric: WaterMetric?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isLocked = false
    @State private var isAuthPresented = false
    @State private var selectedPoint: HistoryChartPoint?
    @State private var selectedMonth: Int?
    @State private var records: WaterRecords?

    private let chartHeight: CGFloat = 200

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
            requestDates.from ?? "", requestDates.to ?? "", clerk.user?.id ?? "", "\(appState.isPremiumSubscriber)", "\(refreshToken)"
        ].joined(separator: "|")
    }

    /// The loaded history when it's for the metric and view shown. Earlier results stay (dimmed) while the next
    /// range or interval loads.
    private var shownHistory: WaterHistory? {
        guard let history, historyMetric == metric, (mode == .seasonal) == (history.interval == "season") else { return nil }
        return history
    }

    private var lineColor: Color { metric == .discharge ? Theme.flow : Theme.accent }
    private var bandColor: Color { metric == .discharge ? Theme.flowSoft : Theme.accentSoft }
    private var metricName: String { metric == .discharge ? "Flow" : "Level" }
    private var unit: String { metric == .discharge ? "m³/s" : "m" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if clerk.user == nil {
                premiumCard(signedIn: false)
            } else if !appState.hasCheckedSubscription || (appState.isCheckingSubscription && !appState.isPremiumSubscriber) {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 250)
                    .cardBackground()
            } else if appState.subscriptionPlan == nil && !appState.isPremiumSubscriber {
                // The status request failed; don't ask a member who may already pay to upgrade.
                ErrorState(message: "Couldn’t check your membership.") {
                    try? await appState.refreshSubscriptionStatus(clerk: clerk)
                }
                .frame(maxWidth: .infinity, minHeight: 250)
                .cardBackground()
            } else if !appState.isPremiumSubscriber || isLocked {
                premiumCard(signedIn: true)
            } else {
                pickers
                chartCard
                if let history = shownHistory, !history.points.isEmpty {
                    summaryTiles(history).opacity(isLoading ? 0.5 : 1)
                }
                if let recordsMetric = metric == .waterLevel ? records?.waterLevel : records?.discharge {
                    recordsCard(recordsMetric)
                }
            }
        }
        .task(id: requestKey) { await load() }
        // Records don't depend on the range or interval, so they load once per station.
        .task(id: "\(station.stationID)|\(clerk.user?.id ?? "")|\(appState.isPremiumSubscriber)|\(refreshToken)") { await loadRecords() }
        .onChange(of: mode) {
            if mode == .seasonal && !range.supportsSeasonal { range = .all }
            selectedPoint = nil
            selectedMonth = nil
        }
        .onChange(of: metric) { selectedPoint = nil; selectedMonth = nil }
        .sheet(isPresented: $isAuthPresented) { AuthView() }
    }

    // MARK: Premium

    private func premiumCard(signedIn: Bool) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "crown")
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(Theme.accent)
                .frame(width: 58, height: 58)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 18))
                .accessibilityHidden(true)
            Text("WaterWays Premium")
                .font(.display(24))
                .tracking(-0.4)
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 10) {
                benefit("Archived levels and flows", systemImage: "clock.arrow.circlepath")
                benefit("Typical-year comparisons", systemImage: "chart.xyaxis.line")
                benefit("Saved rivers and stations", systemImage: "heart")
            }
            if signedIn {
                NavigationLink { MembershipView() } label: { Text("See Premium") }
                    .buttonStyle(PrimaryButtonStyle())
            } else {
                Button("Sign In") { isAuthPresented = true }
                    .buttonStyle(PrimaryButtonStyle())
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private func benefit(_ title: String, systemImage: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(title).font(.system(size: 15)).foregroundStyle(Theme.ink)
        }
    }

    // MARK: Controls

    private var pickers: some View {
        let metricPills = SegmentedPills(options: [(WaterMetric.waterLevel, "Level"), (WaterMetric.discharge, "Flow")], selection: $metric)
        let modePills = SegmentedPills(options: HistoryMode.allCases.map { ($0, $0.title) }, selection: $mode)
        return ViewThatFits(in: .horizontal) {
            HStack {
                metricPills
                Spacer(minLength: 8)
                modePills
            }
            VStack(alignment: .leading, spacing: 8) {
                metricPills
                modePills
            }
        }
    }

    private var chartTitle: String {
        mode == .seasonal ? "\(metricName) by month" : "\(effectiveInterval.title) \(metricName.lowercased())"
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(chartTitle)
                .font(.display(18))
                .tracking(-0.27)
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) {
                HistoryChips(
                    options: HistoryRange.allCases
                        .filter { mode == .timeline || $0.supportsSeasonal }
                        .map { ($0, $0.chipTitle, $0.title) },
                    selection: $range
                )
            }
            if mode == .timeline {
                HistoryChips(
                    options: HistoryInterval.allCases.map { ($0, $0.title, "\($0.title) averages") },
                    selection: Binding(get: { effectiveInterval }, set: { interval = $0 }),
                    isEnabled: isAvailable
                )
            }
            if range == .custom { customDates }
            chartContent
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private var customDates: some View {
        VStack(spacing: 0) {
            DatePicker("From", selection: $customFrom, in: min(earliestDate, customTo)...customTo, displayedComponents: .date)
                .padding(.vertical, 6)
            Rectangle().fill(Theme.line).frame(height: 1)
            DatePicker("To", selection: $customTo, in: customFrom...Date.now, displayedComponents: .date)
                .padding(.vertical, 6)
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(Theme.ink2)
        .tint(Theme.accent)
        .padding(.horizontal, 12)
        .background(Theme.sunk, in: RoundedRectangle(cornerRadius: 12))
    }

    private var earliestDate: Date {
        HistoryDates.date(history?.coverage.earliest) ?? Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1)) ?? .distantPast
    }

    @ViewBuilder
    private var chartContent: some View {
        if let errorMessage {
            ErrorState(message: errorMessage) { await load() }
                .frame(maxWidth: .infinity, minHeight: 250)
        } else if let history = shownHistory {
            Group {
                if history.points.isEmpty {
                    Text("There are no records for this range. Try a longer one.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink2)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, minHeight: chartHeight)
                } else if mode == .seasonal {
                    seasonalSection(history)
                } else {
                    timelineSection(history)
                }
            }
            .opacity(isLoading ? 0.5 : 1)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: chartHeight)
                .accessibilityLabel("Loading history")
        }
    }

    // MARK: Timeline

    private func timelinePoints(_ history: WaterHistory, interval: HistoryInterval) -> [HistoryChartPoint] {
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
        let points = timelinePoints(history, interval: interval)
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
                .foregroundStyle(bandColor)
                LineMark(x: .value("Date", point.date), y: .value("Average", point.average), series: .value("Segment", point.segment))
                    .foregroundStyle(lineColor)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                if showsMarkers, interval == .year, (point.count ?? 12) < 12 {
                    PointMark(x: .value("Date", point.date), y: .value("Average", point.average))
                        .symbol {
                            Circle().strokeBorder(lineColor, lineWidth: 1.5)
                                .background(Circle().fill(Theme.surface))
                                .frame(width: 8, height: 8)
                        }
                } else if showsMarkers {
                    PointMark(x: .value("Date", point.date), y: .value("Average", point.average))
                        .foregroundStyle(lineColor)
                        .symbolSize(18)
                }
            }
            if let selectedPoint {
                RuleMark(x: .value("Selected", selectedPoint.date))
                    .foregroundStyle(Theme.ink2)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                        ChartTip(title: interval.label(for: selectedPoint.date), lines: [
                            "Average: \(formatted(selectedPoint.average))",
                            selectedPoint.high > selectedPoint.low ? "Range: \(number(selectedPoint.low))–\(formatted(selectedPoint.high))" : nil,
                        ])
                    }
                PointMark(x: .value("Selected", selectedPoint.date), y: .value("Average", selectedPoint.average))
                    .symbol { dot(halo: false) }
            }
        }
        .chartYScale(domain: yDomain(points.flatMap { [$0.low, $0.high] }))
        .chartYAxis { yAxis }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date, format: xAxisFormat(points)).font(.system(size: 11)).foregroundStyle(Theme.ink3)
                    }
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
                            guard let date: Date = proxy.value(atX: x) else { return }
                            selectedPoint = nearest(points, to: date, time: \.date)
                        }
                    )
            }
        }
        .frame(height: chartHeight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(timelineSummary(history, points: points, interval: interval))

        legend([
            LegendItem(style: .line, color: lineColor, title: "Average"),
            LegendItem(style: .band, color: bandColor, title: "Range"),
        ])
        footnote(history, notes: [
            Set(points.map(\.segment)).count > 1 ? "Breaks in the line are periods with no archived data." : nil,
            partialYears == 0 ? nil : showsMarkers
                ? "Hollow points are years with less than 12 months of data."
                : "\(partialYears) of \(points.count) years have less than 12 months of data, so their averages lean toward the months recorded."
        ])
    }

    private func timelineSummary(_ history: WaterHistory, points: [HistoryChartPoint], interval: HistoryInterval) -> String {
        guard let first = points.first, let last = points.last else { return chartTitle }
        var text = "\(chartTitle), \(interval.label(for: first.date)) to \(interval.label(for: last.date))"
        if let summary = history.summary {
            text += ": average \(formatted(summary.average)), lowest \(formatted(summary.low)), highest \(formatted(summary.high))"
        }
        return text
    }

    // MARK: Typical year

    private func recentMonths(_ history: WaterHistory) -> [RecentMonth] {
        let calendar = Calendar.current
        return (history.recent ?? []).compactMap { point in
            guard let date = HistoryDates.date(point.date) else { return nil }
            return RecentMonth(month: calendar.component(.month, from: date), year: calendar.component(.year, from: date), date: date, average: point.average)
        }
        .sorted { $0.date < $1.date }
    }

    @ViewBuilder
    private func seasonalSection(_ history: WaterHistory) -> some View {
        let typical = history.points.filter { $0.month != nil }
        let recent = recentMonths(history)
        let latest = recent.last
        let monthSymbols = Calendar.current.shortMonthSymbols

        Chart {
            ForEach(typical) { point in
                AreaMark(x: .value("Month", point.month ?? 0), yStart: .value("Low", point.low), yEnd: .value("High", point.high))
                    .foregroundStyle(bandColor)
                    .interpolationMethod(.monotone)
                LineMark(x: .value("Month", point.month ?? 0), y: .value("Typical", point.average), series: .value("Series", "Typical"))
                    .foregroundStyle(Theme.ink2)
                    .lineStyle(StrokeStyle(lineWidth: 1.6, dash: [5, 4]))
                    .interpolationMethod(.monotone)
            }
            // One line per calendar year, so December doesn't join the January after it.
            ForEach(recent) { point in
                LineMark(x: .value("Month", point.month), y: .value("Last 12 months", point.average), series: .value("Series", "Recent \(point.year)"))
                    .foregroundStyle(lineColor)
                    .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }
            if let latest, selectedMonth != latest.month {
                PointMark(x: .value("Month", latest.month), y: .value("Last 12 months", latest.average))
                    .symbol { dot(halo: true) }
            }
            if let selectedMonth, let point = typical.first(where: { $0.month == selectedMonth }) {
                let current = recent.last(where: { $0.month == selectedMonth })
                RuleMark(x: .value("Selected", selectedMonth))
                    .foregroundStyle(Theme.ink2)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .annotation(position: .top, spacing: 0, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                        ChartTip(title: Calendar.current.monthSymbols[selectedMonth - 1], lines: [
                            current.map { "\(String($0.year)): \(formatted($0.average))" },
                            "Typical: \(formatted(point.average))",
                            "Low: \(formatted(point.low))\(point.lowYear.map { " (\(String($0)))" } ?? "")",
                            "High: \(formatted(point.high))\(point.highYear.map { " (\(String($0)))" } ?? "")",
                        ])
                    }
                if let current {
                    PointMark(x: .value("Month", current.month), y: .value("Last 12 months", current.average))
                        .symbol { dot(halo: false) }
                }
            }
        }
        .chartXScale(domain: 1...12)
        .chartYScale(domain: yDomain(typical.flatMap { [$0.low, $0.high] } + recent.map(\.average)))
        .chartYAxis { yAxis }
        .chartXAxis {
            AxisMarks(values: Array(stride(from: 1, through: 12, by: 2))) { value in
                AxisValueLabel {
                    if let month = value.as(Int.self), (1...12).contains(month) {
                        Text(monthSymbols[month - 1]).font(.system(size: 11)).foregroundStyle(Theme.ink3)
                    }
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
        .frame(height: chartHeight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(seasonalSummary(typical: typical, latest: latest))

        legend([
            recent.isEmpty ? nil : LegendItem(style: .line, color: lineColor, title: "Last 12 months"),
            LegendItem(style: .dashed, color: Theme.ink3, title: "Typical"),
            LegendItem(style: .band, color: bandColor, title: bandLabel(history)),
        ].compactMap { $0 })
        footnote(history, notes: [
            typical.map { $0.count ?? 0 }.max().map { "Typical values average \($0) years of monthly records." }
        ])
    }

    /// The years the band covers: from the station's first record or the range's start, whichever is later.
    private func bandLabel(_ history: WaterHistory) -> String {
        let calendar = Calendar.current
        guard let start = [HistoryDates.date(history.coverage.earliest), HistoryDates.date(requestDates.from)].compactMap({ $0 }).max() else {
            return "Range"
        }
        let startYear = calendar.component(.year, from: start)
        let endYear = calendar.component(.year, from: range == .custom ? customTo : .now)
        if endYear < calendar.component(.year, from: .now), endYear > startYear { return "\(startYear)–\(endYear)" }
        return "Since \(startYear)"
    }

    private func seasonalSummary(typical: [WaterHistory.Point], latest: RecentMonth?) -> String {
        var parts = [chartTitle]
        if let peak = typical.max(by: { $0.average < $1.average }), let trough = typical.min(by: { $0.average < $1.average }),
           let peakMonth = peak.month, let troughMonth = trough.month {
            let months = Calendar.current.monthSymbols
            parts.append("typically highest in \(months[peakMonth - 1]) at \(formatted(peak.average)) and lowest in \(months[troughMonth - 1]) at \(formatted(trough.average))")
        }
        if let latest, let usual = typical.first(where: { $0.month == latest.month }) {
            parts.append("\(latest.date.formatted(.dateTime.month(.wide).year())) \(formatted(latest.average)), \(comparison(latest.average, to: usual.average, month: latest.month).lowercased())")
        }
        return parts.joined(separator: ": ")
    }

    private func comparison(_ value: Double, to typical: Double, month: Int) -> String {
        let monthName = Calendar.current.monthSymbols[month - 1]
        guard typical != 0 else { return "Typical \(monthName): \(formatted(typical))" }
        let percent = (value - typical) / abs(typical) * 100
        if abs(percent) < 2 { return "Close to a typical \(monthName)" }
        return "\(abs(percent).formatted(.number.precision(.fractionLength(0))))% \(percent > 0 ? "above" : "below") a typical \(monthName)"
    }

    // MARK: Chart parts

    private var yAxis: some AxisContent {
        AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
            AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(Theme.line)
            AxisValueLabel {
                if let number = value.as(Double.self) {
                    Text(axisLabel(number)).font(.system(size: 11)).foregroundStyle(Theme.ink3)
                }
            }
        }
    }

    /// "8K" rather than "8,000", so flows fit beside a phone-width chart.
    private func axisLabel(_ value: Double) -> String {
        abs(value) >= 1000 ? value.formatted(.number.notation(.compactName)) : value.formatted()
    }

    /// The marker on the latest month or the chosen point: the line's colour ringed by the card's.
    private func dot(halo: Bool) -> some View {
        ZStack {
            if halo { Circle().fill(lineColor.opacity(0.2)).frame(width: 18, height: 18) }
            Circle().fill(Theme.surface).frame(width: 12, height: 12)
            Circle().fill(lineColor).frame(width: 8, height: 8)
        }
    }

    private func legend(_ items: [LegendItem]) -> some View {
        HStack(spacing: 12) {
            ForEach(items, id: \.title) { $0 }
        }
        .font(.system(size: 11.5))
        .foregroundStyle(Theme.ink2)
    }

    private func footnote(_ history: WaterHistory, notes: [String?]) -> some View {
        let earliest = HistoryDates.date(history.coverage.earliest).map { "Records for this station start in \($0.formatted(.dateTime.month(.wide).year()))." }
        let lines = ([earliest] + notes).compactMap { $0 }
        return Text(lines.joined(separator: " "))
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.ink3)
            .fixedSize(horizontal: false, vertical: true)
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

    // MARK: Summary and records

    @ViewBuilder
    private func summaryTiles(_ history: WaterHistory) -> some View {
        if history.interval == "season" {
            let typical = history.points.filter { $0.month != nil }
            let months = Calendar.current.monthSymbols
            VStack(spacing: 12) {
                if let latest = recentMonths(history).last, let usual = typical.first(where: { $0.month == latest.month }) {
                    HistoryTile(
                        title: latest.date.formatted(.dateTime.month(.wide).year()),
                        value: number(latest.average),
                        unit: unit,
                        detail: comparison(latest.average, to: usual.average, month: latest.month)
                    )
                }
                if let peak = typical.max(by: { $0.average < $1.average }), let trough = typical.min(by: { $0.average < $1.average }),
                   let peakMonth = peak.month, let troughMonth = trough.month {
                    HStack(spacing: 12) {
                        HistoryTile(title: "Usually highest", value: months[peakMonth - 1], detail: "Typical \(formatted(peak.average))")
                        HistoryTile(title: "Usually lowest", value: months[troughMonth - 1], detail: "Typical \(formatted(trough.average))")
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        } else if let summary = history.summary {
            let interval = HistoryInterval(rawValue: history.interval) ?? .month
            VStack(spacing: 12) {
                HistoryTile(title: "Average", value: number(summary.average), unit: unit, detail: "\(interval.title) averages")
                HStack(spacing: 12) {
                    HistoryTile(title: "Lowest", value: number(summary.low), unit: unit, detail: dateLabel(summary.lowDate, interval: interval), systemImage: "arrow.down")
                    HistoryTile(title: "Highest", value: number(summary.high), unit: unit, detail: dateLabel(summary.highDate, interval: interval), systemImage: "arrow.up")
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func dateLabel(_ string: String, interval: HistoryInterval) -> String {
        HistoryDates.date(string).map(interval.label(for:)) ?? string
    }

    /// Official yearly extremes; the period can differ by metric (a gauge's level record may be shorter).
    private func recordsCard(_ records: WaterRecords.Metric) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Records")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink2)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                if let firstYear = records.firstYear, let lastYear = records.lastYear {
                    let years = firstYear == lastYear ? String(firstYear) : "\(firstYear)–\(lastYear)"
                    Text(years).font(.system(size: 12.5)).foregroundStyle(Theme.ink3)
                }
            }
            if let high = records.recordHigh {
                recordRow("Highest", value: formatted(high.value), detail: recordDate(high.date))
            }
            if let low = records.recordLow {
                recordRow("Lowest", value: formatted(low.value), detail: recordDate(low.date))
            }
            if let typicalHigh = records.typicalHigh {
                recordRow("Typical yearly high", value: formatted(typicalHigh), detail: nil)
            }
            if let typicalLow = records.typicalLow {
                recordRow("Typical yearly low", value: formatted(typicalLow), detail: nil)
            }
            Text("Each year’s highest and lowest readings in Environment Canada’s archive (\(records.years) years). The latest year or two may not be in it yet.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.ink3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    private func recordRow(_ title: String, value: String, detail: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title).font(.system(size: 12.5)).foregroundStyle(Theme.ink2)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(value).font(.number(17, relativeTo: .headline)).foregroundStyle(Theme.ink)
                if let detail {
                    Text(detail).font(.system(size: 12.5)).foregroundStyle(Theme.ink2)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func recordDate(_ date: String) -> String {
        HistoryDates.date(date)?.formatted(date: .abbreviated, time: .omitted) ?? date
    }

    // MARK: Formatting and loading

    private func number(_ value: Double) -> String {
        WaterFormat.number(value, decimals: metric == .discharge ? WaterFormat.flowDecimals(value) : 2)
    }

    private func formatted(_ value: Double) -> String { "\(number(value)) \(unit)" }

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

    @MainActor
    private func load() async {
        guard clerk.user != nil, appState.isPremiumSubscriber else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            guard let token = try await clerk.auth.getToken() else { throw APIError.invalidResponse }
            let requestedMetric = metric
            let dates = requestDates
            let result = try await APIClient.waterHistory(
                stationID: station.stationID,
                metric: requestedMetric == .waterLevel ? "water_level" : "discharge",
                interval: mode == .seasonal ? "season" : effectiveInterval.rawValue,
                from: dates.from,
                to: dates.to,
                token: token
            )
            history = result
            historyMetric = requestedMetric
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

/// The design's chips: small capsules, the chosen one filled with ink.
private struct HistoryChips<Value: Hashable>: View {
    let options: [(value: Value, title: String, label: String)]
    @Binding var selection: Value
    var isEnabled: (Value) -> Bool = { _ in true }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.value) { option in
                let selected = option.value == selection
                let enabled = isEnabled(option.value)
                Button {
                    withAnimation(.snappy(duration: 0.2)) { selection = option.value }
                } label: {
                    Text(option.title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(selected ? Theme.bg : Theme.ink2)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(selected ? Theme.ink : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!enabled)
                .opacity(enabled ? 1 : 0.4)
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }
}

/// A key in a chart's legend: a solid line, a dashed one, or a band.
private struct LegendItem: View {
    enum Style { case line, dashed, band }
    let style: Style
    let color: Color
    let title: String

    var body: some View {
        HStack(spacing: 7) {
            Group {
                switch style {
                case .line:
                    Capsule().fill(color).frame(width: 18, height: 2.5)
                case .dashed:
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: 1))
                        path.addLine(to: CGPoint(x: 18, y: 1))
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    .frame(width: 18, height: 2)
                case .band:
                    RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 18, height: 10)
                }
            }
            .accessibilityHidden(true)
            Text(title).lineLimit(1)
        }
    }
}

/// The value under the finger, in the design's dark tooltip.
private struct ChartTip: View {
    let title: String
    let lines: [String?]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 11.5, weight: .semibold))
            ForEach(Array(lines.compactMap { $0 }.enumerated()), id: \.offset) { _, line in
                Text(line).font(.system(size: 11)).opacity(0.75)
            }
        }
        .foregroundStyle(Theme.bg)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 8))
    }
}

/// A figure in its own card: a label, the value, and a line of context.
private struct HistoryTile: View {
    let title: String
    let value: String
    var unit: String?
    let detail: String?
    var systemImage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.ink2)
                        .accessibilityHidden(true)
                }
                if let unit {
                    ReadingNumber(value: value, unit: unit, size: 22)
                } else {
                    Text(value).font(.number(22, relativeTo: .title3)).foregroundStyle(Theme.ink).lineLimit(1)
                }
            }
            if let detail {
                Text(detail).font(.system(size: 13)).foregroundStyle(Theme.ink2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .cardBackground()
        .accessibilityElement(children: .combine)
    }
}

/// The design's primary button: full width on the accent.
private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accentInk)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16))
            .contentShape(RoundedRectangle(cornerRadius: 16))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
