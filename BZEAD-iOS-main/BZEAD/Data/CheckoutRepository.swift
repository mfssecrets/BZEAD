import Foundation

final class CheckoutRepository {
    private let cartRepository: CartRepository
    private let http = SupabaseHTTP.shared

    init(cartRepository: CartRepository = CartRepository()) {
        self.cartRepository = cartRepository
    }

    func createPaymentIntent(
        session: BuyerSession,
        amountSmallestUnit: Int64,
        currency: String,
        metadata: [String: String] = [:]
    ) async -> Result<PaymentIntentResponse, Error> {
        var body: [String: Any] = [
            "amount": amountSmallestUnit,
            "currency": currency.lowercased(),
            "client": "native",
        ]
        if !metadata.isEmpty {
            body["metadata"] = metadata
        }

        var headers = http.anonHeaders()
        headers["Authorization"] = "Bearer \(session.accessToken)"
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/functions/v1/create-payment-intent",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "CheckoutRepository", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data),
                ]))
            }
            let result = try http.decode(PaymentIntentResponse.self, from: data)
            if let secret = result.clientSecret, !secret.isEmpty,
               let intentId = result.paymentIntentId, !intentId.isEmpty {
                return .success(result)
            }
            return .failure(NSError(domain: "CheckoutRepository", code: 2, userInfo: [
                NSLocalizedDescriptionKey: result.error ?? "Payment intent failed",
            ]))
        } catch {
            return .failure(error)
        }
    }

    func createOrder(
        session: BuyerSession,
        items: [CartLineItem],
        address: UserAddressRow,
        paymentMethod: String,
        paymentIntentId: String,
        paymentStatus: String,
        orderStatus: String,
        currency: String,
        pricing: CheckoutPricingQuote
    ) async -> Result<CreateOrderRpcResponse, Error> {
        let shippingMap = addressToMap(address)
        let rpcItems = items.map { line -> CheckoutItemPayload in
            let variantCount = line.product.variants?.count ?? 0
            let safeSku = line.selectedVariantSku ?? (variantCount > 1 ? nil : line.product.sku)
            return CheckoutItemPayload(
                productId: line.product.id,
                quantity: line.quantity,
                productName: line.product.name,
                productImage: line.product.imageUrl ?? "",
                variantInfo: VariantInfoPayload(
                    size: line.selectedSize,
                    color: line.selectedColor,
                    sku: safeSku,
                    hsnCode: line.product.hsnCode
                )
            )
        }

        let idempotencyKey = paymentMethod == "cod" ? "cod_\(paymentIntentId)" : "stripe_\(paymentIntentId)"

        let request = CreateOrderRpcRequest(
            userId: session.userId,
            items: rpcItems,
            shippingAddress: shippingMap,
            billingAddress: shippingMap,
            country: address.country,
            phone: address.phoneNumber,
            notes: nil,
            paymentIntentId: paymentIntentId,
            paymentMethod: paymentMethod,
            paymentStatus: paymentStatus,
            orderStatus: orderStatus,
            currency: currency.uppercased(),
            shippingCharge: pricing.shipping,
            actualShippingCost: pricing.actualShippingCost,
            platformShippingMargin: pricing.platformShippingMargin,
            shippingCarrier: pricing.shippingCarrier,
            shippingServiceLevel: pricing.shippingServiceLevel,
            shippingProvider: pricing.shippingProvider,
            shippingRateId: pricing.shippingRateId,
            expectedDeliveryDate: nil,
            expectedDeliveryDays: pricing.estimatedDeliveryDays,
            idempotencyKey: idempotencyKey
        )

        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        let body = try? request.encodeForRPC(using: http.encoder)

        do {
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/create_order_secure",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "CheckoutRepository", code: 3, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data),
                ]))
            }
            let order = try http.decode(CreateOrderRpcResponse.self, from: data)
            _ = await cartRepository.clearCart(session: session)
            return .success(order)
        } catch {
            return .failure(error)
        }
    }

    func toStripeAmount(displayAmount: Double, currency: String) -> Int64 {
        let zeroDecimal: Set<String> = [
            "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
        ]
        if zeroDecimal.contains(currency.lowercased()) {
            return Int64(displayAmount)
        }
        return Int64(displayAmount * 100)
    }

    private func addressToMap(_ address: UserAddressRow) -> [String: String?] {
        [
            "street": address.streetAddress1,
            "street_address_1": address.streetAddress1,
            "street_address_2": address.streetAddress2,
            "city": address.city,
            "state": address.state,
            "postalCode": address.postalCode,
            "postal_code": address.postalCode,
            "country": address.country,
            "full_name": address.fullName,
            "phone": address.phoneNumber,
            "phone_number": address.phoneNumber,
            "email": address.email,
        ]
    }
}
