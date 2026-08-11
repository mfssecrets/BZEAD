import SwiftUI

struct ProductBreadcrumbView: View {
    let categoryName: String?
    let subCategoryName: String?
    let productName: String
    let onHome: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                Text("Home")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: 0x6B7280))
                    .onTapGesture(perform: onHome)
                if let categoryName, !categoryName.isEmpty {
                    Text("›").font(.system(size: 10)).foregroundStyle(Color(hex: 0x9CA3AF))
                    Text(categoryName).font(.system(size: 11)).foregroundStyle(Color(hex: 0x374151)).lineLimit(1)
                }
                if let subCategoryName, !subCategoryName.isEmpty {
                    Text("›").font(.system(size: 10)).foregroundStyle(Color(hex: 0x9CA3AF))
                    Text(subCategoryName).font(.system(size: 11)).foregroundStyle(Color(hex: 0x374151)).lineLimit(1)
                }
                Text("›").font(.system(size: 10)).foregroundStyle(Color(hex: 0x9CA3AF))
                Text(productName)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color.black)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}

struct ProductGallerySectionView: View {
    let images: [String]
    let productName: String
    let inWishlist: Bool
    let activeIndex: Int
    let onActiveIndexChange: (Int) -> Void
    let onShare: () -> Void
    let onWishlistToggle: () -> Void
    let onHeroPositioned: (CGPoint, CGSize) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(hex: 0xE5E7EB))
                    .background(Color(hex: 0xF9FAFB))
                    .overlay {
                        GeometryReader { geo in
                            let frame = geo.frame(in: .global)
                            Color.clear.onAppear {
                                onHeroPositioned(
                                    CGPoint(x: frame.midX, y: frame.midY),
                                    frame.size
                                )
                            }
                            .onChange(of: frame) { _, newFrame in
                                onHeroPositioned(
                                    CGPoint(x: newFrame.midX, y: newFrame.midY),
                                    newFrame.size
                                )
                            }
                        }
                        if images.isEmpty {
                            Text("No image available")
                                .foregroundStyle(Color(hex: 0x9CA3AF))
                        } else {
                            AsyncImage(url: URL(string: images[safe: activeIndex] ?? images[0])) { phase in
                                if let image = phase.image {
                                    image.resizable().scaledToFit()
                                } else {
                                    ProgressView()
                                }
                            }
                            .padding(12)
                        }
                    }
                    .aspectRatio(1, contentMode: .fit)

                HStack {
                    Button(action: onWishlistToggle) {
                        Image(systemName: inWishlist ? "heart.fill" : "heart")
                            .foregroundStyle(inWishlist ? Color(hex: 0xEF4444) : Color(hex: 0x6B7280))
                            .padding(8)
                            .background(Color.white.opacity(0.92))
                            .clipShape(Circle())
                    }
                    Spacer()
                    Button(action: onShare) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(Color(hex: 0x0B2A66))
                            .padding(8)
                            .background(Color.white.opacity(0.92))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xE5E7EB)))
                    }
                }
                .padding(8)
            }

            if images.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(images.prefix(6).enumerated()), id: \.offset) { index, url in
                            AsyncImage(url: URL(string: url)) { phase in
                                if let image = phase.image {
                                    image.resizable().scaledToFill()
                                } else {
                                    Color(hex: 0xF3F4F6)
                                }
                            }
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(index == activeIndex ? Color.black : Color(hex: 0xE5E7EB), lineWidth: index == activeIndex ? 2 : 1)
                            )
                            .onTapGesture { onActiveIndexChange(index) }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct ProductOfferSectionView: View {
    let offer: OfferRuleRow

    var body: some View {
        VStack(spacing: 0) {
            Text("OFFER SECTION")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(Color(hex: 0x2F16C7))
            Text(ProductDetailHelpers.formatOfferSummary(offer: offer))
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
        }
        .overlay(RoundedRectangle(cornerRadius: 2).stroke(Color(hex: 0x2F16C7)))
        .padding(.horizontal, 16)
    }
}

struct ProductColorSizeSectionView: View {
    let colors: [String]
    let sizes: [String]
    let selectedColor: String?
    let selectedSize: String?
    let colorHexMap: [String: Color]
    let onColorSelected: (String) -> Void
    let onSizeSelected: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !colors.isEmpty {
                HStack(spacing: 8) {
                    Text("Colour: \(selectedColor ?? colors.first ?? "")")
                        .font(.system(size: 11))
                        .frame(width: 120, alignment: .leading)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(colors, id: \.self) { color in
                                let selected = selectedColor == color || (selectedColor == nil && colors.first == color)
                                Circle()
                                    .fill(colorHexMap[color.lowercased()] ?? ProductDetailHelpers.resolveColorHex(colorName: color))
                                    .frame(width: 24, height: 24)
                                    .overlay(Circle().stroke(selected ? Color.black : Color(hex: 0x9CA3AF), lineWidth: selected ? 2 : 1))
                                    .onTapGesture { onColorSelected(color) }
                            }
                        }
                    }
                }
            }
            if !sizes.isEmpty {
                HStack(spacing: 6) {
                    Text("Size:").font(.system(size: 11))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(sizes, id: \.self) { size in
                                let selected = selectedSize == size
                                Text(size)
                                    .font(.system(size: 12))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(selected ? Color(hex: 0xFFE59C) : Color.white)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 2)
                                            .stroke(selected ? Color(hex: 0x333333) : Color(hex: 0xD1D5DB))
                                    )
                                    .onTapGesture { onSizeSelected(size) }
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct ProductCtaRowView: View {
    let adding: Bool
    let inStock: Bool
    let canPurchase: Bool
    let onAddToCart: () -> Void
    let onBuyNow: () -> Void
    let onShare: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            ctaButton(title: adding ? "Adding..." : "Add To Cart", icon: "cart", color: Color(hex: 0x374151), action: onAddToCart, enabled: canPurchase && inStock && !adding)
            ctaButton(title: "Buy Now", icon: "creditcard", color: Color(hex: 0x2F6FE4), action: onBuyNow, enabled: canPurchase && inStock && !adding)
            ctaButton(title: "Share", icon: "square.and.arrow.up", color: Color(hex: 0x0B2A66), action: onShare, enabled: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func ctaButton(title: String, icon: String, color: Color, action: @escaping () -> Void, enabled: Bool) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if adding && title.contains("Adding") {
                    ProgressView().scaleEffect(0.7).tint(.white)
                } else {
                    Image(systemName: icon).font(.system(size: 12))
                }
                Text(title).font(.system(size: 10, weight: .semibold)).lineLimit(1)
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 36)
            .background(color.opacity(enabled ? 1 : 0.4))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .disabled(!enabled && title != "Share")
    }
}

struct DeliveryEstimateCardView: View {
    let state: DeliveryEstimateState
    let detectedLocationLabel: String
    let onSelectAddress: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: state.addressType == "work" ? "briefcase.fill" : "house.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0x6B7280))
                if let label = state.addressLabel, !label.isEmpty {
                    Text(label).font(.system(size: 11)).lineLimit(1)
                } else if !detectedLocationLabel.isEmpty && detectedLocationLabel != BuyerStrings.locationDetectHint {
                    Text(detectedLocationLabel).font(.system(size: 11)).lineLimit(1)
                } else {
                    Text(BuyerStrings.pdpSelectDeliveryLocation).font(.system(size: 11)).foregroundStyle(Color(hex: 0x666666))
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(hex: 0xEEF3FA))
            .onTapGesture(perform: onSelectAddress)

            HStack(spacing: 6) {
                Image(systemName: "shippingbox")
                    .font(.system(size: 12))
                    .foregroundStyle(Color(hex: 0x6B7280))
                Text(deliveryMessage)
                    .font(.system(size: 11))
                    .foregroundStyle(state.notServiceable ? Color(hex: 0xDC2626) : Color(hex: 0x111111))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .overlay(RoundedRectangle(cornerRadius: 2).stroke(Color(hex: 0xD1D5DB)))
        .padding(.horizontal, 16)
    }

    private var deliveryMessage: String {
        if state.loading { return BuyerStrings.pdpCheckingDelivery }
        if state.notServiceable { return BuyerStrings.pdpDeliveryNotAvailable }
        if let date = state.deliveryDateText, !date.isEmpty { return BuyerStrings.pdpDeliveryBy(date) }
        return state.fallbackMessage ?? BuyerStrings.pdpDeliveryAtCheckout
    }
}

struct AddressPickerSheetView: View {
    let addresses: [UserAddressRow]
    let selectedId: String?
    let onDismiss: () -> Void
    let onSelect: (UserAddressRow) -> Void
    let onAddNew: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(BuyerStrings.pdpSelectDeliveryAddress)
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Button(action: onDismiss) { Image(systemName: "xmark") }
            }
            .padding(20)

            HStack {
                Text(BuyerStrings.pdpSavedAddresses).font(.system(size: 15, weight: .semibold))
                Spacer()
                Text(BuyerStrings.addAddress)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1F67FF))
                    .onTapGesture(perform: onAddNew)
            }
            .padding(.horizontal, 20)

            if addresses.isEmpty {
                Text(BuyerStrings.noAddresses)
                    .foregroundStyle(Color(hex: 0x6B7280))
                    .padding(20)
            } else {
                ForEach(addresses, id: \.id) { address in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(address.fullName).font(.system(size: 14, weight: .semibold))
                        Text("\(address.streetAddress1)\(address.streetAddress2.map { ", \($0)" } ?? ""), \(address.city), \(address.state), \(address.postalCode)")
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: 0x636A73))
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(address.id == selectedId ? Color(hex: 0xEFF6FF) : Color.clear)
                    .onTapGesture { onSelect(address) }
                    Divider()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct ProductDetailTabsView: View {
    let activeTab: ProductDetailTab
    let onTabSelected: (ProductDetailTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.details, label: "Product Details", color: BuyerColors.tabDetails)
            divider
            tabButton(.specifications, label: "Specifications", color: BuyerColors.tabSpecs)
            divider
            tabButton(.reviews, label: "Reviews", color: BuyerColors.tabReviews)
        }
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0x6B7280)))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .padding(.horizontal, 16)
    }

    private var divider: some View {
        Rectangle().fill(Color(hex: 0x6B7280)).frame(width: 1, height: 38)
    }

    private func tabButton(_ tab: ProductDetailTab, label: String, color: Color) -> some View {
        let selected = activeTab == tab
        return Text(label)
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(selected ? Color.white : Color(hex: 0x6B7280))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .frame(height: 38)
            .background(selected ? color : Color(hex: 0xE5E7EB))
            .onTapGesture { onTabSelected(tab) }
    }
}

struct ProductBenefitsStripView: View {
    var body: some View {
        VStack(spacing: 8) {
            benefitRow(icon: "shippingbox", title: "Free Shipping", subtitle: "Free shipping for order above $100")
            benefitRow(icon: "creditcard", title: "Flexible Payment", subtitle: "Multiple secure payment options")
            benefitRow(icon: "lock.shield", title: "24x7 Support", subtitle: "We support online all days")
        }
        .padding(12)
        .background(Color(hex: 0xF7F8F8))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xD1D5DB)))
        .padding(.horizontal, 16)
    }

    private func benefitRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x7B5A00))
                .frame(width: 28, height: 28)
                .background(Color.white)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color(hex: 0xD1D5DB)))
            VStack(alignment: .leading) {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text(subtitle).font(.system(size: 10)).foregroundStyle(Color(hex: 0x666666))
            }
            Spacer()
        }
    }
}

struct CollapsibleSectionView<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color(hex: 0xF0F2F2))
            content()
                .padding(12)
        }
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xD1D5DB)))
        .padding(.horizontal, 16)
    }
}

struct SpecTableView: View {
    let rows: [(String, String)]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Divider().background(Color(hex: 0xF3F4F6)) }
                HStack(alignment: .top) {
                    Text(row.0)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x37475A))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.1)
                        .font(.system(size: 12))
                        .foregroundStyle(Color(hex: 0x0F1111))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 8)
            }
        }
    }
}

struct StarRatingRowView: View {
    let rating: Double
    var starSize: CGFloat = 14

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<5, id: \.self) { idx in
                Image(systemName: "star.fill")
                    .font(.system(size: starSize))
                    .foregroundStyle(idx < Int(rating.rounded()) ? BuyerColors.starFilled : BuyerColors.starEmpty)
            }
        }
    }
}

struct ProductReviewsSectionView: View {
    let reviews: [ProductReview]
    let averageRating: Double
    let onWriteReview: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Customer reviews")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(BuyerColors.textPrimary)
            HStack(spacing: 8) {
                StarRatingRowView(rating: averageRating, starSize: 16)
                Text(String(format: "%.1f out of 5", averageRating))
                    .font(.system(size: 15))
                    .foregroundStyle(BuyerColors.textPrimary)
            }
            Text("\(reviews.count) global ratings")
                .font(.system(size: 13))
                .foregroundStyle(BuyerColors.textSecondary)
                .padding(.bottom, 12)

            ForEach([5, 4, 3, 2, 1], id: \.self) { starValue in
                let count = reviews.filter { Int($0.rating.rounded()) == starValue }.count
                let percentage = reviews.isEmpty ? 0 : count * 100 / reviews.count
                HStack(spacing: 8) {
                    Text("\(starValue) star")
                        .font(.system(size: 13))
                        .foregroundStyle(BuyerColors.breakdownLink)
                        .frame(width: 54, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .stroke(BuyerColors.borderGray)
                                .background(Color.white)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(BuyerColors.progressOrange)
                                .frame(width: geo.size.width * CGFloat(percentage) / 100)
                        }
                    }
                    .frame(height: 20)
                    Text("\(percentage)%")
                        .font(.system(size: 13))
                        .foregroundStyle(BuyerColors.breakdownLink)
                        .frame(width: 40, alignment: .trailing)
                }
            }

            Divider().padding(.vertical, 12)

            Text("Review this product").font(.system(size: 16, weight: .bold))
            Text("Share your thoughts with other customers")
                .font(.system(size: 13))
                .foregroundStyle(BuyerColors.textSecondary)
            Text("Write a product review")
                .font(.system(size: 13))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .overlay(Capsule().stroke(Color(hex: 0x888C8C)))
                .onTapGesture(perform: onWriteReview)
                .padding(.vertical, 8)

            if reviews.isEmpty {
                Text(BuyerStrings.pdpNoReviewsFirst)
                    .font(.system(size: 14))
                    .foregroundStyle(BuyerColors.textSecondary)
            } else {
                ForEach(reviews.prefix(4), id: \.id) { review in
                    reviewCard(review)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func reviewCard(_ review: ProductReview) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Color(hex: 0xF3F4F6))
                    .frame(width: 28, height: 28)
                    .overlay(Text(String(review.reviewerName.prefix(1)).uppercased()).font(.system(size: 12, weight: .semibold)))
                Text(review.reviewerName).font(.system(size: 13))
            }
            HStack(spacing: 6) {
                StarRatingRowView(rating: Double(review.rating))
                Text(review.heading.isEmpty ? "Verified Purchase" : review.heading)
                    .font(.system(size: 14, weight: .bold))
                    .lineLimit(1)
            }
            Text("Reviewed on \(review.date)")
                .font(.system(size: 12))
                .foregroundStyle(BuyerColors.textSecondary)
            if !review.text.isEmpty {
                Text(review.text).font(.system(size: 14)).foregroundStyle(BuyerColors.textPrimary)
            }
            if let imageUrl = review.images.first {
                AsyncImage(url: URL(string: imageUrl)) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color(hex: 0xF3F4F6)
                    }
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            }
            Divider()
        }
        .padding(.bottom, 8)
    }
}

struct SimilarProductsGridView: View {
    let products: [ProductRow]
    let publicPrices: [String: ResolvedPublicPrice]
    let variantIds: Set<String>
    let onProductClick: (String) -> Void

    var body: some View {
        if products.isEmpty { EmptyView() }
        else {
            VStack(alignment: .leading, spacing: 10) {
                Text(BuyerStrings.pdpSimilarProducts)
                    .font(.system(size: 16, weight: .bold))
                    .padding(.vertical, 8)
                ForEach(Array(stride(from: 0, to: products.count, by: 2)), id: \.self) { index in
                    HStack(spacing: 10) {
                        productCard(products[index])
                        if index + 1 < products.count {
                            productCard(products[index + 1])
                        } else {
                            Spacer().frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func productCard(_ product: ProductRow) -> some View {
        HomeProductCard(
            product: product,
            publicPrice: publicPrices[product.id],
            inWishlist: false,
            inCart: false,
            hasVariants: variantIds.contains(product.id),
            onProductClick: { onProductClick(product.slug ?? product.id) },
            onQuickView: { onProductClick(product.slug ?? product.id) },
            onWishlistToggle: {},
            onAddToCart: { _, _ in onProductClick(product.slug ?? product.id) }
        )
        .frame(maxWidth: .infinity)
    }
}

struct ProductRatingRowView: View {
    let rating: Double
    let reviewCount: Int

    var body: some View {
        if rating <= 0 && reviewCount <= 0 { EmptyView() }
        else {
            HStack(spacing: 6) {
                if rating > 0 {
                    Text(String(format: "%.1f", rating))
                        .font(.system(size: 12, weight: .semibold))
                    StarRatingRowView(rating: rating, starSize: 11)
                }
                Text("\(reviewCount) REVIEWS")
                    .font(.system(size: 11))
                    .foregroundStyle(BuyerColors.linkBlue)
            }
        }
    }
}

struct ProductPriceBlockView: View {
    let publicPrice: ResolvedPublicPrice?
    let loading: Bool
    let currency: String?

    var body: some View {
        if loading {
            BuyerPriceBlockSkeleton()
        } else if publicPrice == nil {
            Text(BuyerStrings.pdpPriceUnavailable)
                .font(.system(size: 13))
                .foregroundStyle(BuyerColors.textSecondary)
        } else {
            let price = publicPrice!.displayUnitPrice
            let mrp = (publicPrice!.displayMrp > 0 ? publicPrice!.displayMrp : publicPrice!.markupMrp)
            let priceCurrency = publicPrice!.displayCurrency
            let discountPct = mrp > price && mrp > 0 ? Int((1 - price / mrp) * 100) : 0
            VStack(alignment: .leading, spacing: 6) {
                if mrp > price {
                    HStack(spacing: 8) {
                        Text("MRP:").font(.system(size: 12)).foregroundStyle(Color(hex: 0x565959))
                        Text(formatCurrency(amount: mrp, currency: priceCurrency))
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: 0x565959))
                            .strikethrough()
                        if discountPct > 0 {
                            Text("(\(discountPct)% OFF)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color(hex: 0xCC0C39))
                        }
                    }
                }
                HStack(alignment: .bottom, spacing: 8) {
                    Text(formatCurrency(amount: price, currency: priceCurrency))
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x111827))
                    Text("Selling Price")
                        .font(.system(size: 12))
                        .foregroundStyle(Color(hex: 0x565959))
                        .padding(.bottom, 6)
                }
                Text(BuyerStrings.pdpInclusiveTaxes)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: 0x666666))
            }
        }
    }
}

struct ConditionBadgeView: View {
    let condition: String?

    var body: some View {
        let isBrandNew = condition?.isEmpty != false || condition == "brand_new"
        Text(ProductDetailHelpers.conditionLabel(condition).uppercased())
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(isBrandNew ? Color.white : Color(hex: 0x92400E))
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(isBrandNew ? Color(hex: 0xE11D24) : Color(hex: 0xFFFBEB))
            .overlay(Capsule().stroke(isBrandNew ? Color(hex: 0xE11D24) : Color(hex: 0xFCD34D)))
            .clipShape(Capsule())
    }
}

enum ProductDetailUiHelpers {
    static func specificationRows(specs: [String: JSONValue]?) -> [(String, String)] {
        guard let specs else { return [] }
        return specs.compactMap { key, value in
            let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
            let v = value.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !k.isEmpty, !v.isEmpty else { return nil }
            return (k, v)
        }
    }

    static func detailPoints(description: String?) -> [String] {
        let text = description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty else { return [] }
        let points = text
            .components(separatedBy: CharacterSet.newlines.union(CharacterSet(charactersIn: "•")))
            .map { $0.replacingOccurrences(of: "^[-*\\s]+", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return points.count > 1 ? points : [text]
    }
}

private extension JSONValue {
    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
