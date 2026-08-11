import Foundation

enum CheckoutPreferencesRepository {
    private static let defaults = UserDefaults(suiteName: "bzead_checkout") ?? .standard
    private static let shippingCountryKey = "shipping_country"

    static func saveShippingCountry(_ country: String) async {
        defaults.set(country.trimmingCharacters(in: .whitespacesAndNewlines), forKey: shippingCountryKey)
    }

    static func readShippingCountry() async -> String {
        defaults.string(forKey: shippingCountryKey) ?? ""
    }

    static func clear() async {
        defaults.removeObject(forKey: shippingCountryKey)
    }
}
