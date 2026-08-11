import Foundation

enum SupabaseConfig {
    private static func stringValue(for key: String, default defaultValue: String = "") -> String {
        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty {
            return value
        }
        if let secretsURL = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
           let data = try? Data(contentsOf: secretsURL),
           let dict = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
           let value = dict[key] as? String, !value.isEmpty {
            return value
        }
        return defaultValue
    }

    static var url: String {
        stringValue(for: "SUPABASE_URL", default: "https://aiiefgjfftmerayihpbv.supabase.co")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    static var anonKey: String {
        stringValue(for: "SUPABASE_ANON_KEY").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var publicAppUrl: String {
        stringValue(for: "PUBLIC_APP_URL", default: "https://bzead.com")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    static var stripePublishableKey: String {
        stringValue(for: "STRIPE_PUBLISHABLE_KEY").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var oneSignalAppId: String {
        stringValue(for: "ONESIGNAL_APP_ID").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var sellerPortalUrl: String { "\(publicAppUrl)/seller" }

    static let authStorageKey = "sb-aiiefgjfftmerayihpbv-auth-token"

    static func isConfigured() -> Bool {
        !url.isEmpty && !anonKey.isEmpty
    }
}
