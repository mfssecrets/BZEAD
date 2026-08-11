import Foundation

enum BuyerNavRoute: Hashable {
    case home
    case productDetail(productId: String)
    case cart
    case wishlist
    case checkoutShipping
    case checkoutReview
    case checkoutPayment
    case orderDetail(orderId: String)
    case settings
    case addresses
    case writeReview(productId: String, productName: String)
    case categoryProducts(categoryRef: String)
    case sectionProducts(section: String)
    case orderConfirmation(orderId: String)
}

enum BuyerTab: Hashable {
    case home
    case orders
    case notifications
    case profile
}
