import Foundation

struct CategoryRow: Codable {
    let id: String
    let name: String?
    let slug: String?
    let parentId: String?
}

struct ProductReview {
    let id: String
    let reviewerName: String
    let rating: Int
    let heading: String
    let text: String
    let date: String
    let images: [String]
}

struct ProductDetailBundle {
    let product: ProductDetail
    let categoryName: String?
    let categorySlug: String?
    let subCategoryName: String?
    let subCategorySlug: String?
    let weightUnitCode: String
    let reviews: [ProductReview]
    let similarProducts: [ProductRow]
}

struct DeliveryEstimateState {
    let addressLabel: String?
    let addressType: String?
    let pincode: String?
    let loading: Bool
    let deliveryDateText: String?
    let notServiceable: Bool
    let fallbackMessage: String?

    init(
        addressLabel: String? = nil,
        addressType: String? = nil,
        pincode: String? = nil,
        loading: Bool = false,
        deliveryDateText: String? = nil,
        notServiceable: Bool = false,
        fallbackMessage: String? = nil
    ) {
        self.addressLabel = addressLabel
        self.addressType = addressType
        self.pincode = pincode
        self.loading = loading
        self.deliveryDateText = deliveryDateText
        self.notServiceable = notServiceable
        self.fallbackMessage = fallbackMessage
    }
}
