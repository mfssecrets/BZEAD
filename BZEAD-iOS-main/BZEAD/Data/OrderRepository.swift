import Foundation

struct BuyerOrder {
    let order: OrderRow
    let sellerName: String
}

struct RefundRequestRow: Codable {
    let id: String
    let refundNumber: String?
    let status: String?
    let adminNote: String?
    let stripeRefundStatus: String?
    let orderId: String?
}

final class OrderRepository {
    private let http = SupabaseHTTP.shared
    private let orderListSelect =
        "id,order_number,status,payment_status,total_amount,currency,created_at,tracking_number," +
        "shipping_carrier,shipping_service_level,expected_delivery_days,completed_at,shipping_address," +
        "order_items(id,product_id,product_name,product_image,seller_id,quantity,price,variant_info)"

    func fetchOrders(session: BuyerSession) async -> [BuyerOrder] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let url = "\(SupabaseConfig.url)/rest/v1/orders" +
            "?user_id=eq.\(session.userId)" +
            "&select=\(orderListSelect)" +
            "&order=created_at.desc" +
            "&limit=50"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            let orders = try http.decode([OrderRow].self, from: data)
            let sellerIds = Array(Set(orders.flatMap { $0.orderItems ?? [] }.compactMap(\.sellerId)))
            let sellerNames = await fetchSellerNames(session: session, sellerIds: sellerIds)

            return orders.map { order in
                let firstSellerId = order.orderItems?.first?.sellerId
                let sellerName = firstSellerId.flatMap { sellerNames[$0] } ?? "BZEAD Seller"
                return BuyerOrder(order: order, sellerName: sellerName)
            }
        } catch {
            return []
        }
    }

    func fetchRefundRequests(session: BuyerSession, orderIds: [String]) async -> [String: RefundRequestRow] {
        guard SupabaseConfig.isConfigured(), !orderIds.isEmpty else { return [:] }
        let filter = orderIds.joined(separator: ",")
        let url = "\(SupabaseConfig.url)/rest/v1/refund_requests" +
            "?order_id=in.(\(filter))" +
            "&select=id,refund_number,status,admin_note,stripe_refund_status,order_id"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [:] }
            let rows = try http.decode([RefundRequestRow].self, from: data)
            var result: [String: RefundRequestRow] = [:]
            for row in rows {
                if let orderId = row.orderId { result[orderId] = row }
            }
            return result
        } catch {
            return [:]
        }
    }

    func cancelOrder(session: BuyerSession, orderId: String, reason: String) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "OrderRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Not configured",
            ]))
        }

        let body: [String: Any] = ["p_order_id": orderId, "p_reason": reason]
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/cancel_order_by_user",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "OrderRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data),
                ]))
            }
            let result = try http.decode(CancelOrderRpcResult.self, from: data)
            if result.success == true { return .success(()) }
            return .failure(NSError(domain: "OrderRepository", code: 3, userInfo: [
                NSLocalizedDescriptionKey: result.error ?? "Cancellation failed",
            ]))
        } catch {
            return .failure(error)
        }
    }

    func requestReturn(
        session: BuyerSession,
        orderId: String,
        reason: String,
        description: String?
    ) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "OrderRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Not configured",
            ]))
        }

        let body: [String: Any] = [
            "order_id": orderId,
            "user_id": session.userId,
            "reason": reason,
            "description": description as Any,
            "quantity": 1,
            "status": "requested",
        ]
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/order_returns",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "OrderRepository", code: 4, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data),
                ]))
            }

            var patchHeaders = http.authHeaders(session: session)
            patchHeaders["Content-Type"] = "application/json"
            _ = try? await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/orders?id=eq.\(orderId)",
                headers: patchHeaders,
                body: try http.encodeJSONObject(["status": "return_requested"])
            )
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    func requestRefund(session: BuyerSession, orderId: String, reason: String) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "OrderRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Not configured",
            ]))
        }

        let body: [String: Any] = ["p_order_id": orderId, "p_reason": reason]
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/request_refund",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "OrderRepository", code: 5, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data),
                ]))
            }
            if (try? http.decode([RefundRpcRow].self, from: data)) != nil {
                return .success(())
            }
            _ = try? http.decode(RefundRpcRow.self, from: data)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    func fetchOrderDetail(session: BuyerSession, orderId: String) async -> OrderDetailRow? {
        guard SupabaseConfig.isConfigured() else { return nil }

        let url = "\(SupabaseConfig.url)/rest/v1/orders" +
            "?id=eq.\(orderId)" +
            "&user_id=eq.\(session.userId)" +
            "&select=*,order_items(*)"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return nil }
            return try http.decode([OrderDetailRow].self, from: data).first
        } catch {
            return nil
        }
    }

    func fetchNotifications(session: BuyerSession) async -> [NotificationRow] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let sellerTypes = BuyerBadgeRepository.sellerOnlyTypes.map { "\"\($0)\"" }.joined(separator: ",")
        let url = "\(SupabaseConfig.url)/rest/v1/notifications" +
            "?user_id=eq.\(session.userId)" +
            "&type=not.in.(\(sellerTypes))" +
            "&select=id,type,title,message,is_read,created_at,metadata" +
            "&order=created_at.desc" +
            "&limit=50"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            return try http.decode([NotificationRow].self, from: data)
        } catch {
            return []
        }
    }

    func markNotificationRead(session: BuyerSession, notificationId: String) async -> Result<Void, Error> {
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        do {
            let (data, response) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/notifications?id=eq.\(notificationId)&user_id=eq.\(session.userId)",
                headers: headers,
                body: try http.encodeJSONObject(["is_read": true])
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "OrderRepository", code: 6, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to mark notification read" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func markAllNotificationsRead(session: BuyerSession) async -> Result<Void, Error> {
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        do {
            let (data, response) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/notifications?user_id=eq.\(session.userId)&is_read=eq.false",
                headers: headers,
                body: try http.encodeJSONObject(["is_read": true])
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "OrderRepository", code: 7, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to mark all read" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    private func fetchSellerNames(session: BuyerSession, sellerIds: [String]) async -> [String: String] {
        guard !sellerIds.isEmpty else { return [:] }
        let filter = sellerIds.joined(separator: ",")
        let url = "\(SupabaseConfig.url)/rest/v1/profiles?id=in.(\(filter))&select=id,full_name"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [:] }
            let rows = try http.decode([OrderSellerProfileRow].self, from: data)
            return Dictionary(uniqueKeysWithValues: rows.map { row in
                let name = row.fullName?.trimmingCharacters(in: .whitespacesAndNewlines)
                return (row.id, (name?.isEmpty == false ? name! : "Seller"))
            })
        } catch {
            return [:]
        }
    }

    private struct CancelOrderRpcResult: Codable {
        let success: Bool?
        let error: String?
    }

    private struct RefundRpcRow: Codable {
        let id: String?
        let refundNumber: String?
    }

    private struct OrderSellerProfileRow: Codable {
        let id: String
        let fullName: String?
    }
}
