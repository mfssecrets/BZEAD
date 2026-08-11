import SwiftUI

private let orderAmber = Color(hex: 0xF59E0B)
private let orderPageBg = Color(hex: 0xF9FAFB)

private enum TrackingStepState {
    case done, current, pending, cancelled
}

private struct TrackingStep {
    let label: String
    let subtitle: String?
    let state: TrackingStepState
}

struct OrderDetailScreen: View {
    let session: BuyerSession
    let orderId: String
    let onBack: () -> Void
    let onWriteReview: (String, String) -> Void

    @State private var loading = true
    @State private var order: OrderDetailRow?
    @State private var tab = 1
    @State private var showCancel = false
    @State private var showReturn = false
    @State private var cancelReason = ""
    @State private var returnReason = ""
    @State private var returnDescription = ""
    @State private var toastMessage: String?

    private let repo = OrderRepository()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left").foregroundStyle(orderAmber)
                }
                VStack(alignment: .leading) {
                    Text(BuyerStrings.orderDetail).font(.system(size: 18, weight: .bold))
                    Text(BuyerStrings.orderDetailBack)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(orderAmber)
                        .onTapGesture(perform: onBack)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white)
            Divider()

            Group {
                if loading {
                    BuyerDetailSkeleton().padding(16)
                } else if order == nil {
                    VStack(spacing: 12) {
                        Image(systemName: "bag").font(.system(size: 48)).foregroundStyle(Color(hex: 0x9CA3AF))
                        Text(BuyerStrings.orderNotFound).font(.system(size: 16, weight: .bold))
                        Text(BuyerStrings.orderDetailBack).foregroundStyle(orderAmber).onTapGesture(perform: onBack)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let order {
                    ScrollView {
                        VStack(spacing: 12) {
                            orderSummaryCard(order: order)
                            orderTabs
                            switch tab {
                            case 0: OrderItemsTabView(order: order, onWriteReview: onWriteReview)
                            case 1: OrderTrackingTabView(order: order)
                            default: OrderInvoiceTabView(order: order)
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(orderPageBg)
        }
        .overlay(alignment: .bottom) {
            if let toastMessage {
                Text(toastMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.85))
                    .clipShape(Capsule())
                    .padding(.bottom, 24)
            }
        }
        .task(id: orderId) { await reload() }
        .sheet(isPresented: $showCancel) {
            if let order {
                OrderReasonSheet(
                    title: BuyerStrings.ordersCancelTitle,
                    subtitle: BuyerStrings.ordersCancelOrderLabel(OrderDisplayUtils.displayOrderNumber(order: order)),
                    hint: BuyerStrings.ordersCancelHint,
                    reason: $cancelReason,
                    reasons: OrderDisplayUtils.cancelReasons(),
                    confirmLabel: BuyerStrings.ordersCancelConfirm,
                    confirmColor: Color(hex: 0xDC2626),
                    onDismiss: { showCancel = false; cancelReason = "" },
                    onConfirm: { Task { await cancelOrder() } }
                )
                .presentationDetents([.medium, .large])
            }
        }
        .sheet(isPresented: $showReturn) {
            if let order {
                OrderReturnSheet(
                    orderNumber: OrderDisplayUtils.displayOrderNumber(order: order),
                    reason: $returnReason,
                    description: $returnDescription,
                    loading: false,
                    onDismiss: { showReturn = false; returnReason = ""; returnDescription = "" },
                    onConfirm: { Task { await submitReturn() } }
                )
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func orderSummaryCard(order: OrderDetailRow) -> some View {
        let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
        return VStack(alignment: .leading, spacing: 8) {
            Text(OrderDisplayUtils.displayOrderNumber(order: order)).font(.system(size: 18, weight: .bold))
            Text(OrderDisplayUtils.orderStatusLabel(status))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(OrderDisplayUtils.orderStatusColor(status))
            Text(BuyerStrings.orderDetailPlaced(OrderDisplayUtils.formatDisplayDate(raw: order.createdAt, pattern: "dd MMM yyyy, HH:mm")))
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
            if let total = order.totalAmount {
                PriceText(price: total, currency: order.currency)
            }
            HStack(spacing: 8) {
                if OrderDisplayUtils.canCancel(status) {
                    actionChip(BuyerStrings.ordersCancelConfirm, color: Color(hex: 0xDC2626), bg: Color(hex: 0xFEF2F2)) { showCancel = true }
                }
                if OrderDisplayUtils.canReturn(status) {
                    actionChip(BuyerStrings.ordersReturnRefund, color: Color(hex: 0xEA580C), bg: Color(hex: 0xFFFFF7ED)) { showReturn = true }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private var orderTabs: some View {
        HStack(spacing: 0) {
            ForEach(Array([BuyerStrings.orderDetailTabItems, BuyerStrings.orderDetailTabTracking, BuyerStrings.orderDetailTabInvoice].enumerated()), id: \.offset) { index, label in
                VStack(spacing: 6) {
                    Text(label)
                        .font(.system(size: 13, weight: tab == index ? .bold : .regular))
                        .foregroundStyle(tab == index ? orderAmber : Color(hex: 0x6B7280))
                    if tab == index {
                        Rectangle().fill(orderAmber).frame(width: 40, height: 2)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .onTapGesture { tab = index }
            }
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func actionChip(_ label: String, color: Color, bg: Color, action: @escaping () -> Void) -> some View {
        Text(label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bg)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .onTapGesture(perform: action)
    }

    private func reload() async {
        loading = true
        order = await repo.fetchOrderDetail(session: session, orderId: orderId)
        loading = false
    }

    private func cancelOrder() async {
        guard !cancelReason.isEmpty else { return }
        let result = await repo.cancelOrder(session: session, orderId: orderId, reason: cancelReason)
        showCancel = false
        cancelReason = ""
        if case .success = result {
            toastMessage = BuyerStrings.ordersCancelSuccess
            await reload()
        } else {
            toastMessage = BuyerStrings.ordersCancelFailed
        }
    }

    private func submitReturn() async {
        guard !returnReason.isEmpty else { return }
        let result = await repo.requestReturn(
            session: session,
            orderId: orderId,
            reason: returnReason,
            description: returnDescription.isEmpty ? nil : returnDescription
        )
        showReturn = false
        returnReason = ""
        returnDescription = ""
        toastMessage = (try? result.get()) != nil ? BuyerStrings.ordersReturnSuccess : BuyerStrings.ordersReturnFailed
        await reload()
    }
}

private struct OrderItemsTabView: View {
    let order: OrderDetailRow
    let onWriteReview: (String, String) -> Void

    var body: some View {
        let items = order.orderItems ?? []
        let subtotal = items.reduce(0.0) { partial, item in
            partial + (item.customerLineTotal
                ?? item.customerUnitPrice.map { $0 * Double(item.quantity ?? 1) }
                ?? item.price.map { $0 * Double(item.quantity ?? 1) }
                ?? 0)
        }
        let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
        VStack(alignment: .leading, spacing: 12) {
            if items.isEmpty {
                Text(BuyerStrings.orderDetailNoItems).foregroundStyle(Color(hex: 0x6B7280))
            } else {
                ForEach(items, id: \.id) { item in
                    OrderItemRowView(item: item, order: order, status: status, onWriteReview: onWriteReview)
                }
            }
            Divider()
            summaryRow(BuyerStrings.orderDetailSubtotal, formatCurrency(amount: subtotal, currency: order.currency))
            if let shipping = order.shippingCharge {
                summaryRow(BuyerStrings.checkoutShippingTitle, shipping <= 0 ? BuyerStrings.checkoutShippingFree : formatCurrency(amount: shipping, currency: order.currency))
            }
            if let fee = order.platformFee, fee > 0 {
                summaryRow(BuyerStrings.orderDetailPlatformFee, formatCurrency(amount: fee, currency: order.currency))
            }
            if let total = order.totalAmount {
                summaryRow(BuyerStrings.orderDetailTotal, formatCurrency(amount: total, currency: order.currency), bold: true)
            }
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private func summaryRow(_ label: String, _ value: String, bold: Bool = false) -> some View {
        HStack {
            Text(label).foregroundStyle(Color(hex: 0x6B7280))
            Spacer()
            Text(value).font(.system(size: bold ? 16 : 13, weight: bold ? .bold : .medium))
        }
        .padding(.vertical, 4)
    }
}

private struct OrderItemRowView: View {
    let item: OrderItemRow
    let order: OrderDetailRow
    let status: String
    let onWriteReview: (String, String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: URL(string: item.productImage ?? "")) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { Color(hex: 0xF3F4F6) }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.productName ?? "").font(.system(size: 15, weight: .semibold))
                Text(BuyerStrings.orderConfirmQty(item.quantity ?? 1)).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
                if let size = item.variantInfo?.size { Text("Size: \(size)").font(.system(size: 12)).foregroundStyle(Color(hex: 0x9CA3AF)) }
                if let color = item.variantInfo?.color { Text("Color: \(color)").font(.system(size: 12)).foregroundStyle(Color(hex: 0x9CA3AF)) }
                if let line = item.customerLineTotal ?? item.customerUnitPrice.map({ $0 * Double(item.quantity ?? 1) }) ?? item.price.map({ $0 * Double(item.quantity ?? 1) }) {
                    PriceText(price: line, currency: order.currency)
                }
                if status == "delivered", let productId = item.productId {
                    Text(BuyerStrings.orderDetailWriteReview)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(orderAmber)
                        .onTapGesture { onWriteReview(productId, item.productName ?? "") }
                }
            }
        }
        .padding(.vertical, 8)
        Divider()
    }
}

struct OrderTrackingTabView: View {
    let order: OrderDetailRow

    var body: some View {
        let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
        let steps = buildTrackingSteps(status: status, createdAt: order.createdAt)
        let currentIndex = steps.lastIndex(where: { $0.state == .current || $0.state == .done }) ?? 0

        VStack(spacing: 12) {
            TrackingEtaBannerView(status: status)
            orderHeaderCard
            VStack(alignment: .leading, spacing: 12) {
                Text(BuyerStrings.orderTrackingCurrent).font(.system(size: 15, weight: .bold))
                if status == "cancelled" {
                    Text(BuyerStrings.orderTrackingCancelled)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xDC2626))
                } else if steps.isEmpty {
                    Text(BuyerStrings.orderDetailNoTracking).foregroundStyle(Color(hex: 0x6B7280))
                } else {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        TrackingTimelineRowView(step: step, isLast: index == steps.count - 1, lineBelowActive: index < currentIndex)
                    }
                }
            }
            .padding(16)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))

            if order.trackingNumber != nil || order.shippingCarrier != nil {
                shipmentDetailsCard
            }
            if hasAddress {
                deliveryAddressCard
            }
        }
    }

    private var orderHeaderCard: some View {
        let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
        let firstItem = order.orderItems?.first
        return HStack(spacing: 12) {
            if let image = firstItem?.productImage {
                AsyncImage(url: URL(string: image)) { phase in
                    if let img = phase.image { img.resizable().scaledToFill() } else { Color(hex: 0xF3F4F6) }
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading) {
                Text(OrderDisplayUtils.displayOrderNumber(order: order)).font(.system(size: 16, weight: .bold))
                Text(OrderDisplayUtils.orderStatusLabel(status))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(OrderDisplayUtils.orderStatusColor(status))
                let itemCount = order.orderItems?.reduce(0) { $0 + ($1.quantity ?? 1) } ?? 0
                if let total = order.totalAmount {
                    Text("\(itemCount) \(itemCount == 1 ? "item" : "items") · \(formatCurrency(amount: total, currency: order.currency))")
                        .font(.system(size: 12))
                        .foregroundStyle(Color(hex: 0x6B7280))
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private var shipmentDetailsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(BuyerStrings.orderTrackingShipmentDetails).font(.system(size: 15, weight: .bold))
            if let carrier = order.shippingCarrier {
                Text(BuyerStrings.orderTrackingCourier).font(.system(size: 12)).foregroundStyle(Color(hex: 0x6B7280))
                Text(carrier).font(.system(size: 14, weight: .semibold))
            }
            if let tracking = order.trackingNumber {
                Text(BuyerStrings.orderTrackingAwb).font(.system(size: 12)).foregroundStyle(Color(hex: 0x6B7280))
                HStack {
                    Text(tracking).font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Text(BuyerStrings.orderTrackingCopy)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color(hex: 0x2874F0))
                        .onTapGesture {
                            UIPasteboard.general.string = tracking
                        }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private var hasAddress: Bool {
        OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["full_name"]) != nil
            || OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["street", "address_line1", "street_address_1"]) != nil
    }

    private var deliveryAddressCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(BuyerStrings.orderTrackingDeliveryAddress, systemImage: "mappin.and.ellipse")
                .font(.system(size: 15, weight: .bold))
            if let name = OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["full_name"]) {
                Text(name).font(.system(size: 14, weight: .semibold))
            }
            if let street = OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["street", "address_line1", "street_address_1"]) {
                Text(street).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
            let cityLine = [OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["city"]), OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["state"]), OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["postalCode", "postal_code"])].compactMap { $0 }.joined(separator: ", ")
            if !cityLine.isEmpty { Text(cityLine).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280)) }
            if let country = OrderDisplayUtils.shippingField(order.shippingAddress, keys: ["country"]) {
                Text(country).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }
}

private struct TrackingEtaBannerView: View {
    let status: String

    var body: some View {
        let (bg, text, iconTint): (Color, String, Color) = switch status {
        case "delivered": (Color(hex: 0x16A34A), BuyerStrings.orderTrackingStepDelivered, Color.white)
        case "cancelled": (Color(hex: 0xFEE2E2), BuyerStrings.orderTrackingCancelled, Color(hex: 0xDC2626))
        case "shipped", "in_transit", "out_for_delivery": (Color(hex: 0x16A34A), BuyerStrings.orderTrackingOnTheWay, Color.white)
        default: (Color(hex: 0xEFF6FF), BuyerStrings.orderTrackingPreparing, Color(hex: 0x2563EB))
        }
        HStack(spacing: 10) {
            Image(systemName: "shippingbox").foregroundStyle(iconTint)
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(status == "cancelled" ? Color(hex: 0xDC2626) : (["shipped", "in_transit", "out_for_delivery", "delivered"].contains(status) ? Color.white : Color(hex: 0x1E40AF)))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct TrackingTimelineRowView: View {
    let step: TrackingStep
    let isLast: Bool
    let lineBelowActive: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .fill(circleFill)
                        .frame(width: 24, height: 24)
                        .overlay(Circle().stroke(step.state == .pending ? Color(hex: 0xD1D5DB) : Color.clear, lineWidth: 2))
                    circleContent
                }
                if !isLast {
                    Rectangle()
                        .fill(lineBelowActive ? Color(hex: 0x16A34A) : Color(hex: 0xD1D5DB))
                        .frame(width: 2, height: 36)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.label)
                    .font(.system(size: 14, weight: step.state == .current ? .bold : .semibold))
                    .foregroundStyle(labelColor)
                if let subtitle = step.subtitle {
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(Color(hex: 0x6B7280))
                }
            }
            .padding(.bottom, isLast ? 0 : 16)
        }
    }

    @ViewBuilder
    private var circleContent: some View {
        switch step.state {
        case .done:
            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
        case .current:
            Circle().fill(Color.white).frame(width: 10, height: 10)
        case .cancelled:
            Text("!").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
        case .pending:
            EmptyView()
        }
    }

    private var circleFill: Color {
        switch step.state {
        case .done: return Color(hex: 0x16A34A)
        case .current: return Color(hex: 0x2874F0)
        case .cancelled: return Color(hex: 0xDC2626)
        case .pending: return Color.white
        }
    }

    private var labelColor: Color {
        switch step.state {
        case .current: return Color(hex: 0x2874F0)
        case .cancelled: return Color(hex: 0xDC2626)
        case .pending: return Color(hex: 0x9CA3AF)
        case .done: return Color(hex: 0x111827)
        }
    }
}

private struct OrderInvoiceTabView: View {
    let order: OrderDetailRow

    var body: some View {
        VStack(spacing: 8) {
            summaryRow(BuyerStrings.orderDetailInvoiceNumber, OrderDisplayUtils.displayOrderNumber(order: order))
            summaryRow(BuyerStrings.orderDetailPlacedLabel, OrderDisplayUtils.formatDisplayDate(raw: order.createdAt))
            if let method = order.paymentMethod { summaryRow(BuyerStrings.payment, method) }
            if let status = order.paymentStatus { summaryRow(BuyerStrings.orderConfirmPaymentStatus, status) }
            if let total = order.totalAmount {
                summaryRow(BuyerStrings.orderDetailTotal, formatCurrency(amount: total, currency: order.currency), bold: true)
            }
            Text(BuyerStrings.orderDetailInvoiceNote)
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x9CA3AF))
                .padding(.top, 12)
        }
        .padding(16)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private func summaryRow(_ label: String, _ value: String, bold: Bool = false) -> some View {
        HStack {
            Text(label).foregroundStyle(Color(hex: 0x6B7280))
            Spacer()
            Text(value).font(.system(size: bold ? 16 : 13, weight: bold ? .bold : .medium))
        }
        .padding(.vertical, 4)
    }
}

private func buildTrackingSteps(status: String, createdAt: String?) -> [TrackingStep] {
    if status == "cancelled" {
        return [
            TrackingStep(label: "Order placed", subtitle: OrderDisplayUtils.formatShortDate(createdAt), state: .done),
            TrackingStep(label: "Order cancelled", subtitle: nil, state: .cancelled),
        ]
    }
    let currentStep: Int = switch status {
    case "pending", "processing": 0
    case "accepted": 1
    case "packed", "shipped": 2
    case "in_transit": 3
    case "out_for_delivery": 4
    case "delivered": 5
    default: 0
    }
    let labels = ["Order placed", "Order confirmed", "Shipped", "In transit", "Out for delivery", "Delivered"]
    return labels.enumerated().map { index, label in
        let state: TrackingStepState = if index < currentStep {
            .done
        } else if index == currentStep && status != "delivered" {
            .current
        } else if index == currentStep && status == "delivered" {
            .done
        } else {
            .pending
        }
        let subtitle: String? = if index == 0 {
            OrderDisplayUtils.formatShortDate(createdAt)
        } else if index == currentStep && state == .current {
            "In progress"
        } else if index == 5 && status == "delivered" {
            "Completed"
        } else if index == 5 && state == .pending {
            "Expected soon"
        } else if state == .done {
            "Completed"
        } else {
            nil
        }
        return TrackingStep(label: label, subtitle: subtitle, state: state)
    }
}
