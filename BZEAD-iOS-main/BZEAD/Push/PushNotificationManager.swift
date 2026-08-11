import Foundation
import OneSignalFramework

enum PushNotificationManager {
    private static let prefsSuite = "bzead_push"
    private static let keyPendingOrder = "pending_order_id"
    private static let keyOpenNotifications = "open_notifications"

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: prefsSuite) ?? .standard
    }

    static func isConfigured() -> Bool {
        !SupabaseConfig.oneSignalAppId.isEmpty
    }

    static func initialize() {
        let appId = SupabaseConfig.oneSignalAppId
        guard !appId.isEmpty else { return }

        OneSignal.initialize(appId, withLaunchOptions: nil)
        OneSignal.Notifications.addClickListener { event in
            handleNotificationClick(event: event)
        }
    }

    static func requestPermission(fallbackToSettings: Bool = true) async -> Bool {
        guard isConfigured() else { return false }
        return await withCheckedContinuation { continuation in
            OneSignal.Notifications.requestPermission({ accepted in
                continuation.resume(returning: accepted)
            }, fallbackToSettings: fallbackToSettings)
        }
    }

    static func login(userId: String) {
        guard isConfigured() else { return }
        let id = userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        OneSignal.login(id)
    }

    static func logout() {
        guard isConfigured() else { return }
        OneSignal.logout()
    }

    static func consumePendingOrderId() -> String? {
        let id = defaults.string(forKey: keyPendingOrder)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let id, !id.isEmpty {
            defaults.removeObject(forKey: keyPendingOrder)
            return id
        }
        return nil
    }

    static func consumeOpenNotificationsTab() -> Bool {
        let open = defaults.bool(forKey: keyOpenNotifications)
        if open {
            defaults.removeObject(forKey: keyOpenNotifications)
        }
        return open
    }

    private static func handleNotificationClick(event: OSNotificationClickEvent) {
        let data = event.notification.additionalData ?? [:]
        let orderId = extractOrderId(from: data)
        if let orderId {
            defaults.set(orderId, forKey: keyPendingOrder)
            defaults.removeObject(forKey: keyOpenNotifications)
        } else {
            defaults.set(true, forKey: keyOpenNotifications)
        }
    }

    private static func extractOrderId(from data: [AnyHashable: Any]) -> String? {
        for key in ["orderId", "order_id"] {
            if let value = data[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return nil
    }
}
