import SwiftUI

struct BuyerCartScreen: View {
    let session: BuyerSession
    let destinationCountry: String
    let displayCurrencyCode: String
    let onCheckout: () -> Void
    let onProductClick: (String) -> Void
    let onContinueShopping: () -> Void

    @State private var loading = true
    @State private var items: [CartLineItem] = []
    @State private var publicPrices: [String: ResolvedPublicPrice] = [:]
    @State private var pricesLoading = false
    @State private var selectedIds: Set<String> = []
    @State private var updatingId: String?
    @State private var confirmRemoveId: String?
    @State private var showPricingFailed = false
    @State private var toastMessage: String?

    private let cartRepo = CartRepository()
    private let pricingRepo = ProductPricingRepository()
    private let wishlistRepo = WishlistRepository()
    private let countryRepository = DestinationCountryRepository()
    private let locationRepository = LocationRepository()

    var body: some View {
        ZStack {
            Group {
                if loading {
                    BuyerListSkeleton(rows: 4, withThumb: true)
                        .padding(16)
                } else if items.isEmpty {
                    cartEmptyState
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            cartItemsCard
                            cartSummaryCard
                        }
                        .padding(.horizontal, 12)
                        .padding(.top, 12)
                        .padding(.bottom, 96)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BuyerColors.cartPageBg)

            toastOverlay
        }
        .task(id: session.userId) { await refresh() }
        .task(id: pricingTaskKey) { await refreshPricesIfNeeded() }
        .onChange(of: items) { _, newItems in syncSelection(with: newItems) }
        .onChange(of: pricingFailed) { _, failed in showPricingFailed = failed }
        .alert(BuyerStrings.cartPricingFailedTitle, isPresented: $showPricingFailed) {
            Button(BuyerStrings.cartPricingRefresh) {
                Task { await manualRefreshPrices() }
            }
            Button(BuyerStrings.cancel, role: .cancel) {
                onContinueShopping()
            }
        } message: {
            Text(BuyerStrings.cartPricingFailedMessage)
        }
        .alert(BuyerStrings.cartRemoveTitle, isPresented: removeAlertBinding) {
            Button(BuyerStrings.cancel, role: .cancel) {
                confirmRemoveId = nil
            }
            Button(BuyerStrings.cartRemoveConfirm, role: .destructive) {
                Task { await confirmRemove() }
            }
        } message: {
            Text(BuyerStrings.cartRemoveMessage)
        }
    }

    private var pricingTaskKey: String {
        "\(items.count)|\(destinationCountry)|\(displayCurrencyCode)"
    }

    private var selectedItems: [CartLineItem] {
        items.filter { selectedIds.contains($0.cartItemId) }
    }

    private var isAllSelected: Bool {
        !items.isEmpty && selectedIds.count == items.count
    }

    private var currency: String {
        selectedItems.compactMap { publicPrices[$0.product.id]?.displayCurrency }.first
            ?? selectedItems.first?.product.currency
            ?? items.first?.product.currency
            ?? "INR"
    }

    private var displaySubtotal: Double {
        selectedItems.reduce(0) { partial, item in
            partial + (resolveDisplayUnitPrice(item) ?? 0) * Double(item.quantity)
        }
    }

    private var canCheckout: Bool {
        !selectedItems.isEmpty && selectedItems.allSatisfy { resolveSourceUnitPrice($0) != nil }
    }

    private var pricingFailed: Bool {
        !loading && !pricesLoading && !items.isEmpty &&
            items.allSatisfy { resolveSourceUnitPrice($0) == nil } &&
            !destinationCountry.isEmpty
    }

    private var removeAlertBinding: Binding<Bool> {
        Binding(
            get: { confirmRemoveId != nil },
            set: { if !$0 { confirmRemoveId = nil } }
        )
    }

    private var cartEmptyState: some View {
        VStack {
            VStack(spacing: 0) {
                Image(systemName: "cart")
                    .font(.system(size: 48))
                    .foregroundStyle(Color(hex: 0x888888))
                    .padding(.bottom, 16)
                Text(BuyerStrings.cartEmptyTitle)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(BuyerColors.textPrimary)
                Text(BuyerStrings.cartEmptySubtitle)
                    .font(.system(size: 14))
                    .foregroundStyle(Color(hex: 0x555555))
                    .padding(.top, 8)
                CartYellowButton(text: BuyerStrings.cartContinueShopping, enabled: true, action: onContinueShopping)
                    .padding(.top, 24)
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 48)
            .frame(maxWidth: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder, lineWidth: 1))
            .padding(12)
        }
    }

    private var cartItemsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.cartShoppingCart)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(BuyerColors.textPrimary)
            Text(BuyerStrings.cartItemsCount(items.count))
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x888888))
                .padding(.top, 2)
                .padding(.bottom, 12)

            HStack {
                Button {
                    selectedIds = isAllSelected ? [] : Set(items.map(\.cartItemId))
                } label: {
                    HStack(spacing: 8) {
                        ToggleCheckbox(checked: isAllSelected)
                        Text(BuyerStrings.cartSelectAll)
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: 0x555555))
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                Button {
                    selectedIds = isAllSelected ? [] : Set(items.map(\.cartItemId))
                } label: {
                    Text(isAllSelected ? BuyerStrings.cartDeselectAll : BuyerStrings.cartSelectedCount(selectedIds.count))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BuyerColors.cartLink)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 12)

            Divider().background(Color(hex: 0xEEEEEE))

            ForEach(items, id: \.cartItemId) { item in
                CartItemRow(
                    item: item,
                    selected: selectedIds.contains(item.cartItemId),
                    unitPrice: resolveDisplayUnitPrice(item),
                    priceLoading: resolveSourceUnitPrice(item) == nil && pricesLoading,
                    isUpdating: updatingId == item.cartItemId,
                    onToggleSelect: {
                        if selectedIds.contains(item.cartItemId) {
                            selectedIds.remove(item.cartItemId)
                        } else {
                            selectedIds.insert(item.cartItemId)
                        }
                    },
                    onQtyChange: { qty in
                        handleQtyChange(item: item, qty: qty)
                    },
                    onDelete: { confirmRemoveId = item.cartItemId },
                    onMoveToWishlist: {
                        Task { await moveToWishlist(item) }
                    },
                    onProductClick: { onProductClick(item.product.id) }
                )
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.06), radius: 2, y: 1)
    }

    private var cartSummaryCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.cartSummary)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(BuyerColors.textPrimary)
                .padding(.bottom, 16)

            summaryRow(
                label: BuyerStrings.cartSubtotalItems(selectedItems.count),
                value: selectedItems.isEmpty ? "—" : formatCurrency(amount: displaySubtotal, currency: currency)
            )
            .padding(.bottom, 8)

            summaryRow(
                label: BuyerStrings.shipping,
                value: BuyerStrings.cartShippingAtCheckout,
                valueColor: BuyerColors.cartShippingGreen
            )

            Divider()
                .frame(height: 2)
                .background(BuyerColors.cartBorder)
                .padding(.vertical, 14)

            HStack {
                Text(BuyerStrings.cartEstimatedTotal)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BuyerColors.cartPrice)
                Spacer()
                Text(selectedItems.isEmpty ? "—" : formatCurrency(amount: displaySubtotal, currency: currency))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BuyerColors.cartPrice)
            }

            CartYellowButton(
                text: canCheckout ? BuyerStrings.cartProceedCheckout : BuyerStrings.cartWaitingPrices,
                enabled: canCheckout,
                action: handleCheckoutTap
            )
            .padding(.top, 16)

            Text(BuyerStrings.cartSecureCheckout)
                .font(.system(size: 12))
                .foregroundStyle(BuyerColors.cartShippingGreen)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.06), radius: 2, y: 1)
    }

    @ViewBuilder
    private var toastOverlay: some View {
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

    private func summaryRow(label: String, value: String, valueColor: Color = BuyerColors.textPrimary) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0x555555))
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(valueColor)
        }
    }

    private func resolveSourceUnitPrice(_ item: CartLineItem) -> Double? {
        item.unitPrice ?? publicPrices[item.product.id]?.publicUnitPrice ?? item.product.price
    }

    private func resolveDisplayUnitPrice(_ item: CartLineItem) -> Double? {
        publicPrices[item.product.id]?.displayUnitPrice ?? resolveSourceUnitPrice(item)
    }

    private func syncSelection(with newItems: [CartLineItem]) {
        let available = Set(newItems.map(\.cartItemId))
        let stillSelected = selectedIds.filter { available.contains($0) }
        selectedIds = stillSelected.isEmpty && !newItems.isEmpty ? available : Set(stillSelected)
    }

    private func refresh() async {
        loading = true
        items = await cartRepo.fetchCart(session: session)
        loading = false
    }

    private func refreshPricesIfNeeded() async {
        guard !items.isEmpty, !destinationCountry.isEmpty else {
            publicPrices = [:]
            return
        }
        pricesLoading = true
        let ids = items.map { $0.product.id }.uniqued()
        let candidates = await countryRepository.resolveCountryCandidates(session: session, locationRepository: locationRepository)
        publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: ids,
            countryCandidates: candidates,
            productCurrencies: Dictionary(uniqueKeysWithValues: items.map { ($0.product.id, $0.product.currency ?? "INR") })
        )
        pricesLoading = false
    }

    private func manualRefreshPrices() async {
        guard !items.isEmpty else { return }
        pricesLoading = true
        let ids = items.map { $0.product.id }.uniqued()
        let candidates = await countryRepository.resolveCountryCandidates(session: session, locationRepository: locationRepository)
        publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: ids,
            countryCandidates: candidates,
            productCurrencies: Dictionary(uniqueKeysWithValues: items.map { ($0.product.id, $0.product.currency ?? "INR") })
        )
        pricesLoading = false
    }

    private func handleQtyChange(item: CartLineItem, qty: Int) {
        if qty < 1 {
            confirmRemoveId = item.cartItemId
            return
        }
        let stock = item.product.stock ?? Int.max
        guard qty <= stock else { return }
        updatingId = item.cartItemId
        Task {
            _ = await cartRepo.updateQuantity(session: session, item: item, quantity: qty)
            updatingId = nil
            await refresh()
        }
    }

    private func moveToWishlist(_ item: CartLineItem) async {
        updatingId = item.cartItemId
        _ = await wishlistRepo.add(session: session, productId: item.product.id)
        _ = await cartRepo.removeItem(session: session, item: item)
        updatingId = nil
        await refresh()
        toastMessage = BuyerStrings.cartMovedWishlist
    }

    private func confirmRemove() async {
        guard let id = confirmRemoveId, let item = items.first(where: { $0.cartItemId == id }) else { return }
        updatingId = id
        _ = await cartRepo.removeItem(session: session, item: item)
        updatingId = nil
        confirmRemoveId = nil
        await refresh()
    }

    private func handleCheckoutTap() {
        guard canCheckout else {
            toastMessage = BuyerStrings.cartSelectItemCheckout
            return
        }
        let outOfStock = selectedItems.filter { ($0.product.stock ?? 0) <= 0 }
        if !outOfStock.isEmpty {
            toastMessage = BuyerStrings.cartOutOfStockCheckout
            return
        }
        onCheckout()
    }
}

private struct CartItemRow: View {
    let item: CartLineItem
    let selected: Bool
    let unitPrice: Double?
    let priceLoading: Bool
    let isUpdating: Bool
    let onToggleSelect: () -> Void
    let onQtyChange: (Int) -> Void
    let onDelete: () -> Void
    let onMoveToWishlist: () -> Void
    let onProductClick: () -> Void

    private var inStock: Bool { (item.product.stock ?? 0) > 0 }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                Button(action: onToggleSelect) {
                    ToggleCheckbox(checked: selected)
                }
                .buttonStyle(.plain)
                .disabled(isUpdating)
                .padding(.top, 2)

                AsyncImage(url: URL(string: item.product.imageUrl ?? "")) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color(hex: 0xF9F9F9)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xEEEEEE), lineWidth: 1))
                .contentShape(Rectangle())
                .onTapGesture(perform: onProductClick)
                .padding(.leading, 8)

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top) {
                        Text(item.product.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(BuyerColors.textPrimary)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: onProductClick)
                        if priceLoading {
                            BuyerInlineSkeleton(width: 72, height: 18)
                        } else if let unitPrice {
                            Text(formatCurrency(amount: unitPrice, currency: item.product.currency))
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(BuyerColors.cartPrice)
                                .lineLimit(1)
                        }
                    }

                    let seller = item.product.brand?.trimmingCharacters(in: .whitespacesAndNewlines).flatMap { $0.isEmpty ? nil : $0 } ?? "BZEAD Seller"
                    Text(BuyerStrings.cartSoldBy(seller))
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: 0x888888))
                        .padding(.top, 2)

                    if item.selectedSize != nil || item.selectedColor != nil {
                        let parts = [
                            item.selectedSize.map { "\(BuyerStrings.size): \($0)" },
                            item.selectedColor.map { "\(BuyerStrings.color): \($0)" },
                        ].compactMap { $0 }
                        Text(parts.joined(separator: " · "))
                            .font(.system(size: 11))
                            .foregroundStyle(Color(hex: 0x888888))
                    }

                    Text(inStock ? BuyerStrings.cartInStock : BuyerStrings.cartOutOfStock)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(inStock ? BuyerColors.cartInStockText : BuyerColors.cartOutOfStockText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(inStock ? BuyerColors.cartInStockBg : BuyerColors.cartOutOfStockBg)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        .padding(.top, 6)

                    HStack {
                        qtyStepper
                        Spacer()
                        if isUpdating {
                            BuyerInlineSkeleton(width: 16, height: 16)
                        }
                        Button(BuyerStrings.cartDelete, action: onDelete)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(BuyerColors.cartLink)
                            .disabled(isUpdating)
                    }
                    .padding(.top, 10)

                    Button(BuyerStrings.cartMoveWishlist, action: onMoveToWishlist)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(BuyerColors.cartLink)
                        .padding(.top, 8)
                        .disabled(isUpdating)
                }
                .padding(.leading, 10)
            }
            .padding(.vertical, 12)

            Divider().background(Color(hex: 0xEEEEEE))
        }
    }

    private var qtyStepper: some View {
        HStack(spacing: 0) {
            Button { onQtyChange(item.quantity - 1) } label: {
                Text("−")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(BuyerColors.textPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color(hex: 0xF0F0F0))
            }
            .disabled(isUpdating)
            Text("\(item.quantity)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(BuyerColors.textPrimary)
                .frame(width: 40, height: 32)
                .background(Color.white)
                .overlay(Rectangle().stroke(BuyerColors.cartBorder, lineWidth: 1))
            Button { onQtyChange(item.quantity + 1) } label: {
                Text("+")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(BuyerColors.textPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color(hex: 0xF0F0F0))
            }
            .disabled(isUpdating)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(BuyerColors.cartBorder, lineWidth: 1))
    }
}

private struct ToggleCheckbox: View {
    let checked: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .stroke(checked ? Color(hex: 0xFF9900) : Color(hex: 0xD1D5DB), lineWidth: checked ? 0 : 1.5)
                .background(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(checked ? Color(hex: 0xFF9900) : Color.clear)
                )
                .frame(width: 20, height: 20)
            if checked {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color.white)
            }
        }
    }
}

private struct CartYellowButton: View {
    let text: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(enabled ? BuyerColors.textPrimary : Color(hex: 0x9CA3AF))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(enabled ? BuyerColors.cartCheckoutYellow : Color(hex: 0xE5E7EB))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(enabled ? BuyerColors.cartCheckoutYellowBorder : Color(hex: 0xD1D5DB), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
