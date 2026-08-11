import SwiftUI

/// Set to `false` after config smoke test passes on a real device/simulator build.
private let runConfigSmokeTest = true

@main
struct BZEADApp: App {
    init() {
        PushNotificationManager.initialize()
    }

    var body: some Scene {
        WindowGroup {
            if runConfigSmokeTest {
                ConfigSmokeTestView()
            } else {
                BzeadApp()
            }
        }
    }
}
