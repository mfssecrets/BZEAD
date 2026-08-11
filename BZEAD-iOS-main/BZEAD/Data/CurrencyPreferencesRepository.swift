import Foundation

enum CurrencyPreferencesRepository {
    private static let defaults = UserDefaults(suiteName: "bzead_currency") ?? .standard
    private static let currencyKey = "display_currency"

    static func read() async -> String {
        let value = defaults.string(forKey: currencyKey) ?? ""
        return value.isEmpty ? "INR" : value
    }

    static func save(code: String) async {
        defaults.set(code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), forKey: currencyKey)
    }
}

struct SupportedCurrency {
    let code: String
    let symbol: String
    let name: String
}

enum SupportedCurrencies {
    static let all: [SupportedCurrency] = [
        SupportedCurrency(code: "INR", symbol: "₹", name: "Indian Rupee"),
        SupportedCurrency(code: "USD", symbol: "$", name: "US Dollar"),
        SupportedCurrency(code: "EUR", symbol: "€", name: "Euro"),
        SupportedCurrency(code: "GBP", symbol: "£", name: "British Pound"),
        SupportedCurrency(code: "JPY", symbol: "¥", name: "Japanese Yen"),
        SupportedCurrency(code: "AUD", symbol: "A$", name: "Australian Dollar"),
        SupportedCurrency(code: "CAD", symbol: "C$", name: "Canadian Dollar"),
        SupportedCurrency(code: "AED", symbol: "د.إ", name: "UAE Dirham"),
        SupportedCurrency(code: "SGD", symbol: "S$", name: "Singapore Dollar"),
        SupportedCurrency(code: "SAR", symbol: "﷼", name: "Saudi Riyal"),
    ]
}
