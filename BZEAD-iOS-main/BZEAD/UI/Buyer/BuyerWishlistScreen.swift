import SwiftUI

private let amber = Color(hex: 0xD97706)
private let amberBtn = Color(hex: 0xF59E0B)

struct BuyerWishlistScreen: View {
    let session: BuyerSession
    let destinationCountry: String
    let onBack: () -> Void
    let onProductClick: (String) -> Void
    let onContinueShopping: () -> Void

    @State private var loading = true
    @State private var priceLoading = false
    @State private var products: [ProductRow] = []
    @State private var publicPrices: [String: ResolvedPublicPrice] = [:]
    @State private var removingId: String?
    @State private var confirmRemoveId: String?
    @State private var toastMessage: String?

    private let wishlistRepo = WishlistRepository()
    private let pricingRepo = ProductPricingRepository()

    var body: some View {
        VStack(spacing: 0) {
            BuyerSubTopBar(title: BuyerStrings.wishlistTitle, onBack: onBack)

            ZStack {
                Group {
                    if loading {
                        BuyerProductGridSkeleton(count: 4)
                            .padding(16)
                    } else if products.isEmpty {
                        wishlistEmptyState
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                headerStats
                                ForEach(products, id: \.id) { product in
                                    let publicPrice = publicPrices[product.id]
                                    let unitPrice = publicPrice?.displayUnitPrice ?? publicPrice?.publicUnitPrice ?? product.price
                                    let mrp = publicPrice?.displayMrp.flatMap { $0 > 0 ? $0 : nil }
                                        ?? publicPrice?.markupMrp.flatMap { $0 > 0 ? $0 : nil }
                                        ?? product.mrp
                                    WishlistItemCard(
                                        product: product,
                                        unitPrice: unitPrice,
                                        mrp: mrp,
                                        displayCurrency: publicPrice?.displayCurrency ?? product.currency,
                                        priceLoading: priceLoading,
                                        removing: removingId == product.id,
                                        onProductClick: { onProductClick(product.id) },
                                        onRemove: { confirmRemoveId = product.id },
                                        onViewAdd: { onProductClick(product.id) }
                                    )
                                }
                            }
                            .padding(16)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.white)

                if let toastMessage {
                    VStack {
                        Spacer()
                        Text(toastMessage)
                            .font(.system(size: 14))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.black.opacity(0.85))
                            .clipShape(Capsule())
                            .padding(.bottom, 24)
                    }
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            self.toastMessage = nil
                        }
                    }
                }
            }
        }
        .task(id: session.userId) { await refresh() }
        .task(id: "\(products.count)|\(destinationCountry)") { await refreshPrices() }
        .alert(BuyerStrings.wishlistRemoveTitle, isPresented: removeAlertBinding) {
            Button(BuyerStrings.cancel, role: .cancel) { confirmRemoveId = nil }
            Button(BuyerStrings.wishlistRemoveConfirm, role: .destructive) {
                Task { await removeConfirmed() }
            }
        } message: {
            Text(BuyerStrings.wishlistRemoveMessage)
        }
    }

    private var removeAlertBinding: Binding<Bool> {
        Binding(get: { confirmRemoveId != nil }, set: { if !$0 { confirmRemoveId = nil } })
    }

    private var displayCurrency: String {
        products.compactMap { publicPrices[$0.id]?.displayCurrency }.first
            ?? products.first?.currency
            ?? "INR"
    }

    private var totalValue: Double {
        products.reduce(0) { partial, product in
            let unit = publicPrices[product.id]?.displayUnitPrice
                ?? publicPrices[product.id]?.publicUnitPrice
                ?? product.price
            return partial + unit
        }
    }

    private var totalSavings: Double {
        products.reduce(0) { partial, product in
            let unit = publicPrices[product.id]?.displayUnitPrice
                ?? publicPrices[product.id]?.publicUnitPrice
                ?? product.price
            let mrp = publicPrices[product.id]?.displayMrp.flatMap { $0 > 0 ? $0 : nil }
                ?? publicPrices[product.id]?.markupMrp.flatMap { $0 > 0 ? $0 : nil }
                ?? product.mrp ?? 0
            return partial + (mrp > unit ? mrp - unit : 0)
        }
    }

    private var headerStats: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(BuyerStrings.wishlistTitle)
                .font(.system(size: 22, weight: .bold))
            Text(BuyerStrings.wishlistItemsSaved(products.count))
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
            HStack(spacing: 10) {
                WishlistStatCard(
                    label: BuyerStrings.wishlistTotalValue,
                    value: formatCurrency(amount: totalValue, currency: displayCurrency)
                )
                WishlistStatCard(
                    label: BuyerStrings.wishlistTotalSavings,
                    value: formatCurrency(amount: totalSavings, currency: displayCurrency),
                    valueColor: Color(hex: 0x4ADE80)
                )
                WishlistStatCard(label: BuyerStrings.wishlistItems, value: "\(products.count)")
            }
        }
    }

    private var wishlistEmptyState: some View {
        VStack(spacing: 0) {
            Spacer()
            Circle()
                .fill(Color(hex: 0xF3F4F6))
                .frame(width: 72, height: 72)
                .overlay {
                    Image(systemName: "heart")
                        .font(.system(size: 32))
                        .foregroundStyle(Color(hex: 0x9CA3AF))
                }
            Text(BuyerStrings.wishlistEmptyTitle)
                .font(.system(size: 20, weight: .bold))
                .padding(.top, 16)
            Text(BuyerStrings.wishlistEmptyHint)
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0x6B7280))
                .multilineTextAlignment(.center)
                .padding(.top, 8)
                .padding(.bottom, 20)
            Button(action: onContinueShopping) {
                Text(BuyerStrings.wishlistContinueShopping)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(amberBtn)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    private func refresh() async {
        loading = true
        products = await wishlistRepo.fetchWishlist(session: session)
        loading = false
    }

    private func refreshPrices() async {
        guard !products.isEmpty else {
            publicPrices = [:]
            priceLoading = false
            return
        }
        priceLoading = true
        publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: products.map(\.id),
            countryCandidates: [destinationCountry],
            productCurrencies: Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.currency ?? "INR") })
        )
        priceLoading = false
    }

    private func removeConfirmed() async {
        guard let productId = confirmRemoveId else { return }
        removingId = productId
        confirmRemoveId = nil
        let result = await wishlistRepo.remove(session: session, productId: productId)
        removingId = nil
        switch result {
        case .success:
            await refresh()
        case .failure:
            toastMessage = BuyerStrings.actionFailed
        }
    }
}

private struct WishlistStatCard: View {
    let label: String
    let value: String
    var valueColor: Color = Color(hex: 0x111827)

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Color(hex: 0x6B7280))
            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(valueColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(hex: 0xF9FAFB))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct WishlistItemCard: View {
    let product: ProductRow
    let unitPrice: Double
    let mrp: Double?
    let displayCurrency: String?
    let priceLoading: Bool
    let removing: Bool
    let onProductClick: () -> Void
    let onRemove: () -> Void
    let onViewAdd: () -> Void

    private var hasDiscount: Bool {
        guard let mrp else { return false }
        return mrp > unitPrice
    }

    private var stockLabel: String {
        let stock = product.stock ?? 0
        if stock > 10 { return BuyerStrings.wishlistInStock }
        if stock > 0 { return BuyerStrings.wishlistLowStock }
        return BuyerStrings.wishlistOutOfStock
    }

    private var stockColor: Color {
        let stock = product.stock ?? 0
        if stock > 10 { return Color(hex: 0x4ADE80) }
        if stock > 0 { return amber }
        return Color(hex: 0xF87171)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: URL(string: product.imageUrl ?? "")) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Color(hex: 0xE5E7EB)
                }
            }
            .frame(width: 96, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(Rectangle())
            .onTapGesture(perform: onProductClick)

            VStack(alignment: .leading, spacing: 0) {
                Text(product.name)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(2)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onProductClick)

                if priceLoading {
                    BuyerInlineSkeleton(width: 80, height: 18)
                        .padding(.top, 8)
                } else {
                    HStack(alignment: .bottom, spacing: 8) {
                        Text(formatCurrency(amount: unitPrice, currency: displayCurrency))
                            .font(.system(size: 16, weight: .bold))
                        if hasDiscount, let mrp {
                            Text(formatCurrency(amount: mrp, currency: displayCurrency))
                                .font(.system(size: 13))
                                .foregroundStyle(Color(hex: 0x9CA3AF))
                                .strikethrough()
                        }
                    }
                    .padding(.top, 6)
                }

                Text(stockLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(stockColor)
                    .padding(.top, 4)

                HStack(spacing: 8) {
                    Button(action: onViewAdd) {
                        Text(BuyerStrings.wishlistViewAdd)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(amberBtn)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    Button(action: onRemove) {
                        Text(BuyerStrings.wishlistRemove)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xDC2626))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xE5E7EB), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(removing)
                }
                .padding(.top, 10)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: 0xF9FAFB))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
