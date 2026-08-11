import Foundation
import SwiftUI

enum OrderFilterKey: String, CaseIterable {
    case all = "All"
    case pending = "Pending"
    case accepted = "Accepted"
    case shipped = "Shipped"
    case delivered = "Delivered"
    case cancelled = "Cancelled"
    case returns = "Returns"
}

struct OrderStatusStyle {
    let label: String
    let bg: Color
    let text: Color
    let dot: Color
    let border: Color
}

enum OrderDisplayUtils {    static func formatFrontend12DigitId(rawId: String) -> String {
        let digitsOnly = rawId.filter(\.isNumber)
        if !digitsOnly.isEmpty {
            return String(digitsOnly.suffix(12)).padding(toLength: 12, withPad: "0", startingAt: 0)
        }
        var value: UInt64 = 0
        for ch in rawId.lowercased() {
            let digit: Int?
            if ch.isNumber {
                digit = Int(String(ch))
            } else if ch.isLetter, let ascii = ch.asciiValue, ascii >= 97, ascii <= 122 {
                digit = Int(ascii - 97 + 10)
            } else {
                digit = nil
            }
            guard let digit, (0...35).contains(digit) else { continue }
            value = (value &* 36 &+ UInt64(digit)) % 1_000_000_000_000
        }
        return String(value).padding(toLength: 12, withPad: "0", startingAt: 0)
    }

    static func displayOrderNumber(order: OrderRow) -> String {
        let raw = order.orderNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !raw.isEmpty {
            return raw.uppercased().hasPrefix("ORD-") ? raw.uppercased() : "ORD-\(raw)"
        }
        return "ORD-\(formatFrontend12DigitId(rawId: order.id))"
    }

    static func displayOrderNumber(order: OrderDetailRow) -> String {
        let raw = order.orderNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !raw.isEmpty {
            return raw.uppercased().hasPrefix("ORD-") ? raw.uppercased() : "ORD-\(raw)"
        }
        return formatFrontend12DigitId(rawId: order.id)
    }

    static func normalizeOrderStatus(_ status: String?) -> String {
        let normalized = status?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? status!.lowercased()
            : "pending"
        return normalized == "new" ? "pending" : normalized
    }

    static func matchesFilter(status: String, filter: OrderFilterKey) -> Bool {
        switch filter {
        case .all: return true
        case .pending: return status == "pending" || status == "processing"
        case .accepted: return status == "accepted" || status == "packed"
        case .shipped: return ["shipped", "in_transit", "out_for_delivery"].contains(status)
        case .delivered: return status == "delivered"
        case .cancelled: return status == "cancelled"
        case .returns: return ["return_requested", "returned", "refunded"].contains(status)
        }
    }

    static func canTrack(_ status: String) -> Bool {
        ["in_transit", "out_for_delivery", "delivered", "shipped"].contains(status)
    }

    static func canCancel(_ status: String) -> Bool {
        ["pending", "processing", "accepted"].contains(status)
    }

    static func canReturn(_ status: String) -> Bool { status == "delivered" }
    static func canInvoice(_ status: String) -> Bool { status == "delivered" }
    static func canReview(_ status: String) -> Bool { status == "delivered" }
    static func canBuyAgain(_ status: String) -> Bool {
        ["delivered", "cancelled", "returned", "refunded"].contains(status)
    }

    static func canRequestRefund(status: String, paymentStatus: String?) -> Bool {
        status == "cancelled" && isPaidStatus(paymentStatus)
    }

    static func isPaidStatus(_ paymentStatus: String?) -> Bool {
        let p = paymentStatus?.lowercased() ?? ""
        return ["paid", "completed", "succeeded"].contains(p)
    }

    static func orderStatusStyle(_ status: String) -> OrderStatusStyle {
        switch status {
        case "pending":
            return OrderStatusStyle(label: "Pending", bg: Color(hex: 0xFFFBEB), text: Color(hex: 0xB45309), dot: Color(hex: 0xF59E0B), border: Color(hex: 0xFDE68A))
        case "processing":
            return OrderStatusStyle(label: "Processing", bg: Color(hex: 0xEFF6FF), text: Color(hex: 0x1D4ED8), dot: Color(hex: 0x3B82F6), border: Color(hex: 0xBFDBFE))
        case "accepted":
            return OrderStatusStyle(label: "Accepted", bg: Color(hex: 0xFEFCE8), text: Color(hex: 0xA16207), dot: Color(hex: 0xEAB308), border: Color(hex: 0xFEF08A))
        case "packed":
            return OrderStatusStyle(label: "Packed", bg: Color(hex: 0xECFEFF), text: Color(hex: 0x0E7490), dot: Color(hex: 0x06B6D4), border: Color(hex: 0xA5F3FC))
        case "shipped":
            return OrderStatusStyle(label: "Shipped", bg: Color(hex: 0xEEF2FF), text: Color(hex: 0x4338CA), dot: Color(hex: 0x6366F1), border: Color(hex: 0xC7D2FE))
        case "in_transit":
            return OrderStatusStyle(label: "In Transit", bg: Color(hex: 0xFAF5FF), text: Color(hex: 0x7E22CE), dot: Color(hex: 0xA855F7), border: Color(hex: 0xE9D5FF))
        case "out_for_delivery":
            return OrderStatusStyle(label: "Out for Delivery", bg: Color(hex: 0xFAF5FF), text: Color(hex: 0x7C3AED), dot: Color(hex: 0xA855F7), border: Color(hex: 0xE9D5FF))
        case "delivered":
            return OrderStatusStyle(label: "Delivered", bg: Color(hex: 0xF0FDF4), text: Color(hex: 0x16A34A), dot: Color(hex: 0x22C55E), border: Color(hex: 0xBBF7D0))
        case "cancelled":
            return OrderStatusStyle(label: "Cancelled", bg: Color(hex: 0xFEF2F2), text: Color(hex: 0xB91C1C), dot: Color(hex: 0xEF4444), border: Color(hex: 0xFECACA))
        case "return_requested":
            return OrderStatusStyle(label: "Return Requested", bg: Color(hex: 0xFFF7ED), text: Color(hex: 0xC2410C), dot: Color(hex: 0xF97316), border: Color(hex: 0xFED7AA))
        case "returned":
            return OrderStatusStyle(label: "Returned", bg: Color(hex: 0xFFF7ED), text: Color(hex: 0xEA580C), dot: Color(hex: 0xF97316), border: Color(hex: 0xFED7AA))
        case "refunded":
            return OrderStatusStyle(label: "Refunded", bg: Color(hex: 0xF9FAFB), text: Color(hex: 0x4B5563), dot: Color(hex: 0x6B7280), border: Color(hex: 0xE5E7EB))
        default:
            return OrderStatusStyle(label: "Pending", bg: Color(hex: 0xFFFBEB), text: Color(hex: 0xB45309), dot: Color(hex: 0xF59E0B), border: Color(hex: 0xFDE68A))
        }
    }

    static func orderStatusLabel(_ status: String) -> String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    static func orderStatusColor(_ status: String) -> Color {
        switch status {
        case "delivered": return Color(hex: 0x16A34A)
        case "cancelled": return Color(hex: 0xDC2626)
        case "shipped", "in_transit": return Color(hex: 0x7C3AED)
        default: return Color(hex: 0x2563EB)
        }
    }

    static func formatOrderDate(_ createdAt: String?, pattern: String = "dd/MM/yyyy") -> String {
        formatDisplayDate(raw: createdAt, pattern: pattern)
    }

    static func formatOrderDateTime(_ createdAt: String?) -> String {
        formatDisplayDate(raw: createdAt, pattern: "MMMM d, yyyy 'at' h:mm a")
    }

    static func formatDisplayDate(raw: String?, pattern: String = "dd MMM yyyy") -> String {
        guard let raw, !raw.isEmpty else { return "" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: raw)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: raw)
        }
        guard let date else { return String(raw.prefix(16)) }
        let display = DateFormatter()
        display.dateFormat = pattern
        display.timeZone = .current
        return display.string(from: date)
    }

    static func formatShortDate(_ createdAt: String?) -> String? {
        let value = formatDisplayDate(raw: createdAt, pattern: "EEE, d MMM · h:mm a")
        return value.isEmpty ? nil : value
    }

    static func shippingField(_ address: [String: JSONValue]?, keys: [String]) -> String? {
        guard let address else { return nil }
        for key in keys {
            if case .string(let value) = address[key], !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return value
            }
        }
        return nil
    }

    static func cancelReasons() -> [String] {
        ["Changed my mind", "Found better price elsewhere", "Ordered by mistake", "Delivery too slow", "Other"]
    }

    static func returnReasons() -> [String] {
        ["Defective or damaged product", "Wrong item received", "Item not as described", "Quality not satisfactory", "Size/fit issue", "Other"]
    }
}
