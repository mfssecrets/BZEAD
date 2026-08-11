import Foundation

final class WishlistRepository {
    private let http = SupabaseHTTP.shared

    func fetchWishlist(session: BuyerSession) async -> [ProductRow] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let url = "\(SupabaseConfig.url)/rest/v1/wishlists" +
            "?user_id=eq.\(session.userId)" +
            "&select=*,products(id,public_product_id,name,slug,price,mrp,currency,image_url,rating,review_count,item_condition,stock)"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([WishlistRow].self, from: data)
            return rows.compactMap(\.products)
        } catch {
            return []
        }
    }

    func isInWishlist(session: BuyerSession, productId: String) async -> Bool {
        let url = "\(SupabaseConfig.url)/rest/v1/wishlists" +
            "?user_id=eq.\(session.userId)" +
            "&product_id=eq.\(productId)" +
            "&select=id"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return false }
            let rows = try http.decode([WishlistRow].self, from: data)
            return !rows.isEmpty
        } catch {
            return false
        }
    }

    func add(session: BuyerSession, productId: String) async -> Result<Void, Error> {
        let body: [String: Any] = [
            "user_id": session.userId,
            "product_id": productId,
        ]
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "resolution=merge-duplicates"
        headers["On-Conflict"] = "user_id,product_id"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/wishlists",
                headers: headers,
                body: body
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "WishlistRepository", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to add to wishlist" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func remove(session: BuyerSession, productId: String) async -> Result<Void, Error> {
        let url = "\(SupabaseConfig.url)/rest/v1/wishlists" +
            "?user_id=eq.\(session.userId)" +
            "&product_id=eq.\(productId)"
        do {
            let (data, response) = try await http.deleteAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "WishlistRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to remove from wishlist" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }
}
