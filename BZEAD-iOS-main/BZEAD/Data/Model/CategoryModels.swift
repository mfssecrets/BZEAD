import Foundation

struct CategoryInfo: Codable {
    let id: String
    let name: String
    let slug: String
    let parentId: String?
    let level: Int
    let displayOrder: Int

    init(
        id: String,
        name: String,
        slug: String,
        parentId: String? = nil,
        level: Int = 1,
        displayOrder: Int = 0
    ) {
        self.id = id
        self.name = name
        self.slug = slug
        self.parentId = parentId
        self.level = level
        self.displayOrder = displayOrder
    }
}

struct CategoryProductRow: Codable {
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
    let category: String?
    let subCategory: String?
    let productType: String?
    let stock: Int?
    let createdAt: String?
    let categoryName: String?
    let subCategoryName: String?
    let productTypeName: String?

    func toProductRow() -> ProductRow {
        ProductRow(
            id: id,
            publicProductId: publicProductId,
            name: name,
            slug: slug,
            price: price,
            mrp: mrp,
            discountPrice: discountPrice,
            currency: currency,
            imageUrl: imageUrl,
            rating: rating,
            reviewCount: reviewCount,
            itemCondition: itemCondition,
            isFeatured: isFeatured,
            brand: brand,
            stock: stock
        )
    }

    func copy(
        categoryName: String? = nil,
        subCategoryName: String? = nil,
        productTypeName: String? = nil
    ) -> CategoryProductRow {
        CategoryProductRow(
            id: id,
            publicProductId: publicProductId,
            name: name,
            slug: slug,
            price: price,
            mrp: mrp,
            discountPrice: discountPrice,
            currency: currency,
            imageUrl: imageUrl,
            rating: rating,
            reviewCount: reviewCount,
            itemCondition: itemCondition,
            isFeatured: isFeatured,
            brand: brand,
            category: category,
            subCategory: subCategory,
            productType: productType,
            stock: stock,
            createdAt: createdAt,
            categoryName: categoryName ?? self.categoryName,
            subCategoryName: subCategoryName ?? self.subCategoryName,
            productTypeName: productTypeName ?? self.productTypeName
        )
    }
}

struct CategoryContext {
    let category: CategoryInfo
    let parent: CategoryInfo?
    let children: [CategoryInfo]
    let allCategoryIds: [String]
    let categoryNames: [String: String]
    let parentById: [String: String?]
}

enum CategorySortBy {
    case featured
    case priceLowHigh
    case priceHighLow
    case rating
    case newest
}

struct CategoryFilterState {
    var priceMin: Float = 0
    var priceMax: Float = 100_000
    var rating: Int?
    var inStock: Bool = false
    var selectedSubcategory: String?
    var sortBy: CategorySortBy = .featured
}

struct SectionFilterState {
    var priceMin: Float = 0
    var priceMax: Float = 200_000
    var rating: Int?
    var inStock: Bool = false
    var category: String?
    var sortBy: CategorySortBy = .featured
}
