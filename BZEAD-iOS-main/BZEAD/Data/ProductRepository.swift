import Foundation

final class ProductRepository {
    static let homepageSectionMax = 100
    static let sectionPageMax = 200

    private let http = SupabaseHTTP.shared
    private let listFields =
        "id,public_product_id,name,slug,price,mrp,discount_price,currency,image_url,rating,review_count,item_condition,is_featured,brand,created_at"
    private let sectionPageFields = "\(listFields),stock,category"

    func loadHomeSections() async -> (HomeSectionData, HomeSectionData, HomeSectionData) {
        let sponsored = await fetchSponsoredBySection()
        let hasSponsored = sponsored.values.contains(where: { !$0.isEmpty })

        if hasSponsored {
            return (
                HomeSectionData(products: sponsored["featured"] ?? [], isSponsored: true),
                HomeSectionData(products: sponsored["hot-deals"] ?? [], isSponsored: true),
                HomeSectionData(products: sponsored["trending"] ?? [], isSponsored: true)
            )
        }

        async let featured = fetchSection(.featured)
        async let hotDeals = fetchSection(.hotDeals)
        async let trending = fetchSection(.trending)
        return (
            HomeSectionData(products: await featured),
            HomeSectionData(products: await hotDeals),
            HomeSectionData(products: await trending)
        )
    }

    func fetchSection(_ section: ProductSection, limit: Int = homepageSectionMax) async -> [ProductRow] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let products: [ProductRow]
        switch section {
        case .featured: products = await fetchFeatured(limit: limit)
        case .hotDeals: products = await fetchHotDeals(limit: limit)
        case .trending: products = await fetchTrending(limit: limit)
        }
        return products
    }

    func fetchSectionPageProducts(
        section: ProductSection,
        categoryNames: [String: String]
    ) async -> [CategoryProductRow] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let key = sectionKey(section)
        let sponsoredMap = await fetchSponsoredSectionPage()
        let sponsored = sponsoredMap[key] ?? []
        let products: [CategoryProductRow]
        if !sponsored.isEmpty {
            products = sponsored
        } else {
            switch section {
            case .featured: products = await fetchFeaturedDetailed(limit: Self.sectionPageMax)
            case .hotDeals: products = await fetchHotDealsDetailed(limit: Self.sectionPageMax)
            case .trending: products = await fetchTrendingDetailed(limit: Self.sectionPageMax)
            }
        }

        return products.map { row in
            row.copy(categoryName: row.category.flatMap { categoryNames[$0] })
        }
    }

    func sectionKey(_ section: ProductSection) -> String { section.toSlug() }

    func fetchVariantProductIds(productIds: [String]) async -> Set<String> {
        guard !productIds.isEmpty else { return [] }
        let inClause = productIds.map { "\"\($0)\"" }.joined(separator: ",")
        let url = "\(SupabaseConfig.url)/rest/v1/product_variants?product_id=in.(\(inClause))&select=product_id"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([VariantIdRow].self, from: data)
            return Set(rows.compactMap(\.productId))
        } catch {
            return []
        }
    }

    func fetchById(productRef: String) async -> ProductDetail? {
        guard SupabaseConfig.isConfigured() else { return nil }

        let column: String
        if isUuid(productRef) {
            column = "id"
        } else if productRef.range(of: "^BZD\\d{9}$", options: [.regularExpression, .caseInsensitive]) != nil {
            column = "public_product_id"
        } else {
            column = "slug"
        }

        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?\(column)=eq.\(productRef)" +
            "&approval_status=eq.approved" +
            "&is_active=eq.true" +
            "&select=*,product_variants(*),offer_rules(*)"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return nil }
            return try http.decode([ProductDetail].self, from: data).first
        } catch {
            return nil
        }
    }

    func sectionMeta(_ section: ProductSection) -> ProductSectionMeta {
        switch section {
        case .featured:
            return ProductSectionMeta(
                title: "Featured Products",
                subtitle: "Hand-picked by our team — the best products across all categories",
                icon: "⭐"
            )
        case .hotDeals:
            return ProductSectionMeta(
                title: "Hot Deals",
                subtitle: "Massive discounts on top products — limited time offers",
                icon: "🔥"
            )
        case .trending:
            return ProductSectionMeta(
                title: "Trending Now",
                subtitle: "What everyone is buying right now — most popular picks",
                icon: "📈"
            )
        }
    }

    func sectionSeeMoreUrl(_ section: ProductSection) -> String {
        switch section {
        case .featured: return "\(SupabaseConfig.publicAppUrl)/products/featured"
        case .hotDeals: return "\(SupabaseConfig.publicAppUrl)/products/hot-deals"
        case .trending: return "\(SupabaseConfig.publicAppUrl)/products/section/trending"
        }
    }

    private func fetchSponsoredBySection() async -> [String: [ProductRow]] {
        let url = "\(SupabaseConfig.url)/rest/v1/sponsored_products" +
            "?is_active=eq.true" +
            "&select=section,start_at,end_at,products!inner(\(listFields))" +
            "&products.approval_status=eq.approved" +
            "&products.is_active=eq.true" +
            "&order=created_at.desc" +
            "&limit=200"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [:] }

            let now = Date()
            let rows = try http.decode([SponsoredRow].self, from: data)
            var result: [String: [ProductRow]] = [
                "featured": [],
                "hot-deals": [],
                "trending": [],
            ]

            for row in rows {
                guard let section = row.section, var bucket = result[section], let product = row.products else { continue }
                if let startAt = row.startAt, let start = ISO8601DateFormatter().date(from: startAt), now < start { continue }
                if let endAt = row.endAt, let end = ISO8601DateFormatter().date(from: endAt), now >= end { continue }
                guard bucket.count < Self.homepageSectionMax else { continue }
                guard !bucket.contains(where: { $0.id == product.id }) else { continue }
                bucket.append(product)
                result[section] = bucket
            }
            return result
        } catch {
            return [:]
        }
    }

    private func fetchSponsoredSectionPage() async -> [String: [CategoryProductRow]] {
        let url = "\(SupabaseConfig.url)/rest/v1/sponsored_products" +
            "?is_active=eq.true" +
            "&select=section,start_at,end_at,products!inner(\(sectionPageFields))" +
            "&products.approval_status=eq.approved" +
            "&products.is_active=eq.true" +
            "&order=created_at.desc" +
            "&limit=200"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [:] }

            let now = Date()
            let rows = try http.decode([SponsoredSectionPageRow].self, from: data)
            var result: [String: [CategoryProductRow]] = [
                "featured": [],
                "hot-deals": [],
                "trending": [],
            ]

            for row in rows {
                guard let section = row.section, var bucket = result[section], let product = row.products else { continue }
                if let startAt = row.startAt, let start = ISO8601DateFormatter().date(from: startAt), now < start { continue }
                if let endAt = row.endAt, let end = ISO8601DateFormatter().date(from: endAt), now >= end { continue }
                guard bucket.count < Self.sectionPageMax else { continue }
                guard !bucket.contains(where: { $0.id == product.id }) else { continue }
                bucket.append(product)
                result[section] = bucket
            }
            return result
        } catch {
            return [:]
        }
    }

    private func fetchFeaturedDetailed(limit: Int) async -> [CategoryProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true&is_featured=eq.true" +
            "&select=\(sectionPageFields)&order=created_at.desc&limit=\(limit)"
        return await fetchCategoryProducts(url: url)
    }

    private func fetchTrendingDetailed(limit: Int) async -> [CategoryProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true" +
            "&select=\(sectionPageFields)&order=created_at.desc&limit=\(limit)"
        return await fetchCategoryProducts(url: url)
    }

    private func fetchHotDealsDetailed(limit: Int) async -> [CategoryProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true&mrp=not.is.null" +
            "&select=\(sectionPageFields)&order=created_at.desc&limit=200"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([CategoryProductRow].self, from: data)
            return rows
                .filter { ($0.mrp ?? 0) > $0.price }
                .sorted { lhs, rhs in
                    let lhsMrp = lhs.mrp ?? 0
                    let rhsMrp = rhs.mrp ?? 0
                    let lhsPct = lhsMrp > 0 ? ((lhsMrp - lhs.price) / lhsMrp) * 100 : 0
                    let rhsPct = rhsMrp > 0 ? ((rhsMrp - rhs.price) / rhsMrp) * 100 : 0
                    return lhsPct > rhsPct
                }
                .prefix(limit)
                .map { $0 }
        } catch {
            return []
        }
    }

    private func fetchFeatured(limit: Int) async -> [ProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true&is_featured=eq.true" +
            "&select=\(listFields)&order=created_at.desc&limit=\(limit)"
        return await fetchProducts(url: url)
    }

    private func fetchTrending(limit: Int) async -> [ProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true" +
            "&select=\(listFields)&order=created_at.desc&limit=\(limit)"
        return await fetchProducts(url: url)
    }

    private func fetchHotDeals(limit: Int) async -> [ProductRow] {
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?approval_status=eq.approved&is_active=eq.true&mrp=not.is.null" +
            "&select=\(listFields)&order=created_at.desc&limit=200"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([ProductRow].self, from: data)
            return rows
                .filter { ($0.mrp ?? 0) > $0.price }
                .sorted { lhs, rhs in
                    let lhsMrp = lhs.mrp ?? 0
                    let rhsMrp = rhs.mrp ?? 0
                    let lhsPct = lhsMrp > 0 ? ((lhsMrp - lhs.price) / lhsMrp) * 100 : 0
                    let rhsPct = rhsMrp > 0 ? ((rhsMrp - rhs.price) / rhsMrp) * 100 : 0
                    return lhsPct > rhsPct
                }
                .prefix(limit)
                .map { $0 }
        } catch {
            return []
        }
    }

    private func fetchProducts(url: String) async -> [ProductRow] {
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            return try http.decode([ProductRow].self, from: data)
        } catch {
            return []
        }
    }

    private func fetchCategoryProducts(url: String) async -> [CategoryProductRow] {
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            return try http.decode([CategoryProductRow].self, from: data)
        } catch {
            return []
        }
    }

    private func isUuid(_ value: String) -> Bool {
        UUID(uuidString: value) != nil
    }

    private struct SponsoredSectionPageRow: Codable {
        let section: String?
        let startAt: String?
        let endAt: String?
        let products: CategoryProductRow?
    }

    private struct SponsoredRow: Codable {
        let section: String?
        let startAt: String?
        let endAt: String?
        let products: ProductRow?
    }

    private struct VariantIdRow: Codable {
        let productId: String?
    }
}
