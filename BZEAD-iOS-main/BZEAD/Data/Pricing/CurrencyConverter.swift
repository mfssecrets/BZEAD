import Foundation

struct CountryRateRow: Codable {
    let currencyCode: String?
    let exchangeRate: Double?
}

enum CurrencyConverter {
    private static var cachedRates: [String: Double] = [:]
    private static var lastFetchMs: Int64 = 0
    private static let cacheMs: Int64 = 3_600_000

    static func fetchRates() async -> [String: Double] {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if !cachedRates.isEmpty && now - lastFetchMs < cacheMs {
            return cachedRates
        }

        let http = SupabaseHTTP.shared
        let url = "\(SupabaseConfig.url)/rest/v1/countries" +
            "?is_active=eq.true" +
            "&exchange_rate=not.is.null" +
            "&select=currency_code,exchange_rate"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return cachedRates }

            let rows = try http.decode([CountryRateRow].self, from: data)
            var rates: [String: Double] = [:]
            for row in rows {
                let code = row.currencyCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
                if let rate = row.exchangeRate, !code.isEmpty, rate > 0 {
                    rates[code] = rate
                }
            }
            if !rates.isEmpty {
                cachedRates = rates
                lastFetchMs = now
            }
            return cachedRates
        } catch {
            return cachedRates
        }
    }

    static func convert(
        _ amount: Double,
        fromCurrency: String,
        toCurrency: String,
        rates: [String: Double]
    ) -> Double {
        guard amount.isFinite, amount != 0 else { return 0 }
        let from = fromCurrency.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let to = toCurrency.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let fromCode = from.isEmpty ? "INR" : from
        let toCode = to.isEmpty ? "INR" : to
        if fromCode == toCode { return amount }
        guard let fromRate = rates[fromCode] else { return amount }
        guard let toRate = rates[toCode] else { return amount }
        guard fromRate > 0, toRate > 0 else { return amount }

        let inUsd = fromCode == "USD" ? amount : amount / fromRate
        return toCode == "USD" ? inUsd : inUsd * toRate
    }

    static func round2(_ value: Double) -> Double {
        (value + 0.0000001).rounded(toPlaces: 2)
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let divisor = pow(10.0, Double(places))
        return (self * divisor).rounded() / divisor
    }
}
