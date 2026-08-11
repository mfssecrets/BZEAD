import SwiftUI

private let pageBg = Color(hex: 0xEAEDED)
private let accentBlue = Color(hex: 0x2874F0)

private enum ReadFilter: CaseIterable {
    case all, unread, read
}

private enum CategoryFilter: CaseIterable {
    case all, orders, returns, offers
}

private let orderTypes: Set<String> = [
    "order_placed", "order_accepted", "order_processing", "order_packed",
    "order_shipped", "order_in_transit", "order_out_for_delivery", "order_delivered",
    "order_cancelled", "order_update",
]

private let returnTypes: Set<String> = [
    "return_requested", "return_approved", "return_rejected", "refund_requested",
    "refund_approved", "refund_rejected", "refund_processed",
]

private let offerTypes: Set<String> = ["info", "system", "promotion", "offer"]

struct BuyerNotificationsScreen: View {
    let session: BuyerSession
    let onOrderClick: (String) -> Void

    @State private var loading = true
    @State private var notifications: [NotificationRow] = []
    @State private var readFilter: ReadFilter = .all
    @State private var categoryFilter: CategoryFilter = .all

    private let repository = OrderRepository()

    private var filtered: [NotificationRow] {
        notifications.filter { n in
            let readOk: Bool = switch readFilter {
            case .all: true
            case .unread: !n.isRead
            case .read: n.isRead
            }
            let catOk: Bool = switch categoryFilter {
            case .all: true
            case .orders: orderTypes.contains(n.type)
            case .returns: returnTypes.contains(n.type)
            case .offers: offerTypes.contains(n.type)
            }
            return readOk && catOk
        }
    }

    private var unreadCount: Int { notifications.filter { !$0.isRead }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(BuyerStrings.notificationsTitle)
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                if unreadCount > 0 {
                    Text("\(unreadCount)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(accentBlue)
                        .clipShape(Capsule())
                }
                Button { Task { await refresh() } } label: {
                    Image(systemName: "arrow.clockwise")
                        .foregroundStyle(accentBlue)
                }
                Text(BuyerStrings.notificationsMarkAllRead)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(accentBlue)
                    .onTapGesture {
                        Task {
                            _ = await repository.markAllNotificationsRead(session: session)
                            await refresh()
                        }
                    }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white)

            Divider()

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ReadFilter.allCases, id: \.self) { filter in
                        filterChip(label: readFilterLabel(filter), selected: readFilter == filter) {
                            readFilter = filter
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(Color.white)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CategoryFilter.allCases, id: \.self) { filter in
                        filterChip(label: categoryFilterLabel(filter), selected: categoryFilter == filter) {
                            categoryFilter = filter
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(Color.white)

            Group {
                if loading {
                    BuyerListSkeleton(rows: 6)
                        .padding(16)
                } else if filtered.isEmpty {
                    VStack(spacing: 8) {
                        Text(BuyerStrings.notificationsEmptyTitle)
                            .font(.system(size: 18, weight: .bold))
                        Text(BuyerStrings.notificationsEmptyHint)
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: 0x6B7280))
                            .multilineTextAlignment(.center)
                        if readFilter != .all || categoryFilter != .all {
                            Text(BuyerStrings.notificationsClearFilters)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(accentBlue)
                                .padding(.top, 12)
                                .onTapGesture {
                                    readFilter = .all
                                    categoryFilter = .all
                                }
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(Array(filtered.enumerated()), id: \.element.id) { index, notification in
                                notificationRow(notification)
                                if index < filtered.count - 1 {
                                    Divider().background(Color(hex: 0xF3F4F6))
                                }
                            }
                        }
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
                        .padding(.horizontal, 12)
                        .padding(.top, 12)
                        .padding(.bottom, 88)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(pageBg)
        }
        .task(id: session.userId) { await refresh() }
    }

    private func refresh() async {
        loading = true
        notifications = await repository.fetchNotifications(session: session)
        loading = false
    }

    private func filterChip(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Text(label)
            .font(.system(size: 13, weight: selected ? .semibold : .regular))
            .foregroundStyle(selected ? Color.white : Color(hex: 0x374151))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(selected ? accentBlue : Color(hex: 0xF3F4F6))
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }

    private func notificationRow(_ notification: NotificationRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if !notification.isRead {
                RoundedRectangle(cornerRadius: 4)
                    .fill(accentBlue)
                    .frame(width: 8, height: 8)
                    .padding(.top, 6)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color(hex: 0x111827))
                Text(notification.message)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0x555555))
            }
            Spacer()
        }
        .padding(16)
        .background(notification.isRead ? Color.white : Color(hex: 0xF8FBFF))
        .contentShape(Rectangle())
        .onTapGesture {
            Task {
                if !notification.isRead {
                    _ = await repository.markNotificationRead(session: session, notificationId: notification.id)
                    await refresh()
                }
                if let orderId = notificationOrderId(notification) {
                    onOrderClick(orderId)
                }
            }
        }
    }

    private func notificationOrderId(_ notification: NotificationRow) -> String? {
        guard let meta = notification.metadata,
              case .string(let orderId) = meta["order_id"],
              !orderId.isEmpty else { return nil }
        return orderId
    }

    private func readFilterLabel(_ filter: ReadFilter) -> String {
        switch filter {
        case .all: return BuyerStrings.notificationsFilterAll
        case .unread: return BuyerStrings.notificationsFilterUnread
        case .read: return BuyerStrings.notificationsFilterRead
        }
    }

    private func categoryFilterLabel(_ filter: CategoryFilter) -> String {
        switch filter {
        case .all: return BuyerStrings.notificationsCatAll
        case .orders: return BuyerStrings.notificationsCatOrders
        case .returns: return BuyerStrings.notificationsCatReturns
        case .offers: return BuyerStrings.notificationsCatOffers
        }
    }
}
