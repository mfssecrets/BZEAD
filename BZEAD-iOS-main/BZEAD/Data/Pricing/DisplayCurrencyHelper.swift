import Foundation

enum DisplayCurrencyHelper {
    private struct CountryCurrencyRow: Codable {
        let countryName: String?
        let countryCode: String?
        let shortCode: String?
        let iso2: String?
        let currencyCode: String?
    }

    private static var countryCurrencyCache: [CountryCurrencyRow]?

    /// Manual header currency when set; otherwise currency for destination country.
    static func resolveDisplayCurrency(destinationCountry: String? = nil) async -> String {
        let manual = (await CurrencyPreferencesRepository.read())
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        if !manual.isEmpty, SupportedCurrencies.all.contains(where: { $0.code == manual }) {
            return manual
        }
        return await resolveCheckoutCurrency(destinationCountry: destinationCountry)
    }

    /// Checkout target currency — destination country only.
    static func resolveCheckoutCurrency(destinationCountry: String?) async -> String {
        let country = destinationCountry?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if country.isEmpty { return "INR" }
        return await resolveCountryCurrency(country)
    }

    static func convertForDisplay(
        amount: Double,
        sourceCurrency: String,
        destinationCountry: String? = nil
    ) async -> Double {
        guard amount.isFinite, amount != 0 else { return 0 }
        let from = sourceCurrency.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let fromCode = from.isEmpty ? "INR" : from
        let to = await resolveDisplayCurrency(destinationCountry: destinationCountry)
        if fromCode == to { return CurrencyConverter.round2(amount) }
        let rates = await CurrencyConverter.fetchRates()
        return CurrencyConverter.round2(CurrencyConverter.convert(amount, fromCurrency: fromCode, toCurrency: to, rates: rates))
    }

    static func convertForCheckout(
        amount: Double,
        sourceCurrency: String,
        destinationCountry: String
    ) async -> Double {
        guard amount.isFinite, amount != 0 else { return 0 }
        let from = sourceCurrency.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let fromCode = from.isEmpty ? "INR" : from
        let to = await resolveCheckoutCurrency(destinationCountry: destinationCountry)
        if fromCode == to { return CurrencyConverter.round2(amount) }
        let rates = await CurrencyConverter.fetchRates()
        return CurrencyConverter.round2(CurrencyConverter.convert(amount, fromCurrency: fromCode, toCurrency: to, rates: rates))
    }

    private static func resolveCountryCurrency(_ country: String) async -> String {
        let rows = await loadCountries()
        let destTokens = tokenSet(country)
        for row in rows {
            let rowTokens = tokenSet(row.countryName, row.countryCode, row.shortCode, row.iso2)
            if rowTokens.contains(where: { destTokens.contains($0) }) {
                let code = row.currencyCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
                return code.isEmpty ? "INR" : code
            }
        }
        return "INR"
    }

    private static func loadCountries() async -> [CountryCurrencyRow] {
        if let countryCurrencyCache { return countryCurrencyCache }
        guard SupabaseConfig.isConfigured() else { return [] }

        let http = SupabaseHTTP.shared
        let url = "\(SupabaseConfig.url)/rest/v1/countries?is_active=eq.true" +
            "&select=country_name,country_code,short_code,iso2,currency_code"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([CountryCurrencyRow].self, from: data)
            countryCurrencyCache = rows
            return rows
        } catch {
            return []
        }
    }

    private static func tokenSet(_ values: String?...) -> Set<String> {
        Set(values.compactMap { value in
            let token = value?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
                .replacingOccurrences(of: "\\s+", with: "", options: .regularExpression) ?? ""
            return token.isEmpty ? nil : token
        })
    }
}
