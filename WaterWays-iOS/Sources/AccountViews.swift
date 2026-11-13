import ClerkKit
import ClerkKitUI
import StoreKit
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
            if let user = clerk.user {
                Section {
                    HStack(spacing: 14) {
                        Text(initials(of: user))
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 48, height: 48)
                            .background(Theme.accentSoft, in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            if let name = [user.firstName, user.lastName].compactMap({ $0 }).joined(separator: " ").nilIfEmpty {
                                Text(name).font(.display(18)).foregroundStyle(Theme.ink)
                            }
                            Text(user.primaryEmailAddress?.emailAddress ?? "Email unavailable")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.ink2)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .listRowBackground(Theme.surface)
            }
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
            .listRowBackground(Theme.surface)
            Section {
                if clerk.user != nil {
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
                    Text(authError).font(.footnote).foregroundStyle(Theme.alertRed)
                }
            }
            .listRowBackground(Theme.surface)
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
                .listRowBackground(Theme.surface)
            }
        }
        .themedList()
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

    private func initials(of user: User) -> String {
        let letters = [user.firstName, user.lastName].compactMap { $0?.first.map(String.init) }.joined()
        return (letters.isEmpty ? user.primaryEmailAddress?.emailAddress.first.map(String.init) ?? "?" : letters).uppercased()
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
            get: { StationDataTab(setting: defaultStationTab).rawValue },
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
            .listRowBackground(Theme.surface)
            Section("Measurements") {
                Picker("Temperature", selection: temperatureBinding) {
                    Text("Celsius").tag("celsius")
                    Text("Fahrenheit").tag("fahrenheit")
                }
            }
            .listRowBackground(Theme.surface)
            Section("Station details") {
                Picker("Opens on", selection: defaultTabBinding) {
                    ForEach(StationDataTab.allCases) { tab in
                        Text(tab.title).tag(tab.rawValue)
                    }
                }
            }
            .listRowBackground(Theme.surface)
            if let settingsError {
                Section {
                    Text(settingsError).font(.footnote).foregroundStyle(Theme.alertRed)
                }
                .listRowBackground(Theme.surface)
            }
            #if DEBUG
            Section {
                Toggle("Use local server", isOn: $useLocalServer)
            } header: {
                Text("Developer")
            } footer: {
                Text("Debug builds only. Sends requests to \(APIClient.localServerURL.absoluteString). Pull to refresh or reopen screens after switching.")
            }
            .listRowBackground(Theme.surface)
            #endif
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
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
                defaultStationTab = StationDataTab(setting: settings.defaultTab).rawValue
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
        settings.defaultTab = defaultStationTab
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
}

struct MembershipView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var appState: AppState
    @State private var statusError: String?
    @State private var isUpdatingSubscription = false
    @State private var isCancelConfirmationPresented = false
    @State private var isManagingAppleSubscription = false
    @State private var selectedProductID = NativeSubscriptionProducts.annual

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // Non-members see the offer alone, unless their status couldn't be checked.
                if appState.isPremiumSubscriber || appState.isCheckingSubscription || appState.subscriptionPlan == nil {
                    currentMembership
                }
                if appState.isPremiumSubscriber {
                    if appState.subscriptionSource == "apple" {
                        appleMembershipActions
                    } else if appState.subscriptionPlan?.lowercased() != "lifetime" {
                        paidMembershipActions
                    }
                } else if !appState.isCheckingSubscription,
                          appState.subscriptionPlan?.lowercased() != "lifetime" {
                    premiumOffer
                }
            }
            .padding(20)
        }
        .background(Theme.bg)
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

    /// The design's Premium sheet: what Premium adds, the two App Store plans, and the required legal text.
    private var premiumOffer: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "crown")
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(Theme.accent)
                .frame(width: 58, height: 58)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 18))
                .accessibilityHidden(true)
            Text("WaterWays Premium")
                .font(.display(28, relativeTo: .title1))
                .foregroundStyle(Theme.ink)
            VStack(alignment: .leading, spacing: 10) {
                feature("Archived levels and flows", symbol: "clock.arrow.circlepath")
                feature("Typical-year comparisons", symbol: "chart.xyaxis.line")
                feature("Saved rivers and stations", symbol: "heart")
            }
            if appState.subscriptionPlan == nil {
                Text("Your current membership status couldn’t be checked.")
                    .font(.footnote)
                    .foregroundStyle(Theme.ink2)
            }
            if appState.appleProducts.isEmpty {
                Text(appState.applePurchaseMessage ?? "Subscriptions aren’t available right now. Please try again later.")
                    .font(.footnote)
                    .foregroundStyle(Theme.ink2)
            } else {
                VStack(spacing: 10) {
                    ForEach(sortedProducts, id: \.id) { product in planOption(product) }
                }
                Button {
                    guard let product = selectedProduct else { return }
                    Task { await appState.purchaseAppleSubscription(product, clerk: clerk) }
                } label: {
                    Group {
                        if appState.isPurchasingAppleSubscription {
                            ProgressView().tint(Theme.accentInk)
                        } else {
                            Text("Continue")
                        }
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.accentInk)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .disabled(appState.isPurchasingAppleSubscription || selectedProduct == nil)
            }
            if !appState.appleProducts.isEmpty, let applePurchaseMessage = appState.applePurchaseMessage {
                Text(applePurchaseMessage).font(.footnote).foregroundStyle(Theme.ink2)
            }
            VStack(spacing: 8) {
                Button("Restore purchases") {
                    Task { await appState.restoreApplePurchases(clerk: clerk) }
                }
                .font(.system(size: 13, weight: .semibold))
                .tint(Theme.accent)
                .disabled(appState.isPurchasingAppleSubscription)
                if !appState.appleProducts.isEmpty {
                    Text("Renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple account settings.")
                }
                HStack(spacing: 16) {
                    Link("Terms of Use", destination: NativeSubscriptionProducts.termsOfUseURL)
                    Link("Privacy Policy", destination: NativeSubscriptionProducts.privacyPolicyURL)
                }
                .tint(Theme.accent)
            }
            .font(.system(size: 11))
            .foregroundStyle(Theme.ink3)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    private func feature(_ title: String, symbol: String) -> some View {
        Label {
            Text(title).font(.system(size: 15)).foregroundStyle(Theme.ink)
        } icon: {
            Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.accent)
        }
    }

    /// Annual first, as in the design.
    private var sortedProducts: [Product] {
        appState.appleProducts.sorted { first, _ in first.id == NativeSubscriptionProducts.annual }
    }

    private var selectedProduct: Product? {
        appState.appleProducts.first { $0.id == selectedProductID } ?? sortedProducts.first
    }

    private var monthlyProduct: Product? {
        appState.appleProducts.first { $0.id == NativeSubscriptionProducts.monthly }
    }

    private func planOption(_ product: Product) -> some View {
        let selected = product.id == selectedProduct?.id
        let annual = product.id == NativeSubscriptionProducts.annual
        return Button {
            selectedProductID = product.id
        } label: {
            HStack(spacing: 12) {
                Circle()
                    .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: 2)
                    .background(Circle().fill(selected ? Theme.accent : .clear))
                    .overlay(Circle().fill(Theme.accentInk).frame(width: 8, height: 8).opacity(selected ? 1 : 0))
                    .frame(width: 22, height: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(product.displayPrice) \(annual ? "a year" : "a month")")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if annual {
                        Text("\((product.price / 12).formatted(product.priceFormatStyle)) a month")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if annual, let monthly = monthlyProduct, monthly.price > 0 {
                    let saving = Int((1 - NSDecimalNumber(decimal: product.price / (monthly.price * 12)).doubleValue) * 100)
                    if saving > 0 {
                        Text("Save \(saving)%")
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundStyle(Theme.accentInk)
                            .padding(.horizontal, 8)
                            .frame(height: 22)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(selected ? Theme.accentSoft.opacity(0.5) : Theme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: selected ? 2 : 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
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
            Text("Your membership").font(.display(18)).foregroundStyle(Theme.ink)
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
        .cardBackground()
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
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                Text("WaterWays provides river water-level and weather information for monitoring stations across Canada.")
                    .foregroundStyle(.secondary)
            }
            .listRowBackground(Theme.surface)
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
            .listRowBackground(Theme.surface)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("About WaterWays")
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
