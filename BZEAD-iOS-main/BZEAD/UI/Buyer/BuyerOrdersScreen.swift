import SwiftUI

private let ordersHeaderBg = Color(hex: 0x0F172A)

struct BuyerOrdersScreen: View {
    let session: BuyerSession
    let onOrderClick: (String) -> Void
    var onNavigateCart: () -> Void = {}
    var onWriteReview: (String, String) -> Void = { _, _ in }
    var onRefreshBadges: () -> Void = {}

    @State private var loading = true
    @State private var orders: [BuyerOrder] = []
    @State private var refundRequests: [String: RefundRequestRow] = [:]
    @State private var searchQuery = ""
    @State private var selectedFilter: OrderFilterKey = .all
    @State private var actionLoadingId: String?
    @State private var copiedOrderId: String?
    @State private var toastMessage: String?

    @State private var cancelModal: (orderId: String, orderNumber: String)?
    @State private var cancelReason = ""
    @State private var returnModal: (orderId: String, orderNumber: String)?
    @State private var returnReason = ""
    @State private var returnDescription = ""
    @State private var refundModal: OrderRow?
    @State private var refundReason = ""

    private let repository = OrderRepository()
    private let cartRepo = CartRepository()
    private let productRepo = ProductRepository()

    private var filteredOrders: [BuyerOrder] {
        orders
            .filter { OrderDisplayUtils.matchesFilter(status: OrderDisplayUtils.normalizeOrderStatus($0.order.status), filter: selectedFilter) }
            .filter { buyerOrder in
                let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                guard !q.isEmpty else { return true }
                let order = buyerOrder.order
                if OrderDisplayUtils.displayOrderNumber(order: order).lowercased().contains(q) { return true }
                if order.trackingNumber?.lowercased().contains(q) == true { return true }
                return order.orderItems?.contains { $0.productName?.lowercased().contains(q) == true } ?? false
            }
    }

    private var filterCounts: [OrderFilterKey: Int] {
        Dictionary(uniqueKeysWithValues: OrderFilterKey.allCases.map { key in
            let count = key == .all
                ? orders.count
                : orders.filter { OrderDisplayUtils.matchesFilter(status: OrderDisplayUtils.normalizeOrderStatus($0.order.status), filter: key) }.count
            return (key, count)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            ordersSubHeader(orderCount: orders.count)
            ordersSearchBar
            ordersFilterRow

            Group {
                if loading {
                    BuyerListSkeleton(rows: 6)
                        .padding(16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if filteredOrders.isEmpty {
                    ordersEmptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(filteredOrders, id: \.order.id) { buyerOrder in
                                let order = buyerOrder.order
                                let status = OrderDisplayUtils.normalizeOrderStatus(order.status)
                                OrderCardView(
                                    buyerOrder: buyerOrder,
                                    normalizedStatus: status,
                                    refundRequest: refundRequests[order.id],
                                    actionLoading: actionLoadingId == order.id,
                                    copied: copiedOrderId == order.id,
                                    onOrderClick: { onOrderClick(order.id) },
                                    onCopyTracking: { tracking in
                                        UIPasteboard.general.string = tracking
                                        copiedOrderId = order.id
                                        toastMessage = BuyerStrings.ordersCopied
                                        Task {
                                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                                            if copiedOrderId == order.id { copiedOrderId = nil }
                                        }
                                    },
                                    onTrack: { onOrderClick(order.id) },
                                    onCancel: { cancelModal = (order.id, OrderDisplayUtils.displayOrderNumber(order: order)) },
                                    onReturn: { returnModal = (order.id, OrderDisplayUtils.displayOrderNumber(order: order)) },
                                    onReview: {
                                        if let item = order.orderItems?.first, let productId = item.productId {
                                            onWriteReview(productId, item.productName ?? BuyerStrings.ordersProductFallback)
                                        }
                                    },
                                    onInvoice: {
                                        ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)/orders/\(order.id)")
                                    },
                                    onRequestRefund: { refundModal = order; refundReason = "" },
                                    onBuyAgain: { Task { await buyAgain(order: order) } },
                                    onNeedHelp: {
                                        ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)/contact")
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                        .padding(.bottom, 88)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BuyerColors.cartPageBg)
        }
        .task(id: session.userId) { await reload() }
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
                    .onAppear {
                        Task {
                            try? await Task.sleep(nanoseconds: 2_500_000_000)
                            self.toastMessage = nil
                        }
                    }
            }
        }
        .sheet(item: Binding(
            get: { cancelModal.map { OrderModalItem(id: $0.orderId, label: $0.orderNumber) } },
            set: { cancelModal = $0.map { ($0.id, $0.label) } }
        )) { item in
            OrderReasonSheet(
                title: BuyerStrings.ordersCancelTitle,
                subtitle: BuyerStrings.ordersCancelOrderLabel(item.label),
                hint: BuyerStrings.ordersCancelHint,
                reason: $cancelReason,
                reasons: OrderDisplayUtils.cancelReasons(),
                confirmLabel: actionLoadingId == item.id ? BuyerStrings.ordersCancelling : BuyerStrings.ordersCancelConfirm,
                confirmColor: Color(hex: 0xDC2626),
                onDismiss: { cancelModal = nil; cancelReason = "" },
                onConfirm: { Task { await cancelOrder(orderId: item.id) } }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: Binding(
            get: { returnModal.map { OrderModalItem(id: $0.orderId, label: $0.orderNumber) } },
            set: { returnModal = $0.map { ($0.id, $0.label) } }
        )) { item in
            OrderReturnSheet(
                orderNumber: item.label,
                reason: $returnReason,
                description: $returnDescription,
                loading: actionLoadingId == item.id,
                onDismiss: { returnModal = nil; returnReason = ""; returnDescription = "" },
                onConfirm: { Task { await submitReturn(orderId: item.id) } }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: Binding(
            get: { refundModal != nil },
            set: { if !$0 { refundModal = nil; refundReason = "" } }
        )) {
            if let order = refundModal {
                OrderRefundSheet(
                    orderNumber: OrderDisplayUtils.displayOrderNumber(order: order),
                    amount: formatCurrency(amount: order.totalAmount ?? 0, currency: order.currency),
                    reason: $refundReason,
                    loading: actionLoadingId == order.id,
                    onDismiss: { refundModal = nil; refundReason = "" },
                    onConfirm: { Task { await submitRefund(orderId: order.id) } }
                )
                .presentationDetents([.medium])
            }
        }
    }

    private func ordersSubHeader(orderCount: Int) -> some View {
        HStack {
            HStack(spacing: 12) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.white.opacity(0.7))
                Text(BuyerStrings.ordersMyOrders)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.white)
            }
            Spacer()
            Text(BuyerStrings.ordersCountLabel(orderCount))
                .font(.system(size: 12))
                .foregroundStyle(Color.white.opacity(0.6))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(ordersHeaderBg)
    }

    private var ordersSearchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0x9CA3AF))
            TextField(BuyerStrings.ordersSearchHint, text: $searchQuery)
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0x374151))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xE5E7EB)))
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }

    private var ordersFilterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(OrderFilterKey.allCases, id: \.self) { filter in
                    let active = selectedFilter == filter
                    let count = filterCounts[filter] ?? 0
                    Text("\(filter.rawValue) (\(count))")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(active ? Color.white : Color(hex: 0x4B5563))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(active ? BuyerColors.seeMoreBlue : Color.white)
                        .overlay(
                            Capsule().stroke(active ? Color.clear : Color(hex: 0xE5E7EB), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                        .onTapGesture { selectedFilter = filter }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    private var ordersEmptyState: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(Color(hex: 0xEFF6FF)).frame(width: 80, height: 80)
                Image(systemName: "bag")
                    .font(.system(size: 36))
                    .foregroundStyle(Color(hex: 0x60A5FA))
            }
            Text(emptyTitle)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color(hex: 0x111827))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }

    private var emptyTitle: String {
        if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return BuyerStrings.ordersNoMatch
        }
        if selectedFilter != .all {
            return BuyerStrings.ordersNoCategory
        }
        return BuyerStrings.ordersEmptyTitle
    }

    private func reload() async {
        loading = true
        let fetched = await repository.fetchOrders(session: session)
        orders = fetched
        let cancelledPaidIds = fetched
            .filter { OrderDisplayUtils.canRequestRefund(status: OrderDisplayUtils.normalizeOrderStatus($0.order.status), paymentStatus: $0.order.paymentStatus) }
            .map(\.order.id)
        refundRequests = await repository.fetchRefundRequests(session: session, orderIds: cancelledPaidIds)
        loading = false
    }

    private func cancelOrder(orderId: String) async {
        guard !cancelReason.isEmpty else { return }
        actionLoadingId = orderId
        let result = await repository.cancelOrder(session: session, orderId: orderId, reason: cancelReason)
        actionLoadingId = nil
        cancelModal = nil
        cancelReason = ""
        toastMessage = (try? result.get()) != nil ? BuyerStrings.ordersCancelSuccess : BuyerStrings.ordersCancelFailed
        if (try? result.get()) != nil { await reload() }
    }

    private func submitReturn(orderId: String) async {
        guard !returnReason.isEmpty else { return }
        actionLoadingId = orderId
        let result = await repository.requestReturn(
            session: session,
            orderId: orderId,
            reason: returnReason,
            description: returnDescription.isEmpty ? nil : returnDescription
        )
        actionLoadingId = nil
        returnModal = nil
        returnReason = ""
        returnDescription = ""
        toastMessage = (try? result.get()) != nil ? BuyerStrings.ordersReturnSuccess : BuyerStrings.ordersReturnFailed
        if (try? result.get()) != nil { await reload() }
    }

    private func submitRefund(orderId: String) async {
        guard !refundReason.isEmpty else { return }
        actionLoadingId = orderId
        let result = await repository.requestRefund(session: session, orderId: orderId, reason: refundReason)
        actionLoadingId = nil
        refundModal = nil
        refundReason = ""
        toastMessage = (try? result.get()) != nil ? BuyerStrings.ordersRefundSuccess : BuyerStrings.ordersRefundFailed
        if (try? result.get()) != nil { await reload() }
    }

    private func buyAgain(order: OrderRow) async {
        actionLoadingId = order.id
        let items = order.orderItems ?? []
        var added = 0
        var unavailable: [String] = []
        for item in items {
            guard let productId = item.productId else { continue }
            guard let product = await productRepo.fetchById(productRef: productId) else {
                unavailable.append(item.productName ?? productId)
                continue
            }
            let variant = item.variantInfo
            let result = await cartRepo.upsertItem(
                session: session,
                product: product,
                quantity: item.quantity ?? 1,
                selectedSize: variant?.size,
                selectedColor: variant?.color,
                selectedVariantSku: variant?.sku,
                unitPrice: item.price
            )
            if (try? result.get()) != nil {
                added += 1
            } else {
                unavailable.append(item.productName ?? productId)
            }
        }
        actionLoadingId = nil
        if added > 0 {
            onRefreshBadges()
            toastMessage = BuyerStrings.ordersBuyAgainSuccess
            onNavigateCart()
        } else if !unavailable.isEmpty {
            toastMessage = BuyerStrings.ordersBuyAgainUnavailable
        } else {
            toastMessage = BuyerStrings.ordersBuyAgainFailed
        }
    }
}

private struct OrderModalItem: Identifiable {
    let id: String
    let label: String
}

private struct OrderCardView: View {
    let buyerOrder: BuyerOrder
    let normalizedStatus: String
    let refundRequest: RefundRequestRow?
    let actionLoading: Bool
    let copied: Bool
    let onOrderClick: () -> Void
    let onCopyTracking: (String) -> Void
    let onTrack: () -> Void
    let onCancel: () -> Void
    let onReturn: () -> Void
    let onReview: () -> Void
    let onInvoice: () -> Void
    let onRequestRefund: () -> Void
    let onBuyAgain: () -> Void
    let onNeedHelp: () -> Void

    var body: some View {
        let order = buyerOrder.order
        let firstItem = order.orderItems?.first
        let extraItems = max(0, (order.orderItems?.count ?? 0) - 1)
        let statusStyle = OrderDisplayUtils.orderStatusStyle(normalizedStatus)

        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ORDER ID")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0x9CA3AF))
                        .tracking(0.5)
                    Text(OrderDisplayUtils.displayOrderNumber(order: order))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color(hex: 0x111827))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("DATE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0x9CA3AF))
                        .tracking(0.5)
                    Text(OrderDisplayUtils.formatOrderDate(order.createdAt))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: 0x111827))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 8)

            HStack(spacing: 8) {
                OrderStatusBadgeView(style: statusStyle)
                if OrderDisplayUtils.isPaidStatus(order.paymentStatus) {
                    Text(BuyerStrings.ordersPaid)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0x16A34A))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(hex: 0xF0FDF4))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)

            if let firstItem {
                Divider().padding(.horizontal, 16).background(Color(hex: 0xF9FAFB))
                HStack(alignment: .center, spacing: 12) {
                    AsyncImage(url: URL(string: firstItem.productImage ?? "")) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            Color(hex: 0xF3F4F6)
                                .overlay(Image(systemName: "bag").foregroundStyle(Color(hex: 0xD1D5DB)))
                        }
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(firstItem.productName ?? BuyerStrings.ordersProductFallback)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x111827))
                            .lineLimit(1)
                        Text(buildItemMeta(firstItem))
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: 0x6B7280))
                        if extraItems > 0 {
                            Text(BuyerStrings.ordersMoreItems(extraItems))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(BuyerColors.seeMoreBlue)
                        }
                        Text(BuyerStrings.ordersSeller(buyerOrder.sellerName.uppercased()))
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: 0x9CA3AF))
                    }
                    Spacer(minLength: 4)
                    Text(formatCurrency(amount: order.totalAmount ?? 0, currency: order.currency))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color(hex: 0x111827))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
                .onTapGesture(perform: onOrderClick)
            }

            if let carrier = order.shippingCarrier?.trimmingCharacters(in: .whitespacesAndNewlines), !carrier.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x6B7280))
                    Text(buildCarrierText(order))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color(hex: 0x374151))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: 0xF9FAFB))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }

            if let tracking = order.trackingNumber?.trimmingCharacters(in: .whitespacesAndNewlines),
               !tracking.isEmpty,
               OrderDisplayUtils.canTrack(normalizedStatus) {
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "shippingbox")
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: 0x3B82F6))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("TRACKING #")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Color(hex: 0x60A5FA))
                            Text(tracking)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Color(hex: 0x1D4ED8))
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    Text(copied ? BuyerStrings.ordersCopied : BuyerStrings.ordersCopy)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0x2563EB))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(hex: 0xDBEAFE))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onTapGesture { onCopyTracking(tracking) }
                }
                .padding(12)
                .background(Color(hex: 0xEFF6FF))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }

            if normalizedStatus == "delivered", let completedAt = order.completedAt, !completedAt.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x22C55E))
                    Text(BuyerStrings.ordersDeliveredOn(OrderDisplayUtils.formatDisplayDate(raw: completedAt)))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color(hex: 0x15803D))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: 0xF0FDF4))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }

            VStack(spacing: 8) {
                if OrderDisplayUtils.canTrack(normalizedStatus) {
                    OrderActionButtonView(
                        label: BuyerStrings.ordersTrack,
                        icon: "mappin.and.ellipse",
                        containerColor: Color(hex: 0x2563EB),
                        contentColor: Color.white,
                        borderColor: Color(hex: 0x2563EB),
                        action: onTrack,
                        enabled: !actionLoading
                    )
                }
                if OrderDisplayUtils.canCancel(normalizedStatus) {
                    OrderActionButtonView(
                        label: actionLoading ? BuyerStrings.ordersCancelling : BuyerStrings.ordersCancelConfirm,
                        icon: "xmark",
                        containerColor: Color(hex: 0xFEF2F2),
                        contentColor: Color(hex: 0xDC2626),
                        borderColor: Color(hex: 0xFECACA),
                        action: onCancel,
                        enabled: !actionLoading
                    )
                }
                if OrderDisplayUtils.canReview(normalizedStatus), firstItem != nil {
                    OrderActionButtonView(
                        label: BuyerStrings.ordersRateReview,
                        icon: "star.fill",
                        containerColor: Color(hex: 0xF59E0B),
                        contentColor: Color.white,
                        borderColor: Color(hex: 0xF59E0B),
                        action: onReview
                    )
                }
                if OrderDisplayUtils.canReturn(normalizedStatus) {
                    OrderActionButtonView(
                        label: actionLoading ? BuyerStrings.ordersReturnSubmitting : BuyerStrings.ordersReturnRefund,
                        icon: "shippingbox",
                        containerColor: Color(hex: 0xFFFFF7ED),
                        contentColor: Color(hex: 0xEA580C),
                        borderColor: Color(hex: 0xFED7AA),
                        action: onReturn,
                        enabled: !actionLoading
                    )
                }
                if OrderDisplayUtils.canInvoice(normalizedStatus) {
                    OrderActionButtonView(
                        label: BuyerStrings.ordersInvoice,
                        icon: "bag",
                        containerColor: Color.white,
                        contentColor: Color(hex: 0x374151),
                        borderColor: Color(hex: 0xE5E7EB),
                        action: onInvoice
                    )
                }
                if OrderDisplayUtils.canBuyAgain(normalizedStatus) {
                    OrderActionButtonView(
                        label: actionLoading ? BuyerStrings.ordersBuyAgainLoading : BuyerStrings.ordersBuyAgain,
                        icon: "cart",
                        containerColor: Color(hex: 0xEFF6FF),
                        contentColor: BuyerColors.seeMoreBlue,
                        borderColor: Color(hex: 0xBFDBFE),
                        action: onBuyAgain,
                        enabled: !actionLoading
                    )
                }
                if OrderDisplayUtils.canRequestRefund(status: normalizedStatus, paymentStatus: order.paymentStatus) {
                    if let refundRequest {
                        RefundStatusChipView(refund: refundRequest)
                    } else {
                        OrderActionButtonView(
                            label: BuyerStrings.ordersRequestRefund,
                            icon: "cart",
                            containerColor: Color(hex: 0x059669),
                            contentColor: Color.white,
                            borderColor: Color(hex: 0x059669),
                            action: onRequestRefund,
                            enabled: !actionLoading
                        )
                    }
                }
                OrderActionButtonView(
                    label: BuyerStrings.ordersNeedHelp,
                    icon: "questionmark.circle",
                    containerColor: Color.white,
                    contentColor: Color(hex: 0x4B5563),
                    borderColor: Color(hex: 0xE5E7EB),
                    action: onNeedHelp
                )
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: 0xF3F4F6)))
        .shadow(color: Color.black.opacity(0.06), radius: 4, y: 2)
    }
}

private struct OrderStatusBadgeView: View {
    let style: OrderStatusStyle

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(style.dot).frame(width: 8, height: 8)
            Text(style.label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(style.text)
                .tracking(0.5)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(style.bg)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(style.border))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct OrderActionButtonView: View {
    let label: String
    let icon: String
    let containerColor: Color
    let contentColor: Color
    let borderColor: Color
    let action: () -> Void
    var enabled: Bool = true

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(contentColor)
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(contentColor)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(containerColor)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(borderColor))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .opacity(enabled ? 1 : 0.6)
        .onTapGesture { if enabled { action() } }
    }
}

private struct RefundStatusChipView: View {
    let refund: RefundRequestRow

    var body: some View {
        let label: String = switch refund.status {
        case "paid": "Refund Paid · \(refund.refundNumber ?? "")"
        case "failed": "Refund Failed — contact support"
        case "accepted": "Refund Accepted · Processing"
        case "rejected": "Refund Rejected · \(refund.refundNumber ?? "")"
        default: "Refund Requested · \(refund.refundNumber ?? "")"
        }
        Text(label)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(Color(hex: 0x92400E))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(hex: 0xFFFBEB))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xFDE68A)))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct OrderReasonSheet: View {
    let title: String
    let subtitle: String
    let hint: String
    @Binding var reason: String
    let reasons: [String]
    let confirmLabel: String
    let confirmColor: Color
    let onDismiss: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(subtitle)
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x6B7280))
                    Text(hint)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(hex: 0x4B5563))
                    ForEach(reasons, id: \.self) { option in
                        Text(option)
                            .font(.system(size: 14, weight: reason == option ? .bold : .regular))
                            .foregroundStyle(reason == option ? BuyerColors.seeMoreBlue : Color(hex: 0x374151))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 8)
                            .background(reason == option ? Color(hex: 0xEFF6FF) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .onTapGesture { reason = option }
                    }
                }
                .padding(16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(BuyerStrings.cancel, action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(confirmLabel, action: onConfirm)
                        .foregroundStyle(confirmColor)
                        .disabled(reason.isEmpty)
                }
            }
        }
    }
}

struct OrderReturnSheet: View {
    let orderNumber: String
    @Binding var reason: String
    @Binding var description: String
    let loading: Bool
    let onDismiss: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(BuyerStrings.ordersCancelOrderLabel(orderNumber))
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x6B7280))
                    ForEach(OrderDisplayUtils.returnReasons(), id: \.self) { option in
                        Text(option)
                            .font(.system(size: 13, weight: reason == option ? .bold : .regular))
                            .foregroundStyle(reason == option ? Color(hex: 0xEA580C) : Color(hex: 0x374151))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                            .onTapGesture { reason = option }
                    }
                    BuyerTextField(label: BuyerStrings.ordersReturnDetails, text: $description)
                }
                .padding(16)
            }
            .navigationTitle(BuyerStrings.ordersReturnTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(BuyerStrings.cancel, action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(loading ? BuyerStrings.ordersReturnSubmitting : BuyerStrings.ordersReturnSubmit, action: onConfirm)
                        .disabled(reason.isEmpty || loading)
                }
            }
        }
    }
}

struct OrderRefundSheet: View {
    let orderNumber: String
    let amount: String
    @Binding var reason: String
    let loading: Bool
    let onDismiss: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(BuyerStrings.ordersCancelOrderLabel(orderNumber))
                    .font(.system(size: 14))
                Text(BuyerStrings.ordersRefundAmount(amount))
                    .font(.system(size: 12))
                    .foregroundStyle(Color(hex: 0x6B7280))
                BuyerTextField(label: BuyerStrings.ordersRefundReason, text: $reason)
                Spacer()
            }
            .padding(16)
            .navigationTitle(BuyerStrings.ordersRefundTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(BuyerStrings.cancel, action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(loading ? BuyerStrings.ordersRefundSubmitting : BuyerStrings.ordersRefundSubmit, action: onConfirm)
                        .disabled(reason.isEmpty || loading)
                }
            }
        }
    }
}

private func buildItemMeta(_ item: OrderItemRow) -> String {
    let qty = item.quantity ?? 1
    var parts = ["Qty: \(qty)"]
    if let size = item.variantInfo?.size, !size.isEmpty { parts.append("Size: \(size)") }
    if let color = item.variantInfo?.color, !color.isEmpty { parts.append(color) }
    return parts.joined(separator: " - ")
}

private func buildCarrierText(_ order: OrderRow) -> String {
    var text = order.shippingCarrier ?? ""
    if let level = order.shippingServiceLevel?.trimmingCharacters(in: .whitespacesAndNewlines), !level.isEmpty {
        text += " · \(level)"
    }
    if let days = order.expectedDeliveryDays {
        text += " · Est. \(days) days"
    }
    return text
}
