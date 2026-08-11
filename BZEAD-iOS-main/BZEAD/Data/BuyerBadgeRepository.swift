import Foundation

struct BuyerBadges {
    let cartCount: Int
    let wishlistCount: Int
    let notificationCount: Int

    init(cartCount: Int = 0, wishlistCount: Int = 0, notificationCount: Int = 0) {
        self.cartCount = cartCount
        self.wishlistCount = wishlistCount
        self.notificationCount = notificationCount
    }
}

final class BuyerBadgeRepository {
    static let sellerOnlyTypes = [
        "product_approved",
        "product_rejected",
        "identity_approved",
        "identity_rejected",
        "identity_pending",
        "payout_completed",
        "payout_failed",
        "warehouse_approved",
        "warehouse_rejected",
        "warehouse_pending",
    ]

    private let http = SupabaseHTTP.shared

    func fetchBadges(session: BuyerSession) async -> BuyerBadges {
        guard SupabaseConfig.isConfigured() else { return BuyerBadges() }

        async let cartCount = countTable(session: session, table: "cart_items")
        async let wishlistCount = countTable(session: session, table: "wishlists")
        async let notificationCount = countUnreadNotifications(session: session)

        return BuyerBadges(
            cartCount: await cartCount,
            wishlistCount: await wishlistCount,
            notificationCount: await notificationCount
        )
    }

    private func countTable(session: BuyerSession, table: String) async -> Int {
        var headers = http.authHeaders(session: session)
        headers["Prefer"] = "count=exact"
        headers["Range"] = "0-0"

        let url = "\(SupabaseConfig.url)/rest/v1/\(table)?user_id=eq.\(session.userId)&select=id"
        do {
            let (_, response) = try await http.getAllowingErrorStatus(url, headers: headers)
            guard http.isSuccess(response) else { return 0 }
            return parseContentRangeTotal(response)
        } catch {
            return 0
        }
    }

    private func countUnreadNotifications(session: BuyerSession) async -> Int {
        let sellerTypes = Self.sellerOnlyTypes.map { "\"\($0)\"" }.joined(separator: ",")
        var headers = http.authHeaders(session: session)
        headers["Prefer"] = "count=exact"
        headers["Range"] = "0-0"

        let url = "\(SupabaseConfig.url)/rest/v1/notifications" +
            "?user_id=eq.\(session.userId)" +
            "&is_read=eq.false" +
            "&type=not.in.(\(sellerTypes))" +
            "&select=id"

        do {
            let (_, response) = try await http.getAllowingErrorStatus(url, headers: headers)
            guard http.isSuccess(response) else { return 0 }
            return parseContentRangeTotal(response)
        } catch {
            return 0
        }
    }

    private func parseContentRangeTotal(_ response: HTTPURLResponse) -> Int {
        let contentRange = response.value(forHTTPHeaderField: "Content-Range") ?? ""
        guard let slash = contentRange.lastIndex(of: "/") else { return 0 }
        let totalPart = contentRange[contentRange.index(after: slash)...]
        return Int(totalPart) ?? 0
    }
}
