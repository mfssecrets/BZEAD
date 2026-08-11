import SwiftUI
import StripePaymentSheet

struct CheckoutPaymentScreen: View {
    let session: BuyerSession
    let shippingAddress: UserAddressRow
    let shippingTier: ShippingTier
    let onBack: () -> Void
    let onViewReview: () -> Void
    let onOrderPlaced: (String) -> Void

    var body: some View {
        let stripeKey = SupabaseConfig.stripePublishableKey
        if stripeKey.isEmpty {
            CheckoutPaymentMissingStripe(onBack: onBack)
        } else {
            CheckoutPaymentContent(
                session: session,
                shippingAddress: shippingAddress,
                shippingTier: shippingTier,
                stripeKey: stripeKey,
                onBack: onBack,
                onViewReview: onViewReview,
                onOrderPlaced: onOrderPlaced
            )
        }
    }
}

private struct CheckoutPaymentMissingStripe: View {
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(BuyerStrings.stripeNotConfigured)
                .foregroundStyle(CheckoutUiColors.textPrimary)
            CheckoutNavyButton(text: BuyerStrings.checkoutBackReview, action: onBack)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CheckoutUiColors.pageBg)
    }
}

private struct CheckoutPaymentContent: View {
    let session: BuyerSession
    let shippingAddress: UserAddressRow
    let shippingTier: ShippingTier
    let stripeKey: String
    let onBack: () -> Void
    let onViewReview: () -> Void
    let onOrderPlaced: (String) -> Void

    @State private var loading = true
    @State private var placing = false
    @State private var items: [CartLineItem] = []
    @State private var quote: CheckoutPricingQuote?
    @State private var payViaCod = false
    @State private var pendingPaymentIntentId: String?
    @State private var toastMessage: String?

    private let checkoutRepo = CheckoutRepository()

    private var activeQuote: CheckoutPricingQuote? {
        quote.map { CheckoutPricingService.withTier(quote: $0, tier: shippingTier) }
    }

    private var currency: String {
        activeQuote?.currency ?? items.first?.product.currency ?? "INR"
    }

    private var isIndia: Bool {
        CheckoutHelpers.isIndiaDestination(country: shippingAddress.country)
    }

    private var showCod: Bool {
        isIndia && (activeQuote?.codEligible == true)
    }

    private var minimumNotMet: Bool {
        CheckoutHelpers.minimumOrderNotMet(quote: activeQuote)
    }

    private var canCheckout: Bool {
        guard let activeQuote else { return false }
        return activeQuote.shippingError == nil && !minimumNotMet && !items.isEmpty
    }

    var body: some View {
        ZStack {
            if loading {
                VStack(spacing: 12) {
                    BuyerCheckoutPanelSkeleton()
                    BuyerCheckoutPanelSkeleton()
                }
                .padding(16)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        CheckoutCompactTotalBar(
                            itemCount: items.count,
                            total: activeQuote?.total,
                            currency: currency,
                            pricingLoading: false,
                            onViewDetails: onViewReview
                        )
                        if showCod {
                            PaymentModeTabs(
                                payOnline: !payViaCod,
                                onPayOnline: { payViaCod = false },
                                onPayCod: { payViaCod = true }
                            )
                        }
                        if !payViaCod || !showCod {
                            OnlinePaymentCard(
                                total: activeQuote?.total,
                                currency: currency,
                                placing: placing,
                                enabled: canCheckout && !placing,
                                onPay: startCardPayment
                            )
                        }
                        if payViaCod && showCod {
                            CodPaymentCard(
                                total: activeQuote?.total,
                                currency: currency,
                                placing: placing,
                                enabled: canCheckout && !placing,
                                onPlaceOrder: placeCodOrder
                            )
                        }
                        CheckoutPaymentFooter(onBack: onBack)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 88)
                }
            }

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
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        self.toastMessage = nil
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CheckoutUiColors.pageBg)
        .onAppear {
            STPAPIClient.shared.publishableKey = stripeKey
        }
        .task(id: "\(session.userId)|\(shippingAddress.id)|\(shippingTierLabel)") {
            await loadData()
        }
    }

    private var shippingTierLabel: String {
        switch shippingTier {
        case .standard: return "standard"
        case .premium: return "premium"
        case .express: return "express"
        }
    }

    private func loadData() async {
        loading = true
        let result = await CheckoutHelpers.loadCartAndQuote(session: session, address: shippingAddress)
        items = result.items
        quote = result.quote
        payViaCod = false
        loading = false
    }

    private func startCardPayment() {
        guard let quote = activeQuote else { return }
        placing = true
        Task {
            let amount = checkoutRepo.toStripeAmount(displayAmount: quote.total, currency: currency)
            let result = await checkoutRepo.createPaymentIntent(
                session: session,
                amountSmallestUnit: amount,
                currency: currency
            )
            switch result {
            case .success(let pi):
                guard let clientSecret = pi.clientSecret, !clientSecret.isEmpty else {
                    placing = false
                    toastMessage = BuyerStrings.paymentFailed
                    return
                }
                pendingPaymentIntentId = pi.paymentIntentId
                StripePaymentSheetPresenter.present(clientSecret: clientSecret) { paymentResult in
                    handlePaymentSheetResult(paymentResult, quote: quote)
                }
            case .failure(let error):
                placing = false
                toastMessage = error.localizedDescription.isEmpty ? BuyerStrings.paymentFailed : error.localizedDescription
            }
        }
    }

    private func handlePaymentSheetResult(_ result: PaymentSheetResult, quote: CheckoutPricingQuote) {
        switch result {
        case .completed:
            guard let piId = pendingPaymentIntentId else {
                placing = false
                return
            }
            Task {
                await placeOrder(
                    method: "card",
                    paymentIntentId: piId,
                    paymentStatus: "completed",
                    orderStatus: "processing",
                    quote: quote
                )
            }
        case .canceled:
            placing = false
        case .failed(let error):
            placing = false
            toastMessage = error.localizedDescription.isEmpty ? BuyerStrings.paymentFailed : error.localizedDescription
        }
    }

    private func placeCodOrder() {
        guard let quote = activeQuote else { return }
        let codId = "COD-\(session.userId)-\(UUID().uuidString)"
        Task {
            await placeOrder(
                method: "cod",
                paymentIntentId: codId,
                paymentStatus: "pending",
                orderStatus: "pending",
                quote: quote
            )
        }
    }

    private func placeOrder(
        method: String,
        paymentIntentId: String,
        paymentStatus: String,
        orderStatus: String,
        quote: CheckoutPricingQuote
    ) async {
        placing = true
        let result = await checkoutRepo.createOrder(
            session: session,
            items: items,
            address: shippingAddress,
            paymentMethod: method,
            paymentIntentId: paymentIntentId,
            paymentStatus: paymentStatus,
            orderStatus: orderStatus,
            currency: currency,
            pricing: quote
        )
        placing = false
        switch result {
        case .success(let order):
            guard let id = order.id else { return }
            toastMessage = BuyerStrings.orderPlaced
            onOrderPlaced(id)
        case .failure(let error):
            toastMessage = error.localizedDescription.isEmpty ? BuyerStrings.orderFailed : error.localizedDescription
        }
    }
}

private struct OnlinePaymentCard: View {
    let total: Double?
    let currency: String
    let placing: Bool
    let enabled: Bool
    let onPay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.checkoutPaymentMethod)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(CheckoutUiColors.textPrimary)
                .tracking(0.5)
            Text(BuyerStrings.checkoutStripeSecureNote)
                .font(.system(size: 14))
                .foregroundStyle(CheckoutUiColors.textSecondary)
                .padding(.top, 12)
                .padding(.bottom, 16)
            CheckoutYellowButton(text: payLabel, enabled: enabled, action: onPay)
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var payLabel: String {
        if placing { return BuyerStrings.checkoutProcessing }
        if let total { return BuyerStrings.checkoutPayNow(formatCurrency(amount: total, currency: currency)) }
        return BuyerStrings.checkoutPayNowGeneric
    }
}

private struct CodPaymentCard: View {
    let total: Double?
    let currency: String
    let placing: Bool
    let enabled: Bool
    let onPlaceOrder: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.checkoutPayCodTab)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(CheckoutUiColors.textPrimary)
                .tracking(0.5)
            Text(BuyerStrings.checkoutCodDescription)
                .font(.system(size: 14))
                .foregroundStyle(CheckoutUiColors.textSecondary)
                .padding(.top, 8)
                .padding(.bottom, 16)
            CheckoutYellowButton(text: placeLabel, enabled: enabled, action: onPlaceOrder)
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(CheckoutUiColors.cardBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    private var placeLabel: String {
        if placing { return BuyerStrings.placingOrder }
        if let total { return BuyerStrings.checkoutPlaceCod(formatCurrency(amount: total, currency: currency)) }
        return BuyerStrings.payCod
    }
}

private enum StripePaymentSheetPresenter {
    static func present(clientSecret: String, onComplete: @escaping (PaymentSheetResult) -> Void) {
        STPAPIClient.shared.publishableKey = SupabaseConfig.stripePublishableKey
        var configuration = PaymentSheet.Configuration()
        configuration.merchantDisplayName = "BZEAD"
        configuration.allowsDelayedPaymentMethods = false
        let sheet = PaymentSheet(paymentIntentClientSecret: clientSecret, configuration: configuration)
        guard let root = topViewController() else {
            onComplete(.failed(error: NSError(
                domain: "StripePaymentSheetPresenter",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: BuyerStrings.paymentFailed]
            )))
            return
        }
        sheet.present(from: root) { result in
            onComplete(result)
        }
    }

    private static func topViewController(base: UIViewController? = keyWindowRoot()) -> UIViewController? {
        if let navigation = base as? UINavigationController {
            return topViewController(base: navigation.visibleViewController)
        }
        if let tab = base as? UITabBarController {
            return topViewController(base: tab.selectedViewController)
        }
        if let presented = base?.presentedViewController {
            return topViewController(base: presented)
        }
        return base
    }

    private static func keyWindowRoot() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }
}
