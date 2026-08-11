import Foundation

final class CartRepository {
    private let http = SupabaseHTTP.shared

    func cartItemId(productId: String, size: String?, color: String?, sku: String?) -> String {
        func token(_ value: String?) -> String {
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
            return trimmed.isEmpty ? "-" : trimmed
        }
        return "\(productId)::\(token(size))::\(token(color))::\(token(sku))"
    }

    func fetchCart(session: BuyerSession) async -> [CartLineItem] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let url = "\(SupabaseConfig.url)/rest/v1/cart_items" +
            "?user_id=eq.\(session.userId)" +
            "&select=*,products(*,product_variants(*))"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([CartItemRow].self, from: data)
            return rows.compactMap { row in
                guard let product = row.products, let rowId = row.id else { return nil }
                return CartLineItem(
                    rowId: rowId,
                    cartItemId: cartItemId(
                        productId: row.productId,
                        size: row.selectedSize,
                        color: row.selectedColor,
                        sku: row.selectedVariantSku
                    ),
                    product: product,
                    quantity: row.quantity,
                    selectedSize: row.selectedSize,
                    selectedColor: row.selectedColor,
                    selectedVariantSku: row.selectedVariantSku,
                    unitPrice: row.unitPrice
                )
            }
        } catch {
            return []
        }
    }

    func upsertItem(
        session: BuyerSession,
        product: ProductDetail,
        quantity: Int,
        selectedSize: String? = nil,
        selectedColor: String? = nil,
        selectedVariantSku: String? = nil,
        unitPrice: Double? = nil
    ) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "CartRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Supabase not configured",
            ]))
        }

        var body: [String: Any] = [
            "user_id": session.userId,
            "product_id": product.id,
            "quantity": quantity,
            "selected_size": selectedSize as Any,
            "selected_color": selectedColor as Any,
            "selected_variant_sku": selectedVariantSku as Any,
        ]
        if let unitPrice { body["unit_price"] = unitPrice }

        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "resolution=merge-duplicates"
        headers["On-Conflict"] = "user_id,product_id,selected_size,selected_color,selected_variant_sku"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/cart_items",
                headers: headers,
                body: body
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "CartRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to update cart" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func updateQuantity(session: BuyerSession, item: CartLineItem, quantity: Int) async -> Result<Void, Error> {
        if quantity <= 0 { return await removeItem(session: session, item: item) }
        return await upsertItem(
            session: session,
            product: item.product,
            quantity: quantity,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
            selectedVariantSku: item.selectedVariantSku,
            unitPrice: item.unitPrice
        )
    }

    func removeItem(session: BuyerSession, item: CartLineItem) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "CartRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Supabase not configured",
            ]))
        }

        var url = "\(SupabaseConfig.url)/rest/v1/cart_items" +
            "?user_id=eq.\(session.userId)" +
            "&product_id=eq.\(item.product.id)"
        url += variantFilter(column: "selected_size", value: item.selectedSize)
        url += variantFilter(column: "selected_color", value: item.selectedColor)
        url += variantFilter(column: "selected_variant_sku", value: item.selectedVariantSku)

        do {
            let (data, response) = try await http.deleteAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "CartRepository", code: 3, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to remove cart item" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func clearCart(session: BuyerSession) async -> Result<Void, Error> {
        let url = "\(SupabaseConfig.url)/rest/v1/cart_items?user_id=eq.\(session.userId)"
        do {
            let (data, response) = try await http.deleteAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "CartRepository", code: 4, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to clear cart" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func addProduct(session: BuyerSession, productId: String, unitPrice: Double? = nil) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "CartRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Supabase not configured",
            ]))
        }

        var body: [String: Any] = [
            "user_id": session.userId,
            "product_id": productId,
            "quantity": 1,
        ]
        if let unitPrice { body["unit_price"] = unitPrice }

        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "resolution=merge-duplicates"
        headers["On-Conflict"] = "user_id,product_id,selected_size,selected_color,selected_variant_sku"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/cart_items",
                headers: headers,
                body: body
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "CartRepository", code: 5, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to add to cart" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    private func variantFilter(column: String, value: String?) -> String {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "&\(column)=eq.\(value)"
        }
        return "&\(column)=is.null"
    }
}
