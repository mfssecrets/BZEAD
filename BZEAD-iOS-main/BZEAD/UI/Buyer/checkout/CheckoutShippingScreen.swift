import SwiftUI

struct CheckoutShippingScreen: View {
    let session: BuyerSession
    let onBack: () -> Void
    let onManageAddresses: () -> Void
    let onContinue: (UserAddressRow) -> Void

    @State private var loading = true
    @State private var addresses: [UserAddressRow] = []
    @State private var cartItems: [CartLineItem] = []
    @State private var selectedId: String?
    @State private var useSavedAddresses = true
    @State private var pricingLoading = false
    @State private var quote: CheckoutPricingQuote?
    @State private var continuing = false

    private let addressRepo = AddressRepository()
    private let cartRepo = CartRepository()
    private let pricingRepo = ProductPricingRepository()

    private var selectedAddress: UserAddressRow? {
        addresses.first { $0.id == selectedId }
    }

    var body: some View {
        ZStack {
            if loading {
                VStack(spacing: 12) {
                    BuyerCheckoutPanelSkeleton()
                    BuyerCheckoutPanelSkeleton()
                }
                .padding(16)
            } else if addresses.isEmpty {
                checkoutEmptyAddresses
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        shippingAddressCard
                        checkoutOrderSummaryCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 88)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CheckoutUiColors.pageBg)
        .task(id: session.userId) { await loadInitialData() }
        .onChange(of: selectedId) { _, _ in
            if let address = selectedAddress, !loading {
                Task { await refreshPricing(address: address) }
            }
        }
    }

    private var checkoutEmptyAddresses: some View {
        VStack(spacing: 12) {
            Text(BuyerStrings.noAddresses)
                .font(.system(size: 18, weight: .bold))
            CheckoutYellowButton(text: BuyerStrings.addAddress, enabled: true, action: onManageAddresses)
        }
        .padding(24)
    }

    private var shippingAddressCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            CheckoutStepHeader(step: "1", title: BuyerStrings.checkoutShippingTitle)
                .padding(.bottom, 16)

            HStack(spacing: 8) {
                addressModeTab(
                    label: BuyerStrings.checkoutNewAddress,
                    icon: "plus",
                    selected: !useSavedAddresses,
                    action: {
                        useSavedAddresses = false
                        onManageAddresses()
                    }
                )
                addressModeTab(
                    label: BuyerStrings.checkoutSavedAddresses(addresses.count),
                    icon: "mappin.and.ellipse",
                    selected: useSavedAddresses,
                    action: { useSavedAddresses = true }
                )
            }

            if useSavedAddresses {
                VStack(spacing: 10) {
                    ForEach(addresses, id: \.id) { address in
                        savedAddressCard(address: address, selected: selectedId == address.id) {
                            selectedId = address.id
                        }
                    }
                }
                .padding(.top, 16)

                if selectedId == nil {
                    Text(BuyerStrings.checkoutSelectAddressHint)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0xB45309))
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hex: 0xFFFBEB))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xFDE68A), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .padding(.top, 4)
                }

                CheckoutYellowButton(
                    text: continueButtonLabel,
                    enabled: canContinue && !continuing,
                    action: handleContinue
                )
                .padding(.top, 12)
            }
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var checkoutOrderSummaryCard: some View {
        let currency = quote?.currency ?? cartItems.first?.product.currency ?? "INR"
        return VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.orderSummary)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(CheckoutUiColors.textPrimary)
                .padding(.bottom, 16)

            HStack {
                Text(BuyerStrings.checkoutItemsMany(cartItems.count))
                    .font(.system(size: 14))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                Spacer()
                Text(quote != nil && !pricingLoading
                     ? formatCurrency(amount: quote!.subtotal, currency: currency) : "—")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(CheckoutUiColors.textPrimary)
            }

            if (quote?.offerDiscount ?? 0) > 0, let quote {
                HStack {
                    Text(BuyerStrings.checkoutSavings)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CheckoutUiColors.teal)
                    Spacer()
                    Text("-\(formatCurrency(amount: quote.offerDiscount, currency: currency))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CheckoutUiColors.teal)
                }
                .padding(.top, 8)
            }

            HStack {
                Text(BuyerStrings.shipping)
                    .font(.system(size: 14))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                Spacer()
                Text(shippingLabel(currency: currency))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(CheckoutUiColors.teal)
            }
            .padding(.top, 8)

            Divider()
                .frame(height: 2)
                .background(CheckoutUiColors.cardBorder)
                .padding(.vertical, 14)

            HStack {
                Text(BuyerStrings.checkoutOrderTotal)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BuyerColors.cartPrice)
                Spacer()
                Text(quote != nil && !pricingLoading
                     ? formatCurrency(amount: quote!.total, currency: currency) : "—")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BuyerColors.cartPrice)
            }

            Text(BuyerStrings.cartSecureCheckout)
                .font(.system(size: 12))
                .foregroundStyle(CheckoutUiColors.teal)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var canContinue: Bool {
        selectedAddress != nil && !pricingLoading && quote != nil
    }

    private var continueButtonLabel: String {
        if continuing { return BuyerStrings.checkoutSaving }
        if pricingLoading { return BuyerStrings.checkoutRefreshingShipping }
        return BuyerStrings.checkoutContinueReview
    }

    private func shippingLabel(currency: String) -> String {
        if pricingLoading { return BuyerStrings.checkoutCalculating }
        guard let quote else { return BuyerStrings.checkoutCalculating }
        if quote.shipping <= 0 { return BuyerStrings.checkoutShippingFree }
        return formatCurrency(amount: quote.shipping, currency: currency)
    }

    private func addressModeTab(label: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(selected ? CheckoutUiColors.textPrimary : Color(hex: 0x6B7280))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 8)
            .background(selected ? CheckoutUiColors.orangeBg : Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(selected ? CheckoutUiColors.orange : Color(hex: 0xD1D5DB), lineWidth: selected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func savedAddressCard(address: UserAddressRow, selected: Bool, onClick: @escaping () -> Void) -> some View {
        Button(action: onClick) {
            ZStack(alignment: .topTrailing) {
                if address.isDefault {
                    Text(BuyerStrings.checkoutDefaultBadge)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(CheckoutUiColors.tealBadge)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(address.fullName)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(CheckoutUiColors.textPrimary)
                            .lineLimit(1)
                        if selected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(CheckoutUiColors.orange)
                        }
                    }
                    .padding(.trailing, 72)
                    if let phone = address.phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines), !phone.isEmpty {
                        Text(phone)
                            .font(.system(size: 13))
                            .foregroundStyle(CheckoutUiColors.textSecondary)
                            .lineLimit(1)
                    }
                    Text(formatAddressLine(address))
                        .font(.system(size: 13))
                        .foregroundStyle(CheckoutUiColors.textSecondary)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, address.isDefault ? 18 : 0)
            }
            .padding(12)
            .background(selected ? CheckoutUiColors.orangeBg : Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(selected ? CheckoutUiColors.orange : Color(hex: 0xD1D5DB), lineWidth: selected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func loadInitialData() async {
        loading = true
        addresses = await addressRepo.fetchAddresses(session: session)
        cartItems = await cartRepo.fetchCart(session: session)
        let defaultAddress = addresses.first(where: \.isDefault) ?? addresses.first
        selectedId = defaultAddress?.id
        useSavedAddresses = !addresses.isEmpty
        loading = false
        if let defaultAddress {
            await refreshPricing(address: defaultAddress)
        }
    }

    private func refreshPricing(address: UserAddressRow) async {
        guard !cartItems.isEmpty else {
            quote = nil
            return
        }
        pricingLoading = true
        let publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: cartItems.map { $0.product.id }.uniqued(),
            countryCandidates: [address.country],
            productCurrencies: Dictionary(uniqueKeysWithValues: cartItems.map { ($0.product.id, $0.product.currency ?? "INR") })
        )
        let pricingItems = cartItems.map { line -> CheckoutPricingInputItem in
            let unit = line.unitPrice
                ?? publicPrices[line.product.id]?.publicUnitPrice
                ?? line.product.price
            return CheckoutPricingInputItem(
                productId: line.product.id,
                productName: line.product.name,
                quantity: line.quantity,
                unitPrice: unit,
                currency: line.product.currency ?? "INR"
            )
        }
        quote = await CheckoutPricingService.calculateDestinationCheckoutPricing(
            items: pricingItems,
            destinationCountry: address.country,
            destinationPostalCode: address.postalCode,
            session: session
        )
        pricingLoading = false
    }

    private func handleContinue() {
        guard let address = selectedAddress else { return }
        continuing = true
        Task {
            await CheckoutPreferencesRepository.saveShippingCountry(address.country)
            continuing = false
            onContinue(address)
        }
    }
}

private func formatAddressLine(_ address: UserAddressRow) -> String {
    var line = address.streetAddress1
    if let street2 = address.streetAddress2?.trimmingCharacters(in: .whitespacesAndNewlines), !street2.isEmpty {
        line += ", \(street2)"
    }
    line += ", \(address.city), \(address.state) \(address.postalCode), \(address.country)"
    return line
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
