import Foundation

final class CategoryRepository {
    private let http = SupabaseHTTP.shared
    private let productFields =
        "id,public_product_id,name,slug,price,mrp,discount_price,currency,image_url,rating,review_count,item_condition,is_featured,brand,category,sub_category,product_type,stock,created_at"

    func fetchCategoryContext(slugOrId: String) async -> CategoryContext? {
        guard SupabaseConfig.isConfigured() else { return nil }

        let category: CategoryInfo?
        if isUuid(slugOrId) {
            category = await fetchCategoryById(slugOrId)
        } else {
            category = await fetchCategoryBySlug(slugOrId)
        }
        guard let category else { return nil }

        let flatCats = await fetchCategoriesFlat()
        let parent = category.parentId.flatMap { pid in flatCats.first(where: { $0.id == pid }) }
        let children = flatCats
            .filter { $0.parentId == category.id }
            .sorted { $0.displayOrder < $1.displayOrder }

        let childIds = children.map(\.id)
        let grandchildIds = flatCats.filter { childIds.contains($0.parentId ?? "") }.map(\.id)
        let allCategoryIds = Array(Set([category.id] + childIds + grandchildIds))

        return CategoryContext(
            category: category,
            parent: parent,
            children: children,
            allCategoryIds: allCategoryIds,
            categoryNames: Dictionary(uniqueKeysWithValues: flatCats.map { ($0.id, $0.name) }),
            parentById: Dictionary(uniqueKeysWithValues: flatCats.map { ($0.id, $0.parentId) })
        )
    }

    func fetchProductsForCategories(
        categoryIds: [String],
        categoryNames: [String: String],
        limit: Int = 500
    ) async -> [CategoryProductRow] {
        guard SupabaseConfig.isConfigured(), !categoryIds.isEmpty else { return [] }

        let inList = categoryIds.joined(separator: ",")
        let orFilter = "or=(category.in.(\(inList)),sub_category.in.(\(inList)),product_type.in.(\(inList)))"
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved" +
            "&is_active=eq.true" +
            "&\(orFilter)" +
            "&select=\(productFields)" +
            "&limit=\(limit)"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([CategoryProductRow].self, from: data)
            return rows.map { row in
                row.copy(
                    categoryName: row.category.flatMap { categoryNames[$0] },
                    subCategoryName: row.subCategory.flatMap { categoryNames[$0] },
                    productTypeName: row.productType.flatMap { categoryNames[$0] }
                )
            }
        } catch {
            return []
        }
    }

    func fetchCategoryNameMap() async -> [String: String] {
        let flat = await fetchCategoriesFlat()
        return Dictionary(uniqueKeysWithValues: flat.map { ($0.id, $0.name) })
    }

    private func fetchCategoryById(_ id: String) async -> CategoryInfo? {
        let url = "\(SupabaseConfig.url)/rest/v1/categories?id=eq.\(id)&is_active=eq.true&select=id,name,slug,parent_id,level,display_order&limit=1"
        return await fetchSingleCategory(url: url)
    }

    private func fetchCategoryBySlug(_ slug: String) async -> CategoryInfo? {
        let encoded = slug.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = "\(SupabaseConfig.url)/rest/v1/categories?slug=eq.\(encoded)&is_active=eq.true&select=id,name,slug,parent_id,level,display_order&limit=1"
        return await fetchSingleCategory(url: url)
    }

    private func fetchSingleCategory(url: String) async -> CategoryInfo? {
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return nil }
            return try http.decode([CategoryInfo].self, from: data).first
        } catch {
            return nil
        }
    }

    private func fetchCategoriesFlat() async -> [CategoryInfo] {
        let pageSize = 1000
        var all: [CategoryInfo] = []
        var offset = 0
        while true {
            let url = "\(SupabaseConfig.url)/rest/v1/categories" +
                "?is_active=eq.true" +
                "&select=id,name,slug,parent_id,level,display_order" +
                "&order=display_order.asc" +
                "&limit=\(pageSize)" +
                "&offset=\(offset)"
            do {
                let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
                guard http.isSuccess(response) else { break }
                let page = try http.decode([CategoryInfo].self, from: data)
                all.append(contentsOf: page)
                if page.count < pageSize { break }
                offset += pageSize
            } catch {
                break
            }
        }
        return all
    }

    private func isUuid(_ value: String) -> Bool {
        UUID(uuidString: value) != nil
    }
}
