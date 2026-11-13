import SwiftUI
import ClerkKit
import StoreKit

enum NativeSubscriptionProducts {
    static let monthly = "ca.waterways.native.premium.monthly"
    static let annual = "ca.waterways.native.premium.annual"
    static let all = [monthly, annual]

    static func displayName(for productID: String) -> String {
        productID == annual ? "Annual" : "Monthly"
    }
    // App Review requires both links on any screen that sells an auto-renewing subscription.
    static let termsOfUseURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let privacyPolicyURL = URL(string: "https://water-ways.ca/privacy")!
}

enum NativeAppearance: String, CaseIterable {
    case system
    case light
    case dark

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    // nil lets SwiftUI follow the device's appearance setting.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

@main
struct WaterWaysNativeApp: App {
    // Appearance is per device, so it isn't synced with server settings.
    @AppStorage("nativeAppearance") private var appearance = NativeAppearance.system.rawValue

    init() {
        if let publishableKey = Bundle.main.object(forInfoDictionaryKey: "ClerkPublishableKey") as? String {
            Clerk.configure(publishableKey: publishableKey)
        }
    }

    var body: some Scene {
        WindowGroup {
            NativeTabShell()
                .environment(Clerk.shared)
                .preferredColorScheme(NativeAppearance(rawValue: appearance)?.colorScheme)
                .onOpenURL { url in
                    Task {
                        try? await Clerk.shared.handle(url)
                    }
                }
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var favorites: [RiverStation] = []
    @Published private(set) var favoriteRivers: [SavedRiver] = []
    @Published private(set) var isPremiumSubscriber = false
    @Published private(set) var isLoadingFavorites = false
    /// Set when the last account sync failed, so screens that rely on it can offer a retry.
    @Published private(set) var accountSyncError: String?
    @Published private(set) var isCheckingSubscription = false
    /// False until the first subscription check for the signed-in user finishes, so premium screens don't flash a lock.
    @Published private(set) var hasCheckedSubscription = false
    @Published private(set) var subscriptionPlan: String?
    @Published private(set) var subscriptionExpiresAt: String?
    @Published private(set) var subscriptionCancelAtPeriodEnd = false
    @Published private(set) var subscriptionSource: String?
    /// The plan an Apple subscription will renew as, when the subscriber has switched plans for the next period.
    @Published private(set) var pendingApplePlan: String?
    @Published private(set) var appleProducts: [Product] = []
    @Published private(set) var isPurchasingAppleSubscription = false
    @Published var applePurchaseMessage: String?
    @Published private var pendingFavoriteKeys: Set<String> = []
    private var transactionUpdatesTask: Task<Void, Never>?
    /// Transactions already sent to the server this session. Renewals arrive with new IDs; a refund keeps the
    /// purchase's ID, so the key includes whether the transaction has been revoked.
    private var reportedTransactionKeys: Set<String> = []

    var membershipSummary: String {
        if isCheckingSubscription { return "Checking..." }
        guard subscriptionPlan != nil else { return "Status unavailable" }
        return isPremiumSubscriber ? planDisplayName : "Free"
    }

    /// Readable plan name; the server reports Apple plans as "apple-monthly" and "apple-annual".
    var planDisplayName: String {
        guard let subscriptionPlan else { return "Free" }
        switch subscriptionPlan.lowercased() {
        case "apple-monthly": return "Monthly"
        case "apple-annual": return "Annual"
        default: return subscriptionPlan.capitalized
        }
    }

    func isFavorite(_ station: RiverStation) -> Bool {
        favorites.contains { $0.stationID == station.stationID }
    }

    func isFavoriteRiver(name: String, province: String) -> Bool {
        savedRiver(name: name, province: province) != nil
    }

    func clearAccountData() {
        favorites = []
        favoriteRivers = []
        isPremiumSubscriber = false
        hasCheckedSubscription = false
        subscriptionPlan = nil
        subscriptionExpiresAt = nil
        subscriptionCancelAtPeriodEnd = false
        subscriptionSource = nil
        pendingApplePlan = nil
        applePurchaseMessage = nil
        accountSyncError = nil
    }

    func syncAccountData(clerk: Clerk) async throws {
        accountSyncError = nil
        do {
            try await performAccountSync(clerk: clerk)
        } catch {
            if !error.isCancellation { accountSyncError = error.localizedDescription }
            throw error
        }
    }

    private func performAccountSync(clerk: Clerk) async throws {
        guard let userID = clerk.user?.id, let token = try await clerk.auth.getToken() else {
            clearAccountData()
            return
        }

        isLoadingFavorites = true
        defer { isLoadingFavorites = false }

        try await refreshSubscriptionStatus(token: token)

        do {
            if let settings = try await APIClient.userSettings(userID: userID, token: token) {
                UserDefaults.standard.set(settings.temperatureUnit, forKey: "nativeTemperatureUnit")
                UserDefaults.standard.set(nativeDefaultTab(settings.defaultTab), forKey: "nativeDefaultStationTab")
            }
        } catch APIError.server(statusCode: 404) {
            // Keep this device's preferences until the user saves server settings.
        }

        guard isPremiumSubscriber else {
            favorites = []
            favoriteRivers = []
            return
        }

        let records = try await APIClient.favorites(token: token)
        var resolvedRivers: [SavedRiver] = []
        for record in records where record.favoriteType == "river" {
            let stations = (record.stations ?? []).map { savedStation in
                RiverStation(
                    stationName: savedStation.stationName ?? "Station \(savedStation.stationID)",
                    stationID: savedStation.stationID,
                    province: savedStation.province ?? record.province ?? "Unknown",
                    latitude: savedStation.latitude,
                    longitude: savedStation.longitude,
                    section: savedStation.section
                )
            }
            resolvedRivers.append(SavedRiver(
                favoriteID: record.stationID,
                name: record.riverName ?? record.stationName ?? "Saved river",
                province: record.province ?? stations.first?.province ?? "Unknown",
                stations: stations
            ))
        }

        let stationRecords = records.filter { $0.favoriteType != "river" }
        let resolvedStations = await withTaskGroup(of: (Int, RiverStation).self) { group in
            for (index, record) in stationRecords.enumerated() {
                group.addTask {
                    if let station = try? await APIClient.coordinates(stationID: record.stationID) {
                        return (index, station)
                    }
                    return (index, RiverStation(
                        stationName: record.stationName ?? "Station \(record.stationID)",
                        stationID: record.stationID,
                        province: record.province ?? "Unknown",
                        latitude: nil,
                        longitude: nil,
                        section: nil
                    ))
                }
            }
            var resolved: [(Int, RiverStation)] = []
            for await result in group { resolved.append(result) }
            return resolved.sorted { $0.0 < $1.0 }.map(\.1)
        }
        favorites = resolvedStations
        favoriteRivers = resolvedRivers
    }

    private func nativeDefaultTab(_ serverValue: String) -> String {
        switch serverValue {
        case "hourlyforecast": "hourly"
        case "weeklyforecast": "weekly"
        default: serverValue
        }
    }

    func refreshSubscriptionStatus(clerk: Clerk) async throws {
        guard let token = try await clerk.auth.getToken() else {
            isPremiumSubscriber = false
            subscriptionPlan = nil
            subscriptionExpiresAt = nil
            subscriptionCancelAtPeriodEnd = false
            subscriptionSource = nil
            return
        }

        try await refreshSubscriptionStatus(token: token)
    }

    func loadAppleProducts() async {
        do {
            appleProducts = try await Product.products(for: NativeSubscriptionProducts.all)
                .sorted { left, right in
                    left.id == NativeSubscriptionProducts.monthly && right.id == NativeSubscriptionProducts.annual
                }
            if appleProducts.isEmpty {
                applePurchaseMessage = "Subscriptions aren’t available right now. Please try again later."
                print("StoreKit returned no products for: \(NativeSubscriptionProducts.all.joined(separator: ", "))")
            } else {
                applePurchaseMessage = nil
                print("StoreKit loaded products: \(appleProducts.map(\.id).joined(separator: ", "))")
            }
        } catch {
            appleProducts = []
            applePurchaseMessage = "Subscriptions aren’t available right now. Please try again later."
            print("StoreKit product loading failed: \(error)")
        }
    }

    func startStoreKitTransactionListener(clerk: Clerk) {
        guard transactionUpdatesTask == nil else { return }

        transactionUpdatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled, let self,
                      case .verified(let transaction) = result,
                      NativeSubscriptionProducts.all.contains(transaction.productID) else { continue }

                do {
                    guard let token = try await clerk.auth.getToken() else { continue }
                    try await APIClient.verifyAppleTransaction(
                        signedTransaction: result.jwsRepresentation,
                        token: token
                    )
                    await transaction.finish()
                    try await self.refreshSubscriptionStatus(token: token)
                } catch {
                    self.applePurchaseMessage = "Apple confirmed a transaction that WaterWays could not verify yet. Open Membership and restore purchases."
                }
            }
        }
    }

    func purchaseAppleSubscription(_ product: Product, clerk: Clerk) async {
        guard NativeSubscriptionProducts.all.contains(product.id) else { return }
        isPurchasingAppleSubscription = true
        defer { isPurchasingAppleSubscription = false }

        do {
            guard let token = try await clerk.auth.getToken() else {
                throw APIError.server(statusCode: 401)
            }
            let appAccountToken = try await APIClient.appleAccountToken(token: token)
            let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])

            switch result {
            case .success(let verificationResult):
                switch verificationResult {
                case .verified(let transaction):
                    try await APIClient.verifyAppleTransaction(
                        signedTransaction: verificationResult.jwsRepresentation,
                        token: token
                    )
                    await transaction.finish()
                    try await refreshSubscriptionStatus(token: token)
                    if isPremiumSubscriber {
                        applePurchaseMessage = "Your Apple subscription is active."
                    } else if transaction.revocationDate != nil {
                        // Xcode's test store can hand back an already-refunded transaction when a product is bought again.
                        applePurchaseMessage = "Apple returned a refunded purchase, so no membership was granted."
                    } else {
                        applePurchaseMessage = "Apple confirmed your purchase, but WaterWays couldn’t activate it yet. Tap Restore Apple purchases to try again."
                    }
                case .unverified:
                    applePurchaseMessage = "Apple could not verify this purchase. No membership was granted."
                }
            case .pending:
                applePurchaseMessage = "Your purchase is pending approval. Membership will update when Apple confirms it."
            case .userCancelled:
                applePurchaseMessage = nil
            @unknown default:
                applePurchaseMessage = "The purchase could not be completed. Please try again."
            }
        } catch APIError.server(statusCode: 403) {
            applePurchaseMessage = Self.otherAccountMessage
        } catch {
            applePurchaseMessage = error.localizedDescription
        }
    }

    func restoreApplePurchases(clerk: Clerk) async {
        isPurchasingAppleSubscription = true
        defer { isPurchasingAppleSubscription = false }

        do {
            guard let token = try await clerk.auth.getToken() else {
                throw APIError.server(statusCode: 401)
            }
            try await AppStore.sync()
            var restoredAny = false

            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result,
                      NativeSubscriptionProducts.all.contains(transaction.productID) else { continue }
                try await APIClient.verifyAppleTransaction(
                    signedTransaction: result.jwsRepresentation,
                    token: token
                )
                restoredAny = true
            }

            try await refreshSubscriptionStatus(token: token)
            applePurchaseMessage = restoredAny && isPremiumSubscriber
                ? "Your Apple subscription has been restored."
                : "No active WaterWays Apple subscription was found for your Apple account."
        } catch APIError.server(statusCode: 403) {
            applePurchaseMessage = Self.otherAccountMessage
        } catch {
            applePurchaseMessage = error.localizedDescription
        }
    }

    /// The server answers 403 when this Apple ID's subscription was bought while signed in to another WaterWays account.
    private static let otherAccountMessage = "This Apple ID’s subscription is linked to a different WaterWays account. Sign in with that account to use it."

    func cancelSubscription(clerk: Clerk) async throws {
        guard let token = try await clerk.auth.getToken() else {
            throw APIError.server(statusCode: 401)
        }
        try await APIClient.cancelSubscription(token: token)
        try await refreshSubscriptionStatus(token: token)
    }

    private func refreshSubscriptionStatus(token: String) async throws {
        isCheckingSubscription = true
        defer {
            isCheckingSubscription = false
            hasCheckedSubscription = true
        }

        do {
            await syncStoreKitEntitlements(token: token)
            let subscription = try await APIClient.subscriptionStatus(token: token)
            isPremiumSubscriber = subscription.subscribed
            subscriptionPlan = subscription.plan
            subscriptionSource = subscription.source
            subscriptionExpiresAt = subscription.expiresAt
            subscriptionCancelAtPeriodEnd = subscription.cancelAtPeriodEnd ?? false
            if !subscription.subscribed {
                favorites = []
                favoriteRivers = []
            }
            await refreshAppleRenewalStatus()
        } catch {
            // Keep the last known membership when a request is merely cancelled.
            if error.isCancellation { throw error }
            isPremiumSubscriber = false
            subscriptionPlan = nil
            subscriptionSource = nil
            subscriptionExpiresAt = nil
            subscriptionCancelAtPeriodEnd = false
            throw error
        }
    }

    /// The server hears about auto-renew changes from Apple's notifications, which can lag (and never arrive for
    /// Xcode test purchases). StoreKit on this device knows immediately.
    func refreshAppleRenewalStatus() async {
        pendingApplePlan = nil
        guard subscriptionSource == "apple" else { return }
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  NativeSubscriptionProducts.all.contains(transaction.productID),
                  let status = await transaction.subscriptionStatus,
                  case .verified(let renewalInfo) = status.renewalInfo else { continue }
            subscriptionCancelAtPeriodEnd = !renewalInfo.willAutoRenew
            if renewalInfo.willAutoRenew,
               let nextProductID = renewalInfo.autoRenewPreference,
               nextProductID != transaction.productID,
               NativeSubscriptionProducts.all.contains(nextProductID) {
                pendingApplePlan = NativeSubscriptionProducts.displayName(for: nextProductID)
            }
            return
        }
    }

    private func syncStoreKitEntitlements(token: String) async {
        var results: [VerificationResult<StoreKit.Transaction>] = []
        for await result in Transaction.currentEntitlements {
            results.append(result)
        }
        // Refunded purchases drop out of current entitlements, so check each product's latest transaction too.
        // The server also learns of refunds from Apple's notifications; this covers the gap until one arrives.
        for productID in NativeSubscriptionProducts.all {
            if let latest = await Transaction.latest(for: productID) { results.append(latest) }
        }

        for result in results {
            guard case .verified(let transaction) = result,
                  NativeSubscriptionProducts.all.contains(transaction.productID) else { continue }
            let key = "\(transaction.id):\(transaction.revocationDate != nil)"
            guard !reportedTransactionKeys.contains(key) else { continue }
            do {
                try await APIClient.verifyAppleTransaction(
                    signedTransaction: result.jwsRepresentation,
                    token: token
                )
                reportedTransactionKeys.insert(key)
            } catch APIError.server(statusCode: 403) {
                // Belongs to another WaterWays account; retrying won't change that.
                reportedTransactionKeys.insert(key)
            } catch {
                applePurchaseMessage = "Apple membership could not be synchronized. Restore purchases to retry."
            }
        }
    }

    func isUpdatingFavorite(_ station: RiverStation) -> Bool {
        pendingFavoriteKeys.contains(station.stationID)
    }

    func isUpdatingFavoriteRiver(name: String, province: String) -> Bool {
        pendingFavoriteKeys.contains(riverKey(name: name, province: province))
    }

    func toggleFavorite(_ station: RiverStation, clerk: Clerk) async throws -> FavoriteChangeResult {
        guard pendingFavoriteKeys.insert(station.stationID).inserted else { return .updated }
        defer { pendingFavoriteKeys.remove(station.stationID) }

        guard let token = try await clerk.auth.getToken() else { return .signedOut }
        try await refreshSubscriptionStatus(token: token)
        guard isPremiumSubscriber else { return .subscriptionRequired }

        if isFavorite(station) {
            try await APIClient.removeFavorite(stationID: station.stationID, token: token)
            favorites.removeAll { $0.stationID == station.stationID }
        } else {
            try await APIClient.addFavorite(station: station, token: token)
            if !isFavorite(station) { favorites.append(station) }
        }
        return .updated
    }

    func toggleFavoriteRiver(name: String, province: String, stations: [RiverStation], clerk: Clerk) async throws -> FavoriteChangeResult {
        let key = riverKey(name: name, province: province)
        guard pendingFavoriteKeys.insert(key).inserted else { return .updated }
        defer { pendingFavoriteKeys.remove(key) }

        guard let token = try await clerk.auth.getToken() else { return .signedOut }
        try await refreshSubscriptionStatus(token: token)
        guard isPremiumSubscriber else { return .subscriptionRequired }

        if let savedRiver = savedRiver(name: name, province: province) {
            try await APIClient.removeRiverFavorite(favoriteID: savedRiver.favoriteID, token: token)
            favoriteRivers.removeAll { $0.id == savedRiver.id }
        } else {
            let record = try await APIClient.addRiverFavorite(name: name, province: province, stations: stations, token: token)
            favoriteRivers.removeAll { $0.id == record.stationID }
            favoriteRivers.append(SavedRiver(favoriteID: record.stationID, name: name, province: province, stations: stations))
        }
        return .updated
    }

    /// Keeps a saved river's station snapshot in step with the live river list.
    func refreshSavedRiverIfNeeded(name: String, province: String, stations: [RiverStation], clerk: Clerk) async {
        guard let savedRiver = savedRiver(name: name, province: province), !stations.isEmpty,
              Set(savedRiver.stations.map(\.stationID)) != Set(stations.map(\.stationID)) else { return }
        let key = riverKey(name: name, province: province)
        guard pendingFavoriteKeys.insert(key).inserted else { return }
        defer { pendingFavoriteKeys.remove(key) }

        guard let token = try? await clerk.auth.getToken(),
              let record = try? await APIClient.addRiverFavorite(name: name, province: province, stations: stations, token: token),
              let index = favoriteRivers.firstIndex(where: { $0.id == record.stationID }) else { return }
        favoriteRivers[index] = SavedRiver(favoriteID: record.stationID, name: savedRiver.name, province: savedRiver.province, stations: stations)
    }

    private func savedRiver(name: String, province: String) -> SavedRiver? {
        favoriteRivers.first {
            $0.name.trimmingCharacters(in: .whitespaces).localizedCaseInsensitiveCompare(name.trimmingCharacters(in: .whitespaces)) == .orderedSame &&
                $0.province.localizedCaseInsensitiveCompare(province) == .orderedSame
        }
    }

    private func riverKey(name: String, province: String) -> String {
        "river:\(province.uppercased())|\(name.trimmingCharacters(in: .whitespaces).lowercased())"
    }
}

struct SavedRiver: Identifiable, Hashable {
    let favoriteID: String
    let name: String
    let province: String
    let stations: [RiverStation]

    var id: String { favoriteID }
}

enum FavoriteChangeResult {
    case updated
    case signedOut
    case subscriptionRequired
}