import SwiftUI

enum CheckoutUiColors {
    static let pageBg = Color(hex: 0xEAEDED)
    static let cardBorder = Color(hex: 0xDDDDDD)
    static let orange = Color(hex: 0xFF9900)
    static let orangeBg = Color(hex: 0xFFFBF0)
    static let teal = Color(hex: 0x067D62)
    static let tealBadge = Color(hex: 0x007185)
    static let textPrimary = Color(hex: 0x0F1111)
    static let textSecondary = Color(hex: 0x555555)
    static let navy = Color(hex: 0x0B2A66)
    static let deliveryBannerBg = Color(hex: 0xF0FAF0)
    static let deliveryBannerBorder = Color(hex: 0xC3E6CB)
}

struct CheckoutStepHeader: View {
    let step: String
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            Text(step)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 28, height: 28)
                .background(CheckoutUiColors.orange)
                .clipShape(Circle())
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(CheckoutUiColors.textPrimary)
        }
    }
}

struct CheckoutYellowButton: View {
    let text: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(enabled ? CheckoutUiColors.textPrimary : Color(hex: 0x9CA3AF))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(enabled ? BuyerColors.cartCheckoutYellow : Color(hex: 0xE5E7EB))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(enabled ? BuyerColors.cartCheckoutYellowBorder : Color(hex: 0xD1D5DB), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

struct CheckoutNavyButton: View {
    let text: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(CheckoutUiColors.navy)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct CheckoutDeliveryBanner: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(CheckoutUiColors.teal)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(CheckoutUiColors.deliveryBannerBg)
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(CheckoutUiColors.deliveryBannerBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

struct CheckoutCompactTotalBar: View {
    let itemCount: Int
    let total: Double?
    let currency: String
    let pricingLoading: Bool
    let onViewDetails: () -> Void

    var body: some View {
        HStack {
            HStack(spacing: 0) {
                Text(BuyerStrings.checkoutItemCount(itemCount))
                    .font(.system(size: 14))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                Text(" | ")
                    .font(.system(size: 14))
                    .foregroundStyle(Color(hex: 0xD1D5DB))
                Button(action: onViewDetails) {
                    Text(BuyerStrings.checkoutViewDetails)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(BuyerColors.cartLink)
                }
                .buttonStyle(.plain)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(BuyerStrings.total)
                    .font(.system(size: 12))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                Text(total != nil && !pricingLoading ? formatCurrency(amount: total!, currency: currency) : "—")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BuyerColors.cartPrice)
            }
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }
}

struct PaymentModeTabs: View {
    let payOnline: Bool
    let onPayOnline: () -> Void
    let onPayCod: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            paymentTab(label: BuyerStrings.checkoutPayOnline, selected: payOnline, action: onPayOnline)
            paymentTab(label: BuyerStrings.checkoutPayCodTab, selected: !payOnline, action: onPayCod)
        }
        .padding(12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private func paymentTab(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(selected ? CheckoutUiColors.textPrimary : Color(hex: 0x6B7280))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(selected ? CheckoutUiColors.orangeBg : Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(selected ? CheckoutUiColors.orange : CheckoutUiColors.cardBorder, lineWidth: selected ? 2 : 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct DeliverySpeedSelector: View {
    let quote: CheckoutPricingQuote
    let selectedTier: ShippingTier
    let onTierSelected: (ShippingTier) -> Void
    let currency: String

    var body: some View {
        if let opts = quote.intlShippingOptions {
            VStack(alignment: .leading, spacing: 10) {
                Text(BuyerStrings.checkoutChooseDeliverySpeed)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(CheckoutUiColors.textPrimary)
                    .tracking(0.5)
                DeliveryTierCard(
                    title: BuyerStrings.shippingStandard,
                    badge: BuyerStrings.checkoutBestValue,
                    badgeBg: Color(hex: 0xD1FAE5),
                    badgeText: Color(hex: 0x047857),
                    accent: Color(hex: 0x10B981),
                    price: formatCurrency(amount: opts.standard.shipping, currency: currency),
                    subtitle: tierSubtitle(opts.standard),
                    selected: selectedTier == .standard,
                    onClick: { onTierSelected(.standard) }
                )
                if let premium = opts.premium {
                    DeliveryTierCard(
                        title: BuyerStrings.shippingPremium,
                        badge: BuyerStrings.checkoutPriority,
                        badgeBg: Color(hex: 0xDBEAFE),
                        badgeText: Color(hex: 0x1D4ED8),
                        accent: Color(hex: 0x3B82F6),
                        price: formatCurrency(amount: premium.shipping, currency: currency),
                        subtitle: tierSubtitle(premium),
                        selected: selectedTier == .premium,
                        onClick: { onTierSelected(.premium) }
                    )
                }
                if let express = opts.express {
                    DeliveryTierCard(
                        title: BuyerStrings.shippingExpress,
                        badge: BuyerStrings.checkoutFastest,
                        badgeBg: Color(hex: 0xFFEDD5),
                        badgeText: Color(hex: 0xC2410C),
                        accent: Color(hex: 0xF97316),
                        price: formatCurrency(amount: express.shipping, currency: currency),
                        subtitle: tierSubtitle(express),
                        selected: selectedTier == .express,
                        onClick: { onTierSelected(.express) }
                    )
                }
            }
        }
    }

    private func tierSubtitle(_ option: IntlShippingOption) -> String {
        let days = option.estimatedDays.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !days.isEmpty else { return "" }
        return "\(days) business days · \(days.uppercased())"
    }
}

private struct DeliveryTierCard: View {
    let title: String
    let badge: String
    let badgeBg: Color
    let badgeText: Color
    let accent: Color
    let price: String
    let subtitle: String
    let selected: Bool
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .stroke(selected ? accent : Color(hex: 0xD1D5DB), lineWidth: selected ? 2 : 1)
                        .frame(width: 20, height: 20)
                    if selected {
                        Circle()
                            .fill(accent)
                            .frame(width: 10, height: 10)
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        HStack(spacing: 6) {
                            Text(title)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(CheckoutUiColors.textPrimary)
                            Text(badge)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(badgeText)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(badgeBg)
                                .clipShape(Capsule())
                        }
                        Spacer()
                        Text(price)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(CheckoutUiColors.textPrimary)
                    }
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(CheckoutUiColors.textSecondary)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? accent.opacity(0.08) : Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(selected ? accent : Color(hex: 0xE5E7EB), lineWidth: selected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct CheckoutOrderSummaryPanel: View {
    let itemCount: Int
    let quote: CheckoutPricingQuote?
    let activeQuote: CheckoutPricingQuote?
    let pricingLoading: Bool
    let selectedTier: ShippingTier
    let onTierSelected: (ShippingTier) -> Void
    let showCodRow: Bool
    let codAvailable: Bool
    let estimatedDeliveryLabel: String?
    let minimumOrderNotMet: Bool
    let minimumOrderAmount: String?
    let onProceed: () -> Void
    let onBackToCart: () -> Void
    let proceedEnabled: Bool
    let proceedLabel: String

    private var currency: String {
        activeQuote?.currency ?? quote?.currency ?? "INR"
    }

    private var displayQuote: CheckoutPricingQuote? {
        activeQuote ?? quote
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.orderSummary)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(CheckoutUiColors.textPrimary)
                .padding(.bottom, 16)

            summaryRow(
                label: BuyerStrings.checkoutItemsMany(itemCount),
                value: displayQuote != nil && !pricingLoading
                    ? formatCurrency(amount: displayQuote!.subtotal, currency: currency) : "—"
            )

            if (displayQuote?.offerDiscount ?? 0) > 0, let displayQuote {
                summaryRow(
                    label: BuyerStrings.checkoutSavings,
                    value: "-\(formatCurrency(amount: displayQuote.offerDiscount, currency: currency))",
                    valueColor: CheckoutUiColors.teal,
                    labelColor: CheckoutUiColors.teal
                )
                .padding(.top, 8)
            }

            shippingRow.padding(.top, 8)

            if showCodRow, !pricingLoading, displayQuote != nil {
                summaryRow(
                    label: BuyerStrings.checkoutCod,
                    value: codAvailable ? BuyerStrings.checkoutCodAvailable : BuyerStrings.checkoutCodUnavailable,
                    valueColor: codAvailable ? CheckoutUiColors.teal : BuyerColors.cartPrice
                )
                .padding(.top, 8)
            }

            if quote?.intlShippingOptions != nil, !pricingLoading, let quote {
                DeliverySpeedSelector(
                    quote: quote,
                    selectedTier: selectedTier,
                    onTierSelected: onTierSelected,
                    currency: currency
                )
                .padding(.top, 16)
            } else if quote?.intlShippingOptions == nil, let estimatedDeliveryLabel {
                HStack(spacing: 6) {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 12))
                        .foregroundStyle(CheckoutUiColors.teal)
                    Text(BuyerStrings.checkoutEstDelivery(estimatedDeliveryLabel))
                        .font(.system(size: 13))
                        .foregroundStyle(CheckoutUiColors.textSecondary)
                }
                .padding(.top, 12)
            }

            if minimumOrderNotMet {
                VStack(alignment: .leading, spacing: 4) {
                    Text(BuyerStrings.checkoutMinimumOrder(minimumOrderAmount ?? formatCurrency(amount: 0, currency: currency)))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.white)
                    Text(BuyerStrings.checkoutMinimumOrderHint)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white.opacity(0.8))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(CheckoutUiColors.navy)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .padding(.top, 12)
            }

            if !minimumOrderNotMet {
                Divider()
                    .frame(height: 2)
                    .background(CheckoutUiColors.cardBorder)
                    .padding(.vertical, 14)
                HStack {
                    Text(BuyerStrings.checkoutOrderTotal)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BuyerColors.cartPrice)
                    Spacer()
                    Text(displayQuote != nil && !pricingLoading
                         ? formatCurrency(amount: displayQuote!.total, currency: currency) : "—")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BuyerColors.cartPrice)
                }
            }

            Group {
                if minimumOrderNotMet {
                    CheckoutNavyButton(text: BuyerStrings.checkoutBackCart, action: onBackToCart)
                } else {
                    CheckoutYellowButton(text: proceedLabel, enabled: proceedEnabled && !pricingLoading, action: onProceed)
                }
            }
            .padding(.top, 16)

            Text(BuyerStrings.cartSecureCheckout)
                .font(.system(size: 12))
                .foregroundStyle(CheckoutUiColors.teal)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.top, 12)

            Divider().background(Color(hex: 0xEEEEEE)).padding(.vertical, 14)

            HStack(spacing: 6) {
                Text(BuyerStrings.checkoutAccepted)
                    .font(.system(size: 12))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                ForEach(["Visa", "Mastercard", "RuPay", "UPI"], id: \.self) { brand in
                    Text(brand)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(CheckoutUiColors.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(hex: 0xF0F0F0))
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    @ViewBuilder
    private var shippingRow: some View {
        let shippingValue: String = {
            if pricingLoading { return BuyerStrings.checkoutCalculating }
            guard let displayQuote else { return BuyerStrings.checkoutCalculating }
            if displayQuote.shippingError != nil && !minimumOrderNotMet {
                return BuyerStrings.checkoutNotServiceable
            }
            if displayQuote.shipping <= 0 && !displayQuote.hasInternationalItems {
                return BuyerStrings.checkoutShippingFree
            }
            return formatCurrency(amount: displayQuote.shipping, currency: currency)
        }()
        let shippingColor: Color = {
            if displayQuote?.shippingError != nil && !minimumOrderNotMet {
                return BuyerColors.cartPrice
            }
            return CheckoutUiColors.teal
        }()
        summaryRow(label: BuyerStrings.shipping, value: shippingValue, valueColor: shippingColor)
    }

    private func summaryRow(
        label: String,
        value: String,
        valueColor: Color = CheckoutUiColors.textPrimary,
        labelColor: Color = CheckoutUiColors.textSecondary
    ) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(labelColor)
                .fontWeight(labelColor == CheckoutUiColors.teal ? .semibold : .regular)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(valueColor)
        }
    }
}

struct CheckoutPaymentFooter: View {
    let onBack: () -> Void

    var body: some View {
        HStack {
            Button(action: onBack) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(BuyerColors.cartLink)
                    Text(BuyerStrings.checkoutBackReview)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(BuyerColors.cartLink)
                }
            }
            .buttonStyle(.plain)
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "shield")
                    .font(.system(size: 12))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
                Text(BuyerStrings.checkoutSslStripe)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(CheckoutUiColors.textSecondary)
            }
        }
    }
}
