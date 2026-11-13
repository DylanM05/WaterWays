import ClerkKit
import ClerkKitUI
import SwiftUI

struct AccountView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @State private var isAuthPresented = false
    @State private var isProfilePresented = false
    @State private var isDeleteConfirmationPresented = false
    @State private var isDeletingAccount = false
    @State private var authError: String?

    var body: some View {
        List {
            Section {
                NavigationLink { PreferencesView() } label: { Label("Preferences", systemImage: "slider.horizontal.3") }
                if clerk.user != nil {
                    NavigationLink { MembershipView() } label: {
                        HStack {
                            Label("Membership", systemImage: "crown")
                            Spacer()
                            Text(appState.membershipSummary)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink { AboutView() } label: { Label("About WaterWays", systemImage: "info.circle") }
            }
            Section("Account") {
                if let user = clerk.user {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                            .frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Signed in as")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(user.primaryEmailAddress?.emailAddress ?? "Email unavailable")
                                .font(.body)
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.vertical, 4)
                    Button {
                        isProfilePresented = true
                    } label: {
                        Label("Manage account", systemImage: "person.text.rectangle")
                    }
                    Button("Sign out", role: .destructive) {
                        Task {
                            do {
                                try await clerk.auth.signOut()
                                authError = nil
                            } catch {
                                authError = error.localizedDescription
                            }
                        }
                    }
                } else {
                    Button {
                        isAuthPresented = true
                    } label: {
                        Label("Sign in or create an account", systemImage: "person.crop.circle")
                    }
                }
                if let authError {
                    Text(authError).font(.footnote).foregroundStyle(.red)
                }
            }
            if clerk.user != nil {
                Section {
                    Button(role: .destructive) {
                        isDeleteConfirmationPresented = true
                    } label: {
                        if isDeletingAccount {
                            ProgressView()
                        } else {
                            Text("Delete account")
                        }
                    }
                    .disabled(isDeletingAccount)
                } footer: {
                    Text("Permanently deletes your WaterWays account, saved rivers and stations.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Account")
        .sheet(isPresented: $isAuthPresented) {
            AuthView()
        }
        .sheet(isPresented: $isProfilePresented) {
            UserProfileView()
        }
        .confirmationDialog(
            "Delete your account?",
            isPresented: $isDeleteConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Keep account", role: .cancel) {}
        } message: {
            Text(deletionWarning)
        }
        .refreshable {
            guard clerk.user != nil else { return }
            do {
                try await appState.syncAccountData(clerk: clerk)
                authError = nil
            } catch {
                authError = error.localizedDescription
            }
        }
    }

    private var deletionWarning: String {
        let base = "This can’t be undone."
        guard appState.isPremiumSubscriber else { return base }
        if appState.subscriptionSource == "apple" {
            // Apple bills the Apple ID, so deleting the account can't stop renewals.
            return base + " Your Apple subscription keeps renewing until you cancel it in Settings › Apple Account › Subscriptions."
        }
        if appState.subscriptionSource == "lifetime" {
            return base + " Your lifetime membership will be lost."
        }
        return base + " Your membership will be cancelled."
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            // The server's Clerk webhook cancels Stripe billing and removes saved data.
            try await clerk.user?.delete()
            authError = nil
        } catch {
            authError = "Couldn’t delete your account. \(error.localizedDescription)"
        }
    }
}

struct PreferencesView: View {
    @Environment(Clerk.self) private var clerk
    @AppStorage("nativeTemperatureUnit") private var temperatureUnit = "celsius"
    @AppStorage("nativeDefaultStationTab") private var defaultStationTab = "water"
    @AppStorage("nativeAppearance") private var appearance = NativeAppearance.system.rawValue
    #if DEBUG
    @AppStorage(APIClient.localServerKey) private var useLocalServer = false
    #endif
    @State private var hasLoadedServerSettings = false
    @State private var settingsError: String?
    @State private var serverSettings = SavedUserSettings.defaults

    private var temperatureBinding: Binding<String> {
        Binding(
            get: { temperatureUnit },
            set: { value in
                temperatureUnit = value
                saveSettingsIfSignedIn()
            }
        )
    }

    private var defaultTabBinding: Binding<String> {
        Binding(
            get: { defaultStationTab },
            set: { value in
                defaultStationTab = value
                saveSettingsIfSignedIn()
            }
        )
    }

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Theme", selection: $appearance) {
                    ForEach(NativeAppearance.allCases, id: \.rawValue) { option in
                        Text(option.label).tag(option.rawValue)
                    }
                }
            }
            Section("Measurements") {
                Picker("Temperature", selection: temperatureBinding) {
                    Text("Celsius").tag("celsius")
                    Text("Fahrenheit").tag("fahrenheit")
                }
            }
            Section("Station details") {
                Picker("Default data view", selection: defaultTabBinding) {
                    Text("Water").tag("water")
                    Text("History").tag("history")
                    Text("Pressure").tag("pressure")
                    Text("Weather").tag("weather")
                    Text("Hourly forecast").tag("hourly")
                    Text("Weekly forecast").tag("weekly")
                    Text("Map").tag("map")
                }
            }
            if let settingsError {
                Section {
                    Text(settingsError).font(.footnote).foregroundStyle(.red)
                }
            }
            #if DEBUG
            Section {
                Toggle("Use local server", isOn: $useLocalServer)
            } header: {
                Text("Developer")
            } footer: {
                Text("Debug builds only. Sends requests to \(APIClient.localServerURL.absoluteString). Pull to refresh or reopen screens after switching.")
            }
            #endif
        }
        .navigationTitle("Preferences")
        .task(id: clerk.user?.id) {
            await loadSettings()
        }
    }

    @MainActor
    private func loadSettings() async {
        hasLoadedServerSettings = false
        guard let userID = clerk.user?.id,
              let token = try? await clerk.auth.getToken() else {
            return
        }

        do {
            if let settings = try await APIClient.userSettings(userID: userID, token: token) {
                serverSettings = settings
                temperatureUnit = settings.temperatureUnit
                defaultStationTab = nativeTabValue(settings.defaultTab)
            } else {
                serverSettings = .defaults
            }
            hasLoadedServerSettings = true
        } catch APIError.server(statusCode: 404) {
            serverSettings = .defaults
            hasLoadedServerSettings = true
        } catch {
            settingsError = "Couldn’t load your saved preferences. Local preferences are still available."
            hasLoadedServerSettings = false
        }
    }

    private func saveSettingsIfSignedIn() {
        guard hasLoadedServerSettings, let userID = clerk.user?.id else { return }
        settingsError = nil
        var settings = serverSettings
        settings.temperatureUnit = temperatureUnit
        settings.defaultTab = serverTabValue(defaultStationTab)
        serverSettings = settings
        Task {
            do {
                guard let token = try await clerk.auth.getToken() else { return }
                try await APIClient.saveUserSettings(userID: userID, settings: settings, token: token)
            } catch {
                settingsError = "Saved on this device, but couldn’t sync your preferences."
            }
        }
    }

    private func nativeTabValue(_ serverValue: String) -> String {
        switch serverValue {
        case "hourlyforecast": "hourly"
        case "weeklyforecast": "weekly"
        default: serverValue
        }
    }

    private func serverTabValue(_ nativeValue: String) -> String {
        switch nativeValue {
        case "hourly": "hourlyforecast"
        case "weekly": "weeklyforecast"
        default: nativeValue
        }
    }
}

struct MembershipView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @State private var statusError: String?
    @State private var isUpdatingSubscription = false
    @State private var isCancelConfirmationPresented = false
    @State private var isManagingAppleSubscription = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                currentMembership
                if appState.isPremiumSubscriber {
                    if appState.subscriptionSource == "apple" {
                        appleMembershipActions
                    } else if appState.subscriptionPlan?.lowercased() != "lifetime" {
                        paidMembershipActions
                    }
                } else if !appState.isCheckingSubscription,
                          appState.subscriptionPlan?.lowercased() != "lifetime" {
                    Text("Choose your plan").font(.title2.weight(.bold))
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Premium includes").font(.headline)
                        Label("Historical water data and typical-year comparisons", systemImage: "clock.arrow.circlepath")
                        Label("Saved rivers and stations, synced to your account", systemImage: "heart")
                    }
                    .font(.subheadline)
                    PlanRow(title: "Free", price: "$0/month", detail: "Water data and current weather")
                    if appState.subscriptionPlan == nil {
                        Text("Your current membership status couldn’t be checked.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if appState.appleProducts.isEmpty {
                        Text(appState.applePurchaseMessage ?? "Subscriptions aren’t available right now. Please try again later.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(appState.appleProducts, id: \.id) { product in
                            Button {
                                Task { await appState.purchaseAppleSubscription(product, clerk: clerk) }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(product.id == NativeSubscriptionProducts.annual ? "Annual" : "Monthly")
                                            .font(.headline)
                                        Text(product.id == NativeSubscriptionProducts.annual ? "Billed annually" : "Billed monthly")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if appState.isPurchasingAppleSubscription {
                                        ProgressView()
                                    } else {
                                        Text(product.displayPrice)
                                            .font(.subheadline.weight(.semibold))
                                    }
                                }
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                            .disabled(appState.isPurchasingAppleSubscription)
                        }
                    }
                    Button("Restore Apple purchases") {
                        Task { await appState.restoreApplePurchases(clerk: clerk) }
                    }
                    .disabled(appState.isPurchasingAppleSubscription)
                    if !appState.appleProducts.isEmpty, let applePurchaseMessage = appState.applePurchaseMessage {
                        Text(applePurchaseMessage).font(.footnote).foregroundStyle(.secondary)
                    }
                    if !appState.appleProducts.isEmpty {
                        Text("Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple account settings.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    HStack(spacing: 16) {
                        Link("Terms of Use", destination: NativeSubscriptionProducts.termsOfUseURL)
                        Link("Privacy Policy", destination: NativeSubscriptionProducts.privacyPolicyURL)
                    }
                    .font(.footnote)
                }
            }
            .padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            appState.startStoreKitTransactionListener(clerk: clerk)
            await appState.loadAppleProducts()
            await refreshStatus()
        }
        .refreshable { await refreshStatus() }
        .manageSubscriptionsSheet(isPresented: $isManagingAppleSubscription)
        .onChange(of: isManagingAppleSubscription) {
            // Pick up a cancellation or plan change as soon as the sheet closes.
            if !isManagingAppleSubscription { Task { await refreshStatus() } }
        }
        .confirmationDialog(
            "Cancel membership?",
            isPresented: $isCancelConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Cancel at period end", role: .destructive) {
                Task { await cancelMembership() }
            }
            Button("Keep membership", role: .cancel) {}
        } message: {
            Text("Your premium access will remain active until the end of the current billing period.")
        }
        .alert("Membership", isPresented: Binding(
            get: { statusError != nil },
            set: { if !$0 { statusError = nil } }
        )) {
            Button("OK", role: .cancel) { statusError = nil }
        } message: {
            Text(statusError ?? "Please try again.")
        }
    }

    /// Website (Stripe) memberships can be cancelled here. App Store rules (guideline 3.1.1) don't allow pointing
    /// to another way to pay, so the billing portal, plan changes and undoing a cancellation stay on the website.
    private var paidMembershipActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            if appState.subscriptionCancelAtPeriodEnd {
                Text(cancelledMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Button(role: .destructive) {
                    isCancelConfirmationPresented = true
                } label: {
                    if isUpdatingSubscription { ProgressView() } else { Text("Cancel membership") }
                }
                .disabled(isUpdatingSubscription)
            }
            Text("This membership was set up on the WaterWays website, so it isn’t listed in your Apple subscriptions.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var cancelledMessage: String {
        guard let expiresAt = appState.subscriptionExpiresAt else { return "Your membership is cancelled and won’t renew." }
        return "Your membership is cancelled and won’t renew. Premium stays on until \(formattedDate(expiresAt))."
    }

    private var appleMembershipActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Apple's in-app sheet; unlike the App Store account page it also works with Xcode StoreKit test purchases.
            Button {
                isManagingAppleSubscription = true
            } label: {
                Label("Manage or cancel subscription", systemImage: "creditcard")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button("Restore Apple purchases") {
                Task { await appState.restoreApplePurchases(clerk: clerk) }
            }
            .disabled(appState.isPurchasingAppleSubscription)

            if let applePurchaseMessage = appState.applePurchaseMessage {
                Text(applePurchaseMessage).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var currentMembership: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Current membership").font(.headline)
            if appState.isCheckingSubscription {
                ProgressView("Checking membership")
            } else if appState.subscriptionPlan != nil {
                LabeledContent("Plan", value: appState.isPremiumSubscriber ? appState.planDisplayName : "Free")
                LabeledContent("Status", value: appState.isPremiumSubscriber ? "Active" : "Not subscribed")
                if let expiresAt = appState.subscriptionExpiresAt, appState.isPremiumSubscriber {
                    if appState.subscriptionCancelAtPeriodEnd {
                        LabeledContent("Access through", value: formattedDate(expiresAt))
                    } else if let pendingPlan = appState.pendingApplePlan {
                        LabeledContent("Next renewal", value: "\(formattedDate(expiresAt)) as \(pendingPlan)")
                    } else {
                        LabeledContent("Next renewal", value: formattedDate(expiresAt))
                    }
                }
            } else {
                Text(statusError ?? "Membership status is unavailable.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Check again") { Task { await refreshStatus() } }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func refreshStatus() async {
        statusError = nil
        do {
            try await appState.refreshSubscriptionStatus(clerk: clerk)
        } catch where !error.isCancellation {
            statusError = "Could not load membership status. Pull to refresh or try again."
        } catch {}
    }

    private func cancelMembership() async {
        isUpdatingSubscription = true
        defer { isUpdatingSubscription = false }
        do {
            try await appState.cancelSubscription(clerk: clerk)
        } catch {
            statusError = "Could not cancel your membership. Please try again."
        }
    }

    /// The server sends ISO 8601 dates with milliseconds (e.g. 2026-11-22T02:09:37.446Z), which the default parser rejects.
    private func formattedDate(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(date: .long, time: .omitted)
    }
}

struct AboutView: View {
    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: "0.1")
                Text("WaterWays provides river water-level and weather information for monitoring stations across Canada.")
                    .foregroundStyle(.secondary)
            }
            Section {
                Text("Water data, records and weather alerts come from Environment and Climate Change Canada (Water Survey of Canada and the Meteorological Service of Canada). Contains information licensed under the Open Government Licence – Canada.")
                    .foregroundStyle(.secondary)
                Link("Open Government Licence – Canada", destination: URL(string: "https://open.canada.ca/en/open-government-licence-canada")!)
                Text("Weather forecasts and pressure: weather data by Open-Meteo.com, licensed under CC BY 4.0.")
                    .foregroundStyle(.secondary)
                Link("Open-Meteo", destination: URL(string: "https://open-meteo.com/")!)
            } header: {
                Text("Data")
            }
        }
        .navigationTitle("About WaterWays")
    }
}

struct PlanRow: View {
    let title: String
    let price: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                Text(price).font(.subheadline.weight(.semibold)).foregroundStyle(brandColor)
            }
            Text(detail).font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}
