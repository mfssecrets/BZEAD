import Foundation

enum SectionProductsLogic {
    static func dynamicPriceMax(products: [CategoryProductRow]) -> Float {
        if products.isEmpty { return 200_000 }
        let maxPrice = products.map(\.price).max() ?? 0
        let stepped = Float(ceil(maxPrice / 1000.0) * 1000.0)
        return stepped > 0 ? stepped : 200_000
    }

    static func activeFilterCount(filters: SectionFilterState, dynamicMax: Float) -> Int {
        var count = 0
        if filters.category != nil { count += 1 }
        if filters.rating != nil { count += 1 }
        if filters.inStock { count += 1 }
        if filters.priceMin > 0 || filters.priceMax < dynamicMax { count += 1 }
        return count
    }

    static func availableCategories(
        products: [CategoryProductRow],
        categoryNames: [String: String]
    ) -> [(String, String)] {
        var catSet: [(String, String)] = []
        var seen = Set<String>()
        for product in products {
            guard let id = product.category, !seen.contains(id) else { continue }
            seen.insert(id)
            let name = categoryNames[id] ?? product.categoryName ?? id
            catSet.append((id, name))
        }
        return catSet.sorted { $0.1 < $1.1 }
    }

    static func filterAndSort(
        products: [CategoryProductRow],
        filters: SectionFilterState
    ) -> [CategoryProductRow] {
        var filtered = products.filter { product in
            product.price >= Double(filters.priceMin)
                && product.price <= Double(filters.priceMax)
                && (filters.rating == nil || (product.rating ?? 0) >= Double(filters.rating!))
                && (!filters.inStock || (product.stock ?? 0) > 0)
                && (filters.category == nil || product.category == filters.category)
        }

        switch filters.sortBy {
        case .priceLowHigh:
            filtered.sort { $0.price < $1.price }
        case .priceHighLow:
            filtered.sort { $0.price > $1.price }
        case .rating:
            filtered.sort { ($0.rating ?? 0) > ($1.rating ?? 0) }
        case .newest:
            filtered.sort { parseInstant($0.createdAt) > parseInstant($1.createdAt) }
        case .featured:
            break
        }
        return filtered
    }

    private static func parseInstant(_ value: String?) -> Date {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else {
            return .distantPast
        }
        return date
    }
}
