import SwiftUI

private let confirmPageBg = Color(hex: 0xEAEDED)
private let confirmCardBorder = Color(hex: 0xDDDDDD)
private let confirmTextDark = Color(hex: 0x0F1111)
private let confirmTextMuted = Color(hex: 0x555555)
private let confirmSuccessGreen = Color(hex: 0x067D62)
private let confirmAccentOrange = Color(hex: 0xFF9900)
private let confirmAmazonYellow = Color(hex: 0xFFD814)
private let confirmAmazonYellowBorder = Color(hex: 0xFCD200)
private let confirmTotalRed = Color(hex: 0xB12704)

struct OrderConfirmationScreen: View {
    let session: BuyerSession
    let orderId: String
    let onContinueShopping: () -> Void
    let onViewOrders: () -> Void
    let onContactSupport: () -> Void

    @State private var loading = true
    @State private var order: OrderDetailRow?
    @State private var cartCleared = false

    private let orderRepo = OrderRepository()
    private let cartRepo = CartRepository()

    var body: some View {
        ZStack {
            Group {
                if loading {
                    VStack(spacing: 12) {
                        ForEach(0..<3, id: \.self) { _ in BuyerCheckoutPanelSkeleton() }
                    }
                    .padding(16)
                } else if order == nil {
                    OrderConfirmationPendingView(onViewOrders: onViewOrders, onContactSupport: onContactSupport)
                } else if let order {
                    ScrollView {
                        VStack(spacing: 16) {
                            checkoutProgressSteps
                            successHeaderCard(email: session.email, order: order)
                            orderStatusCard(order: order)
                            orderDetailsCard(order: order)
                            actionButtons
                            helpCard
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .padding(.bottom, 88)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(confirmPageBg)
        }
        .task(id: orderId) {
            loading = true
            order = await orderRepo.fetchOrderDetail(session: session, orderId: orderId)
            loading = false
        }
        .task(id: order?.id) {
            guard order != nil, !cartCleared else { return }
            _ = await cartRepo.clearCart(session: session)
            await CheckoutPreferencesRepository.clear()
            cartCleared = true
        }
    }

    private var checkoutProgressSteps: some View {
        HStack {
            ForEach(["Cart", "Shipping", "Review & Pay"], id: \.self) { step in
                Text(step).font(.system(size: 12, weight: .medium)).foregroundStyle(Color(hex: 0x9CA3AF))
            }
            VStack(spacing: 2) {
                Text("✓ Confirmed").font(.system(size: 12, weight: .bold)).foregroundStyle(confirmSuccessGreen)
                Rectangle().fill(confirmSuccessGreen).frame(width: 48, height: 2)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func successHeaderCard(email: String, order: OrderDetailRow) -> some View {
        ConfirmationCardView {
            VStack(spacing: 16) {
                Circle()
                    .fill(Color(hex: 0xF0FAF0))
                    .frame(width: 80, height: 80)
                    .overlay(Image(systemName: "checkmark.circle.fill").font(.system(size: 40)).foregroundStyle(confirmSuccessGreen))
                Text(BuyerStrings.orderConfirmTitle).font(.system(size: 22, weight: .bold))
                Text(BuyerStrings.orderConfirmSubtitle)
                    .font(.system(size: 15))
                    .foregroundStyle(confirmTextMuted)
                    .multilineTextAlignment(.center)
                VStack(spacing: 2) {
                    Text(BuyerStrings.orderConfirmNumberLabel)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(confirmTextMuted)
                        .tracking(1)
                    Text(OrderDisplayUtils.displayOrderNumber(order: order))
                        .font(.system(size: 20, weight: .bold))
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color(hex: 0xFFFBF0))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(confirmAccentOrange, lineWidth: 2))
                Text(BuyerStrings.orderConfirmEmailSent(email))
                    .font(.system(size: 13))
                    .foregroundStyle(confirmTextMuted)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func orderStatusCard(order: OrderDetailRow) -> some View {
        let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
        return ConfirmationCardView {
            HStack {
                Text(BuyerStrings.orderConfirmStatusTitle).font(.system(size: 18, weight: .bold))
                Spacer()
                Text(OrderDisplayUtils.orderStatusLabel(status))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(OrderDisplayUtils.orderStatusColor(status))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(OrderDisplayUtils.orderStatusColor(status).opacity(0.15))
                    .clipShape(Capsule())
            }
            Text(BuyerStrings.orderConfirmPlacedOn(OrderDisplayUtils.formatOrderDateTime(order.createdAt)))
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
                .padding(.top, 8)
            ForEach(orderTimelineSteps(), id: \.key) { step in
                let currentIdx = orderTimelineSteps().firstIndex { $0.key == status } ?? 0
                let isActive = (orderTimelineSteps().firstIndex(where: { $0.key == step.key }) ?? 0) <= currentIdx
                OrderTimelineStepView(label: step.label, description: step.description, icon: step.icon, isActive: isActive)
            }
        }
    }

    private func orderDetailsCard(order: OrderDetailRow) -> some View {
        ConfirmationCardView {
            Text(BuyerStrings.orderConfirmDetailsTitle).font(.system(size: 17, weight: .bold))
            Text(BuyerStrings.items).font(.system(size: 15, weight: .semibold)).padding(.top, 16)
            ForEach(order.orderItems ?? [], id: \.id) { item in
                HStack(alignment: .top) {
                    VStack(alignment: .leading) {
                        Text(item.productName ?? "").font(.system(size: 14, weight: .semibold))
                        Text(BuyerStrings.orderConfirmQty(item.quantity ?? 1))
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: 0x6B7280))
                    }
                    Spacer()
                    if let lineTotal = item.customerLineTotal
                        ?? item.customerUnitPrice.map({ $0 * Double(item.quantity ?? 1) })
                        ?? item.price.map({ $0 * Double(item.quantity ?? 1) }) {
                        PriceText(price: lineTotal, currency: order.currency)
                    }
                }
                .padding(.vertical, 10)
                Divider()
            }
            Label(BuyerStrings.orderConfirmShippingAddress, systemImage: "mappin.and.ellipse")
                .font(.system(size: 15, weight: .semibold))
                .padding(.top, 8)
            shippingAddressBlock(order.shippingAddress)
            Label(BuyerStrings.orderConfirmPaymentInfo, systemImage: "creditcard")
                .font(.system(size: 15, weight: .semibold))
                .padding(.top, 16)
            paymentBlock(order: order)
            Divider().padding(.vertical, 16)
            HStack {
                Text(BuyerStrings.orderConfirmTotalPaid).font(.system(size: 17, weight: .bold))
                Spacer()
                if let total = order.totalAmount {
                    Text(formatCurrency(amount: total, currency: order.currency))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(confirmTotalRed)
                }
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 10) {
            Button(action: onViewOrders) {
                Label(BuyerStrings.orderConfirmViewOrders, systemImage: "bag")
                    .font(.system(size: 13, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(confirmAmazonYellow)
            .foregroundStyle(confirmTextDark)
            Button(BuyerStrings.orderConfirmContinueShopping, action: onContinueShopping)
                .font(.system(size: 13, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(confirmCardBorder))
        }
    }

    private var helpCard: some View {
        ConfirmationCardView {
            Text(BuyerStrings.orderConfirmNeedHelp).font(.system(size: 15, weight: .semibold))
            Text(BuyerStrings.orderConfirmNeedHelpBody)
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
                .padding(.vertical, 6)
            Button(action: onContactSupport) {
                Label(BuyerStrings.orderConfirmContactSupport, systemImage: "envelope")
                    .font(.system(size: 13, weight: .semibold))
            }
        }
    }

    @ViewBuilder
    private func shippingAddressBlock(_ address: [String: JSONValue]?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let name = OrderDisplayUtils.shippingField(address, keys: ["full_name"]) {
                Text(name).font(.system(size: 14, weight: .medium))
            }
            if let street = OrderDisplayUtils.shippingField(address, keys: ["street", "address_line1"]) {
                Text(street).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
            let cityLine = [OrderDisplayUtils.shippingField(address, keys: ["city"]), OrderDisplayUtils.shippingField(address, keys: ["state"]), OrderDisplayUtils.shippingField(address, keys: ["postalCode", "postal_code"])].compactMap { $0 }.joined(separator: ", ")
            if !cityLine.isEmpty { Text(cityLine).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280)) }
            if let country = OrderDisplayUtils.shippingField(address, keys: ["country"]) {
                Text(country).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
            if let phone = OrderDisplayUtils.shippingField(address, keys: ["phone"]) {
                Label(phone, systemImage: "phone").font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(hex: 0xF9FAFB))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xF3F4F6)))
    }

    private func paymentBlock(order: OrderDetailRow) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text(BuyerStrings.orderConfirmPaymentStatus).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
                Spacer()
                Text(order.paymentStatus?.isEmpty == false ? order.paymentStatus! : "pending")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x047857))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color(hex: 0xD1FAE5))
                    .clipShape(Capsule())
            }
            HStack {
                Text(BuyerStrings.orderConfirmTransactionId).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
                Spacer()
                Text(order.paymentIntentId.map { "****\($0.suffix(8))" } ?? "—")
                    .font(.system(size: 13, design: .monospaced))
            }
        }
        .padding(14)
        .background(Color(hex: 0xF9FAFB))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xF3F4F6)))
    }
}

private struct ConfirmationCardView<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(confirmCardBorder))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct OrderTimelineStepView: View {
    let label: String
    let description: String
    let icon: String
    let isActive: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(isActive ? Color(hex: 0xD1FAE5) : Color(hex: 0xF3F4F6))
                .frame(width: 40, height: 40)
                .overlay(Image(systemName: icon).foregroundStyle(isActive ? Color(hex: 0x059669) : Color(hex: 0x9CA3AF)))
            VStack(alignment: .leading) {
                Text(label).font(.system(size: 15, weight: .semibold)).foregroundStyle(isActive ? confirmTextDark : Color(hex: 0x9CA3AF))
                Text(description).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
        }
        .padding(.vertical, 8)
    }
}

private struct OrderConfirmationPendingView: View {
    let onViewOrders: () -> Void
    let onContactSupport: () -> Void

    var body: some View {
        ConfirmationCardView {
            Text(BuyerStrings.orderConfirmPendingTitle)
                .font(.system(size: 20, weight: .bold))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Text(BuyerStrings.orderConfirmPendingBody)
                .font(.system(size: 14))
                .foregroundStyle(confirmTextMuted)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 8) {
                Text(BuyerStrings.orderConfirmSupportTitle).font(.system(size: 12, weight: .semibold))
                Label("support@bzead.com", systemImage: "envelope")
                Label(BuyerStrings.orderConfirmSupportWhatsapp, systemImage: "phone")
            }
            .font(.system(size: 13))
            .foregroundStyle(Color(hex: 0x6B7280))
            .padding(12)
            .background(Color(hex: 0xF9FAFB))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xE5E7EB)))
            HStack(spacing: 10) {
                Button(BuyerStrings.orderConfirmGoOrders, action: onViewOrders)
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.borderedProminent)
                    .tint(confirmAmazonYellow)
                Button(BuyerStrings.orderConfirmContactSupport, action: onContactSupport)
                    .frame(maxWidth: .infinity)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(confirmCardBorder))
            }
        }
        .padding(24)
    }
}

private struct OrderTimelineStepData {
    let key: String
    let label: String
    let description: String
    let icon: String
}

private func orderTimelineSteps() -> [OrderTimelineStepData] {
    [
        OrderTimelineStepData(key: "pending", label: "Order Placed", description: "Your order has been received and is being processed", icon: "checkmark.circle"),
        OrderTimelineStepData(key: "accepted", label: "Accepted", description: "Seller has accepted your order", icon: "checkmark.circle"),
        OrderTimelineStepData(key: "processing", label: "Processing", description: "Your order is being prepared for shipment", icon: "bag"),
        OrderTimelineStepData(key: "packed", label: "Packed", description: "Your order has been packed and is ready to ship", icon: "bag"),
        OrderTimelineStepData(key: "shipped", label: "Shipped", description: "Your order has been handed to the courier", icon: "shippingbox"),
        OrderTimelineStepData(key: "in_transit", label: "In Transit", description: "Your order is on its way to you", icon: "shippingbox"),
        OrderTimelineStepData(key: "out_for_delivery", label: "Out for Delivery", description: "Your order is arriving today", icon: "mappin.and.ellipse"),
        OrderTimelineStepData(key: "delivered", label: "Delivered", description: "Your order has been delivered", icon: "checkmark.circle"),
    ]
}
