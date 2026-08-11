import SwiftUI

struct HomeProductCard: View {
    let product: ProductRow
    let publicPrice: ResolvedPublicPrice?
    let inWishlist: Bool
    let inCart: Bool
    let hasVariants: Bool
    let onProductClick: () -> Void
    let onQuickView: () -> Void
    let onWishlistToggle: () -> Void
    let onAddToCart: (CGPoint, CGSize) -> Void

    @State private var imageCenter: CGPoint = .zero
    @State private var imageSize: CGSize = .zero

    private var displayPrice: Double {
        publicPrice?.displayUnitPrice ?? publicPrice?.publicUnitPrice ?? product.price
    }

    private var displayCurrency: String? {
        publicPrice?.displayCurrency ?? product.currency
    }

    private var markupMrp: Double {
        if let mrp = publicPrice?.displayMrp, mrp > 0 { return mrp }
        if let mrp = publicPrice?.markupMrp, mrp > 0 { return mrp }
        return 0
    }

    private var hasDiscount: Bool {
        markupMrp > displayPrice && markupMrp > 0
    }

    private var discountPct: Int {
        guard hasDiscount, markupMrp > 0 else { return 0 }
        return Int((1 - displayPrice / markupMrp) * 100)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                AsyncImage(url: URL(string: product.imageUrl ?? "")) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color(hex: 0xF3F4F6)
                    }
                }
                .aspectRatio(1, contentMode: .fill)
                .clipped()
                .background(
                    GeometryReader { geo in
                        Color.clear
                            .onAppear { updateImageFrame(geo) }
                            .onChange(of: geo.frame(in: .global)) { _, _ in updateImageFrame(geo) }
                    }
                )

                VStack(alignment: .leading, spacing: 4) {
                    if product.itemCondition == "brand_new" || (product.itemCondition ?? "").isEmpty {
                        ProductBadgeChip(text: "Brand New", background: Color(hex: 0x374151))
                    }
                    if hasDiscount, discountPct > 0 {
                        ProductBadgeChip(text: "\(discountPct)% OFF", background: Color(hex: 0xDC2626))
                    }
                }
                .padding(8)

                VStack(spacing: 6) {
                    ProductCircleIconButton(action: onWishlistToggle) {
                        Image(systemName: inWishlist ? "heart.fill" : "heart")
                            .font(.system(size: 14))
                            .foregroundStyle(inWishlist ? Color(hex: 0xEF4444) : Color(hex: 0x6B7280))
                    }
                    ProductCircleIconButton(action: onQuickView) {
                        Image(systemName: "eye")
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: 0x374151))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(8)
            }

            VStack(alignment: .leading, spacing: 0) {
                if let brand = product.brand?.trimmingCharacters(in: .whitespacesAndNewlines), !brand.isEmpty {
                    Text(brand.uppercased())
                        .font(.system(size: 10))
                        .foregroundStyle(Color(hex: 0x9CA3AF))
                        .lineLimit(1)
                }
                Text(product.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.black)
                    .lineLimit(2)
                    .frame(minHeight: 28, alignment: .topLeading)
                    .padding(.top, 2)

                HStack(alignment: .bottom) {
                    if hasDiscount {
                        Text(formatCurrency(amount: markupMrp, currency: displayCurrency))
                            .font(.system(size: 10))
                            .foregroundStyle(Color(hex: 0x9CA3AF))
                            .strikethrough()
                    }
                    Spacer(minLength: 4)
                    Text(formatCurrency(amount: displayPrice, currency: displayCurrency))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color.black)
                }
                .padding(.top, 4)

                let buttonColor = inCart ? Color(hex: 0xDCFCE7) : Color(hex: 0x2563EB)
                let textColor = inCart ? Color(hex: 0x15803D) : Color.white
                Button {
                    if hasVariants {
                        onProductClick()
                    } else {
                        onAddToCart(imageCenter, imageSize)
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: inCart ? "checkmark.circle.fill" : "cart")
                            .font(.system(size: 12))
                        Text(inCart ? BuyerStrings.alreadyInCart : BuyerStrings.addToCart)
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(textColor)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(buttonColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(inCart)
                .padding(.top, 6)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(hex: 0xF3F4F6), lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onTapGesture(perform: onProductClick)
    }

    private func updateImageFrame(_ geo: GeometryProxy) {
        let frame = geo.frame(in: .global)
        imageCenter = CGPoint(x: frame.midX, y: frame.midY)
        imageSize = frame.size
    }
}

private struct ProductBadgeChip: View {
    let text: String
    let background: Color

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

private struct ProductCircleIconButton<Content: View>: View {
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button(action: action) {
            content()
                .frame(width: 32, height: 32)
                .background(Color.white.opacity(0.9))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}
