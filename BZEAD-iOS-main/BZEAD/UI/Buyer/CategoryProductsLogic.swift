import Foundation

enum CategoryProductsLogic {
    static func dynamicPriceMax(products: [CategoryProductRow]) -> Float {
        if products.isEmpty { return 100_000 }
        let maxPrice = products.map(\.price).max() ?? 0
        let stepped = Float(ceil(maxPrice / 500.0) * 500.0)
        return stepped > 0 ? stepped : 100_000
    }

    static func activeFilterCount(filters: CategoryFilterState, dynamicMax: Float) -> Int {
        var count = 0
        if filters.selectedSubcategory != nil { count += 1 }
        if filters.rating != nil { count += 1 }
        if filters.inStock { count += 1 }
        if filters.priceMin > 0 || filters.priceMax < dynamicMax { count += 1 }
        return count
    }

    static func filterAndSort(
        products: [CategoryProductRow],
        filters: CategoryFilterState,
        parentById: [String: String?],
        subcategories: [CategoryInfo]
    ) -> [CategoryProductRow] {
        var filtered = products

        if let subId = filters.selectedSubcategory {
            filtered = filtered.filter { belongsToSubcategorySection($0, subcategoryId: subId, parentById: parentById) }
        }

        filtered = filtered.filter { $0.price >= Double(filters.priceMin) && $0.price <= Double(filters.priceMax) }

        if let minRating = filters.rating {
            filtered = filtered.filter { ($0.rating ?? 0) >= Double(minRating) }
        }

        if filters.inStock {
            filtered = filtered.filter { ($0.stock ?? 0) > 0 }
        }

        switch filters.sortBy {
        case .priceLowHigh:
            return filtered.sorted { $0.price < $1.price }
        case .priceHighLow:
            return filtered.sorted { $0.price > $1.price }
        case .rating:
            return filtered.sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
        case .newest:
            return filtered.sorted { parseInstant($0.createdAt) > parseInstant($1.createdAt) }
        case .featured:
            return filtered
        }
    }

    static func subcategoryCounts(
        products: [CategoryProductRow],
        subcategories: [CategoryInfo],
        parentById: [String: String?]
    ) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: subcategories.map { sub in
            (sub.id, products.filter { belongsToSubcategorySection($0, subcategoryId: sub.id, parentById: parentById) }.count)
        })
    }

    static func subcategorySections(
        filtered: [CategoryProductRow],
        subcategories: [CategoryInfo],
        parentById: [String: String?]
    ) -> [(CategoryInfo, [CategoryProductRow])] {
        subcategories.compactMap { sub in
            let sectionProducts = filtered.filter { belongsToSubcategorySection($0, subcategoryId: sub.id, parentById: parentById) }
            return sectionProducts.isEmpty ? nil : (sub, sectionProducts)
        }
    }

    static func uncategorizedProducts(
        filtered: [CategoryProductRow],
        subcategories: [CategoryInfo],
        parentById: [String: String?]
    ) -> [CategoryProductRow] {
        if subcategories.isEmpty { return filtered }
        return filtered.filter { product in
            !subcategories.contains { sub in
                belongsToSubcategorySection(product, subcategoryId: sub.id, parentById: parentById)
            }
        }
    }

    static func uniqueBrands(products: [CategoryProductRow]) -> [String] {
        Array(Set(products.compactMap { $0.brand?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
    }

    private static func belongsToSubcategorySection(
        _ product: CategoryProductRow,
        subcategoryId: String,
        parentById: [String: String?]
    ) -> Bool {
        isNodeInsideSubtree(product.category, subtreeRootId: subcategoryId, parentById: parentById)
            || isNodeInsideSubtree(product.subCategory, subtreeRootId: subcategoryId, parentById: parentById)
            || isNodeInsideSubtree(product.productType, subtreeRootId: subcategoryId, parentById: parentById)
    }

    private static func isNodeInsideSubtree(
        _ nodeId: String?,
        subtreeRootId: String,
        parentById: [String: String?]
    ) -> Bool {
        guard let nodeId, !nodeId.isEmpty else { return false }
        var current: String? = nodeId
        var visited = Set<String>()
        while let id = current {
            if id == subtreeRootId { return true }
            if visited.contains(id) { break }
            visited.insert(id)
            current = parentById[id] ?? nil
        }
        return false
    }

    private static func parseInstant(_ value: String?) -> Date {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else {
            return .distantPast
        }
        return date
    }
}
