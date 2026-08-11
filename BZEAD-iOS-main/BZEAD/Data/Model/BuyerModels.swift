import Foundation

struct OrderRow: Codable {
    let id: String
    let orderNumber: String?
    let status: String?
    let paymentStatus: String?
    let totalAmount: Double?
    let currency: String?
    let createdAt: String?
    let trackingNumber: String?
    let shippingCarrier: String?
    let shippingServiceLevel: String?
    let expectedDeliveryDays: Int?
    let completedAt: String?
    let shippingAddress: [String: JSONValue]?
    let orderItems: [OrderItemRow]?
}

struct NotificationRow: Codable {
    let id: String
    let type: String
    let title: String
    let message: String
    let isRead: Bool
    let createdAt: String?
    let metadata: [String: JSONValue]?

    init(
        id: String,
        type: String,
        title: String,
        message: String,
        isRead: Bool = false,
        createdAt: String? = nil,
        metadata: [String: JSONValue]? = nil
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.message = message
        self.isRead = isRead
        self.createdAt = createdAt
        self.metadata = metadata
    }
}
