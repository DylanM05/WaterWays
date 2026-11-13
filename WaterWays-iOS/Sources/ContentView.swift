import ClerkKit
import SwiftUI

struct NativeTabShell: View {
    @Environment(Clerk.self) private var clerk
    @StateObject private var appState = AppState()

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            NavigationStack { ExploreView() }
                .tabItem { Label("Explore", systemImage: "water.waves") }
                .tag(AppTab.explore)
            NavigationStack { FavoritesView() }
                .tabItem { Label("Saved", systemImage: "heart") }
                .tag(AppTab.saved)
            NavigationStack { AccountView() }
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(AppTab.account)
        }
        .tint(Theme.accent)
        .environmentObject(appState)
        #if DEBUG
        .onAppear { DebugLaunch.apply(to: appState) }
        #endif
        .task(id: clerk.user?.id) {
            appState.startStoreKitTransactionListener(clerk: clerk)
            guard clerk.user != nil else {
                appState.clearAccountData()
                return
            }
            try? await appState.syncAccountData(clerk: clerk)
        }
    }
}

#if DEBUG
/// Launch arguments for screenshots of a particular screen, for example `-debugTab saved`, `-debugSearch fraser`
/// or `-debugStation 08MF005`.
enum DebugLaunch {
    static var search: String? { UserDefaults.standard.string(forKey: "debugSearch") }
    static var stationID: String? { UserDefaults.standard.string(forKey: "debugStation") }

    @MainActor
    static func apply(to appState: AppState) {
        switch UserDefaults.standard.string(forKey: "debugTab") {
        case "saved": appState.selectedTab = .saved
        case "account": appState.selectedTab = .account
        default: break
        }
    }
}
#endif

#Preview {
    NativeTabShell()
}
