import Foundation

struct ResolvedPublicPrice {
    let publicUnitPrice: Double
    let markupMrp: Double
    let sourceCurrency: String
    let displayUnitPrice: Double
    let displayMrp: Double
    let displayCurrency: String

    init(
        publicUnitPrice: Double,
        markupMrp: Double,
        sourceCurrency: String = "INR",
        displayUnitPrice: Double? = nil,
        displayMrp: Double? = nil,
        displayCurrency: String? = nil
    ) {
        self.publicUnitPrice = publicUnitPrice
        self.markupMrp = markupMrp
        self.sourceCurrency = sourceCurrency
        self.displayUnitPrice = displayUnitPrice ?? publicUnitPrice
        self.displayMrp = displayMrp ?? markupMrp
        self.displayCurrency = displayCurrency ?? sourceCurrency
    }
}

final class ProductPricingRepository {
    private let http = SupabaseHTTP.shared

    func fetchPublicPrices(
        productIds: [String],
        country: String?,
        priceOverrides: [String: Double] = [:]
    ) async -> [String: ResolvedPublicPrice] {
        await fetchPublicPricesWithFallback(
            productIds: productIds,
            countryCandidates: country.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : [$0] } ?? [],
            priceOverrides: priceOverrides
        )
    }

    func fetchPublicPricesWithFallback(
        productIds: [String],
        countryCandidates: [String],
        priceOverrides: [String: Double] = [:],
        productCurrencies: [String: String] = [:]
    ) async -> [String: ResolvedPublicPrice] {
        guard SupabaseConfig.isConfigured(), !productIds.isEmpty else { return [:] }

        var candidates = countryCandidates + [DestinationCountryRepository.guestFallback]
        candidates = candidates
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var distinct: [String] = []
        for value in candidates where !distinct.contains(value) {
            distinct.append(value)
        }

        let displayCountry = distinct.first
        let displayCurrency = await DisplayCurrencyHelper.resolveDisplayCurrency(destinationCountry: displayCountry)
        let rates = await CurrencyConverter.fetchRates()

        for country in distinct {
            let prices = await callRpc(
                productIds: productIds,
                country: country,
                priceOverrides: priceOverrides,
                productCurrencies: productCurrencies,
                displayCurrency: displayCurrency,
                rates: rates
            )
            if !prices.isEmpty { return prices }
        }
        return [:]
    }

    private func callRpc(
        productIds: [String],
        country: String,
        priceOverrides: [String: Double],
        productCurrencies: [String: String],
        displayCurrency: String,
        rates: [String: Double]
    ) async -> [String: ResolvedPublicPrice] {
        let hasOverrides = !priceOverrides.isEmpty && priceOverrides.values.contains(where: { $0 > 0 })
        let rpcName = hasOverrides ? "get_public_product_prices_with_overrides" : "get_public_product_prices"

        var body: [String: Any] = [
            "p_product_ids": productIds,
            "p_country": country,
        ]
        if hasOverrides {
            var overrides: [String: Double] = [:]
            for (id, price) in priceOverrides where price > 0 {
                overrides[id] = price
            }
            body["p_price_overrides"] = overrides
        }

        do {
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/\(rpcName)",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else { return [:] }

            let rows = try http.decode([PublicProductPrice].self, from: data)
            var result: [String: ResolvedPublicPrice] = [:]
            for row in rows {
                guard let id = row.productId else { continue }
                guard let price = row.sellingPrice ?? row.publicUnitPrice, price > 0 else { continue }
                let sourceCurrency = productCurrencies[id]?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                let source = (sourceCurrency?.isEmpty == false ? sourceCurrency! : "INR")
                let mrp = row.markupMrp ?? 0
                let displayUnit: Double
                let displayMrp: Double
                if source == displayCurrency {
                    displayUnit = CurrencyConverter.round2(price)
                    displayMrp = mrp <= 0 ? 0 : CurrencyConverter.round2(mrp)
                } else {
                    displayUnit = CurrencyConverter.round2(
                        CurrencyConverter.convert(price, fromCurrency: source, toCurrency: displayCurrency, rates: rates)
                    )
                    displayMrp = mrp <= 0 ? 0 : CurrencyConverter.round2(
                        CurrencyConverter.convert(mrp, fromCurrency: source, toCurrency: displayCurrency, rates: rates)
                    )
                }
                result[id] = ResolvedPublicPrice(
                    publicUnitPrice: price,
                    markupMrp: mrp,
                    sourceCurrency: source,
                    displayUnitPrice: displayUnit,
                    displayMrp: displayMrp,
                    displayCurrency: displayCurrency
                )
            }
            return result
        } catch {
            return [:]
        }
    }
}
