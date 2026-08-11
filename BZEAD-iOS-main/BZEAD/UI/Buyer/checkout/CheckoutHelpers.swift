import Foundation

struct CheckoutLoadResult {
    let items: [CartLineItem]
    let quote: CheckoutPricingQuote?
}

enum CheckoutHelpers {
    private static let indiaTokens: Set<String> = ["INDIA", "IN", "IND"]

    static func loadCartAndQuote(
        session: BuyerSession,
        address: UserAddressRow,
        cartRepo: CartRepository = CartRepository(),
        pricingRepo: ProductPricingRepository = ProductPricingRepository()
    ) async -> CheckoutLoadResult {
        let items = await cartRepo.fetchCart(session: session)
        if items.isEmpty { return CheckoutLoadResult(items: [], quote: nil) }

        let publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: items.map { $0.product.id }.uniqued(),
            countryCandidates: [address.country],
            productCurrencies: Dictionary(uniqueKeysWithValues: items.map { ($0.product.id, $0.product.currency ?? "INR") })
        )

        let pricingItems = items.map { line -> CheckoutPricingInputItem in
            let unit = line.unitPrice
                ?? publicPrices[line.product.id]?.publicUnitPrice
                ?? line.product.price
            return CheckoutPricingInputItem(
                productId: line.product.id,
                productName: line.product.name,
                quantity: line.quantity,
                unitPrice: unit,
                currency: line.product.currency ?? "INR"
            )
        }

        let quote = await CheckoutPricingService.calculateDestinationCheckoutPricing(
            items: pricingItems,
            destinationCountry: address.country,
            destinationPostalCode: address.postalCode,
            session: session
        )
        return CheckoutLoadResult(items: items, quote: quote)
    }

    static func isIndiaDestination(country: String) -> Bool {
        let token = country
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
        return indiaTokens.contains(token)
    }

    static func formatDeliveryDateFromDays(_ days: Int?) -> String? {
        guard let days, days > 0 else { return nil }
        let date = Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "d MMM yyyy"
        return formatter.string(from: date)
    }

    static func formatAddressBlock(address: UserAddressRow) -> [String] {
        var lines = [address.streetAddress1]
        if let street2 = address.streetAddress2?.trimmingCharacters(in: .whitespacesAndNewlines), !street2.isEmpty {
            lines.append(street2)
        }
        lines.append("\(address.city), \(address.state) \(address.postalCode)")
        lines.append(address.country)
        if let phone = address.phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines), !phone.isEmpty {
            lines.append("Phone: \(phone)")
        }
        return lines
    }

    static func productImageUrl(item: CartLineItem) -> String? {
        item.product.images?.first ?? item.product.imageUrl
    }

    static func minimumOrderNotMet(quote: CheckoutPricingQuote?) -> Bool {
        guard let constraint = quote?.minimumOrderConstraint else { return false }
        return !constraint.isMet
    }

    static func minimumOrderDisplayAmount(quote: CheckoutPricingQuote?, currency: String) -> String? {
        guard let constraint = quote?.minimumOrderConstraint else { return nil }
        return formatCurrency(amount: constraint.minimumInCheckoutCurrency, currency: currency)
    }

    static func parseMinimumOrderAmount(error: String?, currency: String) -> String? {
        guard let error, !error.isEmpty else { return nil }
        let pattern = #"([\d,.]+)\s*([£$€₹]|\w{3})"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: error, range: NSRange(error.startIndex..., in: error)),
              let range = Range(match.range, in: error) else { return nil }
        return String(error[range])
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
