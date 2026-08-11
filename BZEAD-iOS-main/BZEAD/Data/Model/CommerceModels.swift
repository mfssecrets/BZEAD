import Foundation

struct ProductVariant: Codable {
    let id: String?
    let variantType: String?
    let size: String?
    let sizeValue: String?
    let color: String?
    let colorHex: String?
    let sku: String?
    let price: Double?
    let mrp: Double?
    let stock: Int?
    let images: [String]?
}

struct OfferRuleRow: Codable {
    let id: String?
    let offerType: String?
    let buyQuantity: Int?
    let getQuantity: Int?
    let specialDayName: String?
    let discountPercent: Double?
    let startTime: String?
    let endTime: String?
    let bundleMinQty: Int?
    let bundleDiscount: Double?
    let isActive: Bool?
}

struct ProductDetail: Codable {
    let id: String
    let publicProductId: String?
    let name: String
    let slug: String?
    let brand: String?
    let description: String?
    let shortDescription: String?
    let price: Double
    let mrp: Double?
    let currency: String?
    let imageUrl: String?
    let images: [String]?
    let rating: Double?
    let reviewCount: Int?
    let stock: Int?
    let itemCondition: String?
    let category: String?
    let subCategory: String?
    let sku: String?
    let hsnCode: String?
    let variants: [ProductVariant]?
    let offerRules: [OfferRuleRow]?
    let highlights: [String]?
    let specifications: [String: JSONValue]?
    let ingredients: String?
    let directions: String?
    let importantNote: String?
    let originCountry: String?
    let manufacturerName: String?
    let manufacturerCountry: String?
    let packageWeight: Double?
    let packageWeightUnitId: String?
    let packageLength: Double?
    let packageWidth: Double?
    let packageHeight: Double?
    let sellerId: String?
    let shipsInternationally: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, brand, description, price, mrp, currency, images, rating, stock, sku, highlights, ingredients, directions
        case publicProductId, shortDescription, imageUrl, reviewCount, itemCondition, category, subCategory, hsnCode
        case offerRules, specifications, importantNote, originCountry, manufacturerName, manufacturerCountry
        case packageWeight, packageWeightUnitId, packageLength, packageWidth, packageHeight, sellerId, shipsInternationally
        case variants = "product_variants"
    }
}

struct CartItemRow: Codable {
    let id: String?
    let userId: String?
    let productId: String
    let quantity: Int
    let selectedSize: String?
    let selectedColor: String?
    let selectedVariantSku: String?
    let unitPrice: Double?
    let products: ProductDetail?
}

struct CartLineItem {
    let rowId: String
    let cartItemId: String
    let product: ProductDetail
    let quantity: Int
    let selectedSize: String?
    let selectedColor: String?
    let selectedVariantSku: String?
    let unitPrice: Double?

    func lineTotal() -> Double {
        (unitPrice ?? product.price) * Double(quantity)
    }
}

struct WishlistRow: Codable {
    let id: String?
    let userId: String?
    let productId: String
    let products: ProductRow?
}

struct UserAddressRow: Codable {
    let id: String
    let userId: String
    let fullName: String
    let phoneNumber: String?
    let email: String?
    let country: String
    let streetAddress1: String
    let streetAddress2: String?
    let city: String
    let state: String
    let postalCode: String
    let addressType: String
    let deliveryNotes: String?
    let isDefault: Bool

    init(
        id: String,
        userId: String,
        fullName: String,
        phoneNumber: String? = nil,
        email: String? = nil,
        country: String,
        streetAddress1: String,
        streetAddress2: String? = nil,
        city: String,
        state: String,
        postalCode: String,
        addressType: String = "home",
        deliveryNotes: String? = nil,
        isDefault: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.fullName = fullName
        self.phoneNumber = phoneNumber
        self.email = email
        self.country = country
        self.streetAddress1 = streetAddress1
        self.streetAddress2 = streetAddress2
        self.city = city
        self.state = state
        self.postalCode = postalCode
        self.addressType = addressType
        self.deliveryNotes = deliveryNotes
        self.isDefault = isDefault
    }
}

struct ProfileDetail: Codable {
    let id: String
    let fullName: String?
    let email: String?
    let phone: String?
    let countryId: String?
    let notificationPreferences: [String: JSONValue]?
}

struct OrderItemRow: Codable {
    let id: String
    let orderId: String?
    let productId: String?
    let productName: String?
    let productImage: String?
    let sellerId: String?
    let quantity: Int?
    let price: Double?
    let customerUnitPrice: Double?
    let customerLineTotal: Double?
    let variantInfo: VariantInfoPayload?
}

struct OrderDetailRow: Codable {
    let id: String
    let orderNumber: String?
    let status: String?
    let paymentStatus: String?
    let paymentMethod: String?
    let paymentIntentId: String?
    let totalAmount: Double?
    let shippingCharge: Double?
    let platformFee: Double?
    let currency: String?
    let phone: String?
    let trackingNumber: String?
    let shippingCarrier: String?
    let createdAt: String?
    let shippingAddress: [String: JSONValue]?
    let orderItems: [OrderItemRow]?
}

struct CreateOrderRpcRequest: Codable {
    let userId: String
    let items: [CheckoutItemPayload]
    let shippingAddress: [String: String?]
    let billingAddress: [String: String?]?
    let country: String?
    let phone: String?
    let notes: String?
    let paymentIntentId: String?
    let paymentMethod: String?
    let paymentStatus: String?
    let orderStatus: String?
    let currency: String?
    let shippingCharge: Double
    let actualShippingCost: Double
    let platformShippingMargin: Double
    let shippingCarrier: String?
    let shippingServiceLevel: String?
    let shippingProvider: String?
    let shippingRateId: String?
    let expectedDeliveryDate: String?
    let expectedDeliveryDays: Int?
    let idempotencyKey: String?

    enum CodingKeys: String, CodingKey {
        case userId = "p_user_id"
        case items = "p_items"
        case shippingAddress = "p_shipping_address"
        case billingAddress = "p_billing_address"
        case country = "p_country"
        case phone = "p_phone"
        case notes = "p_notes"
        case paymentIntentId = "p_payment_intent_id"
        case paymentMethod = "p_payment_method"
        case paymentStatus = "p_payment_status"
        case orderStatus = "p_order_status"
        case currency = "p_currency"
        case shippingCharge = "p_shipping_charge"
        case actualShippingCost = "p_actual_shipping_cost"
        case platformShippingMargin = "p_platform_shipping_margin"
        case shippingCarrier = "p_shipping_carrier"
        case shippingServiceLevel = "p_shipping_service_level"
        case shippingProvider = "p_shipping_provider"
        case shippingRateId = "p_shipping_rate_id"
        case expectedDeliveryDate = "p_expected_delivery_date"
        case expectedDeliveryDays = "p_expected_delivery_days"
        case idempotencyKey = "p_idempotency_key"
    }
}

struct CheckoutItemPayload: Codable {
    let productId: String
    let quantity: Int
    let productName: String
    let productImage: String
    let variantInfo: VariantInfoPayload
}

struct VariantInfoPayload: Codable {
    let size: String?
    let color: String?
    let sku: String?
    let hsnCode: String?
}

struct CreateOrderRpcResponse: Codable {
    let id: String?
    let orderNumber: String?
}

struct PaymentIntentResponse: Codable {
    let clientSecret: String?
    let paymentIntentId: String?
    let error: String?
}

struct CheckoutDraft {
    let shippingAddress: UserAddressRow
    let subtotal: Double
    let currency: String
}

/// Encodes nullable string maps for Supabase RPC payloads.
struct NullableStringMap: Encodable {
    let values: [String: String?]

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        var dict: [String: String] = [:]
        for (key, value) in values {
            if let value { dict[key] = value }
        }
        try container.encode(dict)
    }
}

extension CreateOrderRpcRequest {
    func encodeForRPC(using encoder: JSONEncoder) throws -> Data {
        var root: [String: Any] = [
            "p_user_id": userId,
            "p_items": try items.map { item -> [String: Any] in
                let data = try encoder.encode(item)
                return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            },
            "p_shipping_address": nullableDict(shippingAddress),
            "p_shipping_charge": shippingCharge,
            "p_actual_shipping_cost": actualShippingCost,
            "p_platform_shipping_margin": platformShippingMargin,
        ]
        if let billingAddress { root["p_billing_address"] = nullableDict(billingAddress) }
        if let country { root["p_country"] = country }
        if let phone { root["p_phone"] = phone }
        if let notes { root["p_notes"] = notes }
        if let paymentIntentId { root["p_payment_intent_id"] = paymentIntentId }
        if let paymentMethod { root["p_payment_method"] = paymentMethod }
        if let paymentStatus { root["p_payment_status"] = paymentStatus }
        if let orderStatus { root["p_order_status"] = orderStatus }
        if let currency { root["p_currency"] = currency }
        if let shippingCarrier { root["p_shipping_carrier"] = shippingCarrier }
        if let shippingServiceLevel { root["p_shipping_service_level"] = shippingServiceLevel }
        if let shippingProvider { root["p_shipping_provider"] = shippingProvider }
        if let shippingRateId { root["p_shipping_rate_id"] = shippingRateId }
        if let expectedDeliveryDate { root["p_expected_delivery_date"] = expectedDeliveryDate }
        if let expectedDeliveryDays { root["p_expected_delivery_days"] = expectedDeliveryDays }
        if let idempotencyKey { root["p_idempotency_key"] = idempotencyKey }
        return try JSONSerialization.data(withJSONObject: root)
    }

    private func nullableDict(_ map: [String: String?]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in map {
            result[key] = value ?? NSNull()
        }
        return result
    }
}
