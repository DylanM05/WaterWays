import ClerkKit
import SwiftUI

struct NativeTabShell: View {
    @Environment(Clerk.self) private var clerk
    @StateObject private var appState = AppState()

    var body: some View {
        TabView {
            NavigationStack { ExploreView() }
                .tabItem { Label("Explore", systemImage: "water.waves") }
            NavigationStack { FavoritesView() }
                .tabItem { Label("Saved", systemImage: "heart") }
            NavigationStack { AccountView() }
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(Theme.accent)
        .environmentObject(appState)
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

#Preview {
    NativeTabShell()
}
