import SwiftUI

struct CheckoutReviewScreen: View {
    let session: BuyerSession
    let shippingAddress: UserAddressRow
    let initialTier: ShippingTier
    let onChangeAddress: () -> Void
    let onBackToCart: () -> Void
    let onProceedToPayment: (ShippingTier) -> Void

    @State private var loading = true
    @State private var pricingLoading = false
    @State private var items: [CartLineItem] = []
    @State private var quote: CheckoutPricingQuote?
    @State private var selectedTier: ShippingTier

    init(
        session: BuyerSession,
        shippingAddress: UserAddressRow,
        initialTier: ShippingTier,
        onChangeAddress: @escaping () -> Void,
        onBackToCart: @escaping () -> Void,
        onProceedToPayment: @escaping (ShippingTier) -> Void
    ) {
        self.session = session
        self.shippingAddress = shippingAddress
        self.initialTier = initialTier
        self.onChangeAddress = onChangeAddress
        self.onBackToCart = onBackToCart
        self.onProceedToPayment = onProceedToPayment
        _selectedTier = State(initialValue: initialTier)
    }

    private var activeQuote: CheckoutPricingQuote? {
        quote.map { CheckoutPricingService.withTier(quote: $0, tier: selectedTier) }
    }

    private var currency: String {
        activeQuote?.currency ?? quote?.currency ?? "INR"
    }

    private var isIndia: Bool {
        CheckoutHelpers.isIndiaDestination(country: shippingAddress.country)
    }

    private var codAvailable: Bool {
        isIndia && (activeQuote?.codEligible == true)
    }

    private var minimumNotMet: Bool {
        CheckoutHelpers.minimumOrderNotMet(quote: activeQuote)
    }

    private var minimumAmount: String? {
        CheckoutHelpers.minimumOrderDisplayAmount(quote: activeQuote, currency: currency)
            ?? CheckoutHelpers.parseMinimumOrderAmount(error: activeQuote?.shippingError, currency: currency)
    }

    private var deliveryLabel: String? {
        if let options = activeQuote?.intlShippingOptions {
            let option: IntlShippingOption? = switch selectedTier {
            case .standard: options.standard
            case .premium: options.premium
            case .express: options.express
            }
            if let days = option?.estimatedDays.trimmingCharacters(in: .whitespacesAndNewlines), !days.isEmpty {
                return days
            }
            return options.standard.estimatedDays.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? nil
                : options.standard.estimatedDays
        }
        return CheckoutHelpers.formatDeliveryDateFromDays(activeQuote?.estimatedDeliveryDays)
    }

    private var canProceed: Bool {
        guard let activeQuote else { return false }
        return activeQuote.shippingError == nil && !minimumNotMet && !items.isEmpty && !pricingLoading
    }

    private var proceedLabel: String {
        if pricingLoading { return BuyerStrings.checkoutRefreshingShipping }
        if activeQuote?.shippingError != nil { return BuyerStrings.checkoutConfigUnavailable }
        return BuyerStrings.checkoutProceedPayment
    }

    var body: some View {
        ZStack {
            if loading {
                VStack(spacing: 12) {
                    BuyerCheckoutPanelSkeleton()
                    BuyerCheckoutPanelSkeleton()
                    BuyerCheckoutPanelSkeleton()
                }
                .padding(16)
            } else if items.isEmpty {
                VStack(spacing: 12) {
                    Text(BuyerStrings.cartEmpty)
                        .font(.system(size: 18, weight: .bold))
                    CheckoutNavyButton(text: BuyerStrings.checkoutBackCart, action: onBackToCart)
                }
                .padding(24)
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        shippingAddressSummaryCard
                        reviewItemsCard
                        CheckoutOrderSummaryPanel(
                            itemCount: items.count,
                            quote: quote,
                            activeQuote: activeQuote,
                            pricingLoading: pricingLoading,
                            selectedTier: selectedTier,
                            onTierSelected: { selectedTier = $0 },
                            showCodRow: isIndia,
                            codAvailable: codAvailable,
                            estimatedDeliveryLabel: deliveryLabel,
                            minimumOrderNotMet: minimumNotMet,
                            minimumOrderAmount: minimumAmount,
                            onProceed: { onProceedToPayment(selectedTier) },
                            onBackToCart: onBackToCart,
                            proceedEnabled: canProceed,
                            proceedLabel: proceedLabel
                        )
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 88)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CheckoutUiColors.pageBg)
        .task(id: "\(session.userId)|\(shippingAddress.id)") {
            await loadData()
        }
    }

    private var shippingAddressSummaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                CheckoutStepHeader(step: "1", title: BuyerStrings.checkoutShippingTitle)
                Spacer()
                Button(action: onChangeAddress) {
                    Text(BuyerStrings.checkoutChangeAddress)
                        .font(.system(size: 13))
                        .foregroundStyle(BuyerColors.cartLink)
                }
                .buttonStyle(.plain)
            }

            ZStack(alignment: .topTrailing) {
                Text(BuyerStrings.checkoutSelectedBadge)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(CheckoutUiColors.tealBadge)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(shippingAddress.fullName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(CheckoutUiColors.textPrimary)
                    ForEach(CheckoutHelpers.formatAddressBlock(address: shippingAddress), id: \.self) { line in
                        Text(line)
                            .font(.system(size: 13))
                            .foregroundStyle(CheckoutUiColors.textSecondary)
                    }
                }
                .padding(.trailing, 72)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(CheckoutUiColors.orangeBg)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.orange, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var reviewItemsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            CheckoutStepHeader(step: "2", title: BuyerStrings.checkoutReviewTitle)

            if let deliveryBanner = reviewDeliveryBanner {
                CheckoutDeliveryBanner(deliveryBanner)
            }

            ForEach(Array(items.enumerated()), id: \.element.cartItemId) { index, item in
                if index > 0 {
                    Divider().background(Color(hex: 0xEEEEEE))
                }
                ReviewItemRow(
                    item: item,
                    currency: currency,
                    pricingLoading: pricingLoading,
                    quote: activeQuote
                )
            }
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var reviewDeliveryBanner: String? {
        guard let quote else { return nil }
        if let days = quote.intlShippingOptions?.standard.estimatedDays.trimmingCharacters(in: .whitespacesAndNewlines),
           !days.isEmpty {
            return BuyerStrings.checkoutEstimatedDeliveryLabel("\(days) business days")
        }
        if let date = CheckoutHelpers.formatDeliveryDateFromDays(quote.estimatedDeliveryDays) {
            return BuyerStrings.checkoutEstimatedDeliveryLabel(date)
        }
        return nil
    }

    private func loadData() async {
        loading = true
        pricingLoading = true
        let result = await CheckoutHelpers.loadCartAndQuote(session: session, address: shippingAddress)
        items = result.items
        quote = result.quote
        selectedTier = initialTier
        loading = false
        pricingLoading = false
    }
}

private struct ReviewItemRow: View {
    let item: CartLineItem
    let currency: String
    let pricingLoading: Bool
    let quote: CheckoutPricingQuote?

    private var unit: Double {
        quote?.lineItems.first(where: { $0.productId == item.product.id })?.convertedUnitPrice
            ?? item.unitPrice
            ?? item.product.price
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if let imageUrl = CheckoutHelpers.productImageUrl(item: item), let url = URL(string: imageUrl) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color(hex: 0xF7F7F7)
                    }
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xEEEEEE), lineWidth: 1))
            } else {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color(hex: 0xF7F7F7))
                    .frame(width: 80, height: 80)
                    .overlay {
                        Image(systemName: "shippingbox")
                            .font(.system(size: 24))
                            .foregroundStyle(Color(hex: 0x9CA3AF))
                    }
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xEEEEEE), lineWidth: 1))
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(item.product.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(CheckoutUiColors.textPrimary)
                    .lineLimit(2)
                if item.selectedSize != nil || item.selectedColor != nil {
                    Text("Size: \(item.selectedSize ?? "N/A") • Color: \(item.selectedColor ?? "N/A")")
                        .font(.system(size: 12))
                        .foregroundStyle(Color(hex: 0x666666))
                        .padding(.top, 2)
                }
                HStack(spacing: 12) {
                    Text(formatCurrency(amount: unit, currency: currency))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(BuyerColors.cartPrice)
                    Text(BuyerStrings.checkoutQtyLabel(item.quantity))
                        .font(.system(size: 12))
                        .foregroundStyle(CheckoutUiColors.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color(hex: 0xF0F0F0))
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
                .padding(.top, 6)
                Text(deliveryText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(CheckoutUiColors.teal)
                    .padding(.top, 6)
            }
        }
        .padding(.vertical, 14)
    }

    private var deliveryText: String {
        if pricingLoading || quote == nil { return BuyerStrings.checkoutDeliveryCalculating }
        if quote!.shipping <= 0 && !quote!.hasInternationalItems { return BuyerStrings.checkoutFreeDelivery }
        return BuyerStrings.checkoutDeliveryIncluded
    }
}
