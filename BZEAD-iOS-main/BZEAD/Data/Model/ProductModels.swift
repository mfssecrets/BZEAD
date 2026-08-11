import Foundation

struct ProductRow: Codable {
    let id: String
    let publicProductId: String?
    let name: String
    let slug: String?
    let price: Double
    let mrp: Double?
    let discountPrice: Double?
    let currency: String?
    let imageUrl: String?
    let rating: Double?
    let reviewCount: Int?
    let itemCondition: String?
    let isFeatured: Bool?
    let brand: String?
    let stock: Int?
}

struct PublicProductPrice: Codable {
    let productId: String?
    let sellingPrice: Double?
    let publicUnitPrice: Double?
    let markupMrp: Double?
}

struct HomeSectionData {
    let products: [ProductRow]
    let isSponsored: Bool

    init(products: [ProductRow], isSponsored: Bool = false) {
        self.products = products
        self.isSponsored = isSponsored
    }
}

enum ProductSection {
    case featured
    case hotDeals
    case trending
}

struct ProductSectionMeta {
    let title: String
    let subtitle: String?
    let icon: String?
}

extension ProductSection {
    func toSlug() -> String {
        switch self {
        case .featured: return "featured"
        case .hotDeals: return "hot-deals"
        case .trending: return "trending"
        }
    }
}

func productSectionFromSlug(_ slug: String) -> ProductSection? {
    switch slug.lowercased() {
    case "featured": return .featured
    case "hot-deals": return .hotDeals
    case "trending": return .trending
    default: return nil
    }
}
