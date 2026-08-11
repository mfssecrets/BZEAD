import Foundation
import SwiftUI

enum ProductDetailTab: String, CaseIterable {
    case details = "Details"
    case specifications = "Specifications"
    case reviews = "Reviews"
}

enum ProductDetailHelpers {
    static func parseColorTokens(_ color: String?) -> [String] {
        guard let color, !color.isEmpty else { return [] }
        return color
            .split(whereSeparator: { ",/|".contains($0) })
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && $0.lowercased() != "default" }
    }

    static func resolveColorHex(colorName: String, colorHex: String? = nil) -> Color {
        if let hex = colorHex?.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: ""),
           hex.count >= 6,
           let value = UInt32(hex.prefix(6), radix: 16) {
            return Color(hex: value)
        }
        switch colorName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "black": return Color(hex: 0x000000)
        case "white": return Color.white
        case "red": return Color(hex: 0xEF4444)
        case "blue": return Color(hex: 0x3B82F6)
        case "green": return Color(hex: 0x22C55E)
        case "yellow": return Color(hex: 0xEAB308)
        case "pink": return Color(hex: 0xEC4899)
        case "purple": return Color(hex: 0x8B5CF6)
        case "orange": return Color(hex: 0xF97316)
        case "brown": return Color(hex: 0x92400E)
        case "grey", "gray": return Color(hex: 0x9CA3AF)
        case "navy": return Color(hex: 0x1E3A8A)
        case "beige": return Color(hex: 0xF5F5DC)
        case "gold": return Color(hex: 0xD4AF37)
        case "silver": return Color(hex: 0xC0C0C0)
        default: return Color(hex: 0xD1D5DB)
        }
    }

    static func availableSizes(variants: [ProductVariant]) -> [String] {
        variants
            .filter { $0.variantType == "size" || $0.variantType == "combination" }
            .compactMap { ($0.size ?? $0.sizeValue)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && $0.lowercased() != "default" }
            .uniqued()
    }

    static func availableColors(variants: [ProductVariant]) -> [String] {
        variants
            .filter { $0.variantType == "color" || $0.variantType == "combination" }
            .flatMap { parseColorTokens($0.color) }
            .uniqued()
    }

    static func preferredVariantSize(variants: [ProductVariant], sizes: [String]) -> String {
        let firstInStock = variants.first { ($0.stock ?? 0) > 0 }
        let s = (firstInStock?.size ?? firstInStock?.sizeValue)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !s.isEmpty, sizes.contains(s) { return s }
        return sizes.first ?? ""
    }

    static func preferredVariantColor(variants: [ProductVariant], colors: [String]) -> String {
        let firstInStock = variants.first { ($0.stock ?? 0) > 0 }
        let match = parseColorTokens(firstInStock?.color).first { colors.contains($0) }
        return match ?? colors.first ?? ""
    }

    static func colorHexByName(variants: [ProductVariant]) -> [String: Color] {
        var map: [String: Color] = [:]
        for variant in variants {
            for token in parseColorTokens(variant.color) {
                let key = token.lowercased()
                if map[key] == nil {
                    map[key] = resolveColorHex(colorName: token, colorHex: variant.colorHex)
                }
            }
        }
        return map
    }

    static func resolveVariant(product: ProductDetail?, size: String?, color: String?) -> ProductVariant? {
        let variants = product?.variants ?? []
        if variants.isEmpty { return nil }
        let normSize = size?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let normColor = color?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if let match = variants.first(where: { v in
            let vSizeFull = v.size?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
            let vSizeVal = v.sizeValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
            let vColorTokens = parseColorTokens(v.color).map { $0.lowercased() }
            if !normSize.isEmpty, vSizeFull != normSize, vSizeVal != normSize { return false }
            if !normColor.isEmpty, !vColorTokens.contains(normColor) { return false }
            return true
        }) {
            return match
        }
        return variants.first { ($0.stock ?? 0) > 0 } ?? variants.first
    }

    static func galleryImages(product: ProductDetail, selectedSize: String?, selectedColor: String?) -> [String] {
        let variant = resolveVariant(product: product, size: selectedSize, color: selectedColor)
        let variantImages = variant?.images?.filter { !$0.isEmpty } ?? []

        var colorOnlyImages: [String] = []
        if variantImages.isEmpty, let selectedColor, !selectedColor.isEmpty {
            let normColor = selectedColor.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if let match = product.variants?.first(where: { v in
                parseColorTokens(v.color).contains { $0.lowercased() == normColor }
                    && !(v.images?.isEmpty ?? true)
            }) {
                colorOnlyImages = match.images?.filter { !$0.isEmpty } ?? []
            }
        }

        let productImages = product.images?.filter { !$0.isEmpty } ?? []
        let primary = product.imageUrl.flatMap { $0.isEmpty ? nil : $0 }
        return (variantImages + colorOnlyImages + productImages + [primary].compactMap { $0 }).uniqued()
    }

    static func activeOffers(rules: [OfferRuleRow]?) -> [OfferRuleRow] {
        let now = Date().timeIntervalSince1970 * 1000
        return (rules ?? []).filter { offer in
            if offer.isActive == false { return false }
            let start = offer.startTime.flatMap { ISO8601DateFormatter().date(from: $0)?.timeIntervalSince1970 }.map { $0 * 1000 }
            let end = offer.endTime.flatMap { ISO8601DateFormatter().date(from: $0)?.timeIntervalSince1970 }.map { $0 * 1000 }
            if let start, now < start { return false }
            if let end, now > end { return false }
            return true
        }
    }

    static func formatOfferSummary(offer: OfferRuleRow) -> String {
        if let pct = offer.discountPercent, pct > 0 { return "\(Int(pct))% OFF" }
        if offer.offerType == "buy_x_get_y", let buy = offer.buyQuantity, let get = offer.getQuantity {
            return "Buy \(buy) Get \(get)"
        }
        if offer.offerType == "bundle_discount", let min = offer.bundleMinQty, let disc = offer.bundleDiscount {
            return "\(Int(disc))% OFF on \(min)+ items"
        }
        if offer.offerType == "special_day", let name = offer.specialDayName, !name.isEmpty {
            return "\(name) Offer"
        }
        let raw = offer.offerType?.replacingOccurrences(of: "_", with: " ") ?? ""
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    static func conditionLabel(_ condition: String?) -> String {
        switch condition {
        case "brand_new": return "Brand New"
        case "used_open_box": return "Used — Open Box"
        case "used_like_new": return "Used — Like New"
        case "used_very_good": return "Used — Very Good"
        case "used_good": return "Used — Good"
        case "used_acceptable": return "Used — Acceptable"
        case "refurbished": return "Refurbished"
        default:
            let c = condition?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return c.isEmpty ? "Brand New" : c
        }
    }

    static func formatWeight(weight: Double?, unitCode: String) -> String? {
        guard let value = weight, value > 0 else { return nil }
        let whole = value.truncatingRemainder(dividingBy: 1) == 0
        let formatted = whole ? String(Int(value)) : String(format: "%.2f", value)
        switch unitCode.uppercased() {
        case "G":
            if value >= 1000 {
                let kg = value / 1000
                return kg.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(kg)) kg"
                    : String(format: "%.2f kg", kg)
            }
            return "\(formatted) g"
        case "LB": return "\(formatted) lb"
        case "OZ": return "\(formatted) oz"
        default: return "\(formatted) kg"
        }
    }

    static func formatPrice(amount: Double, currency: String?) -> String {
        formatCurrency(amount: amount, currency: currency)
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
