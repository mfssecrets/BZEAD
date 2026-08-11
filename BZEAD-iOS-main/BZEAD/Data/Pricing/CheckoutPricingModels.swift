import Foundation

struct CheckoutPricingLineItem {
    let productId: String
    let productName: String
    let quantity: Int
    let sourceCurrency: String
    let sourceUnitPrice: Double
    let convertedUnitPrice: Double
    let convertedLineTotal: Double
}

struct MinimumOrderConstraint {
    let code: String
    let minimumInr: Double
    let minimumInCheckoutCurrency: Double
    let currentSubtotalInr: Double
    let currentSubtotalInCheckoutCurrency: Double
    let isMet: Bool

    init(
        code: String = "INDIA_TO_UK_MIN_SUBTOTAL",
        minimumInr: Double,
        minimumInCheckoutCurrency: Double,
        currentSubtotalInr: Double,
        currentSubtotalInCheckoutCurrency: Double,
        isMet: Bool
    ) {
        self.code = code
        self.minimumInr = minimumInr
        self.minimumInCheckoutCurrency = minimumInCheckoutCurrency
        self.currentSubtotalInr = currentSubtotalInr
        self.currentSubtotalInCheckoutCurrency = currentSubtotalInCheckoutCurrency
        self.isMet = isMet
    }
}

struct CheckoutPricingQuote {
    let currency: String
    let destinationCountry: String
    let subtotal: Double
    let offerDiscount: Double
    let shipping: Double
    let total: Double
    let platformHandlingCharge: Double
    let actualShippingCost: Double
    let platformShippingMargin: Double
    let codEligible: Bool
    let hasInternationalItems: Bool
    let lineItems: [CheckoutPricingLineItem]
    let minimumOrderConstraint: MinimumOrderConstraint?
    let shippingError: String?
    let shippingCarrier: String?
    let shippingServiceLevel: String?
    let shippingProvider: String?
    let shippingRateId: String?
    let estimatedDeliveryDays: Int?
    let intlShippingOptions: IntlShippingOptions?

    func copy(
        shipping: Double? = nil,
        total: Double? = nil,
        shippingCarrier: String? = nil,
        shippingServiceLevel: String? = nil,
        shippingRateId: String? = nil,
        shippingProvider: String? = nil,
        estimatedDeliveryDays: Int? = nil
    ) -> CheckoutPricingQuote {
        CheckoutPricingQuote(
            currency: currency,
            destinationCountry: destinationCountry,
            subtotal: subtotal,
            offerDiscount: offerDiscount,
            shipping: shipping ?? self.shipping,
            total: total ?? self.total,
            platformHandlingCharge: platformHandlingCharge,
            actualShippingCost: actualShippingCost,
            platformShippingMargin: platformShippingMargin,
            codEligible: codEligible,
            hasInternationalItems: hasInternationalItems,
            lineItems: lineItems,
            minimumOrderConstraint: minimumOrderConstraint,
            shippingError: shippingError,
            shippingCarrier: shippingCarrier ?? self.shippingCarrier,
            shippingServiceLevel: shippingServiceLevel ?? self.shippingServiceLevel,
            shippingProvider: shippingProvider ?? self.shippingProvider,
            shippingRateId: shippingRateId ?? self.shippingRateId,
            estimatedDeliveryDays: estimatedDeliveryDays ?? self.estimatedDeliveryDays,
            intlShippingOptions: intlShippingOptions
        )
    }
}

struct IntlShippingOptions {
    let standard: IntlShippingOption
    let premium: IntlShippingOption?
    let express: IntlShippingOption?
}

struct IntlShippingOption {
    let shipping: Double
    let total: Double
    let estimatedDays: String
    let carrierName: String?
    let serviceLevel: String?
    let rateId: String?
    let provider: String?

    init(
        shipping: Double,
        total: Double,
        estimatedDays: String = "",
        carrierName: String? = nil,
        serviceLevel: String? = nil,
        rateId: String? = nil,
        provider: String? = nil
    ) {
        self.shipping = shipping
        self.total = total
        self.estimatedDays = estimatedDays
        self.carrierName = carrierName
        self.serviceLevel = serviceLevel
        self.rateId = rateId
        self.provider = provider
    }
}

enum ShippingTier {
    case standard
    case premium
    case express
}

struct CheckoutPricingInputItem {
    let productId: String
    let productName: String
    let quantity: Int
    let unitPrice: Double
    let currency: String
}
