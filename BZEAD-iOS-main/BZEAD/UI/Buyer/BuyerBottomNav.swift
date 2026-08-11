import SwiftUI

struct BuyerBottomNav: View {
    let selectedTab: BuyerTab
    let badges: BuyerBadges
    let onTabSelected: (BuyerTab) -> Void

    private let activeColor = Color(hex: 0xD97706)
    private let inactiveColor = Color(hex: 0x6B7280)

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                navTab(
                    label: BuyerStrings.navHome,
                    systemImage: "house.fill",
                    selected: selectedTab == .home,
                    badgeCount: 0
                ) { onTabSelected(.home) }

                navTab(
                    label: BuyerStrings.navOrders,
                    systemImage: "bag",
                    selected: selectedTab == .orders,
                    badgeCount: 0
                ) { onTabSelected(.orders) }

                navTab(
                    label: BuyerStrings.navNotifications,
                    systemImage: "bell.fill",
                    selected: selectedTab == .notifications,
                    badgeCount: badges.notificationCount
                ) { onTabSelected(.notifications) }

                navTab(
                    label: BuyerStrings.navProfile,
                    systemImage: "person.fill",
                    selected: selectedTab == .profile,
                    badgeCount: 0
                ) { onTabSelected(.profile) }
            }
            .padding(.vertical, 6)
        }
        .frame(maxWidth: .infinity)
        .background(Color.white)
        .overlay(alignment: .top) {
            Rectangle().fill(Color(hex: 0xE5E7EB)).frame(height: 1)
        }
        .shadow(color: Color.black.opacity(0.05), radius: 4, y: -2)
    }

    private func navTab(
        label: String,
        systemImage: String,
        selected: Bool,
        badgeCount: Int,
        action: @escaping () -> Void
    ) -> some View {
        let color = selected ? activeColor : inactiveColor
        return Button(action: action) {
            VStack(spacing: 2) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: systemImage)
                        .font(.system(size: 18))
                        .foregroundStyle(color)
                        .frame(width: 24, height: 24)
                    if badgeCount > 0 {
                        Text(badgeCount > 99 ? "99+" : "\(badgeCount)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, badgeCount > 9 ? 3 : 0)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color(hex: 0xEF4444))
                            .clipShape(Circle())
                            .offset(x: 8, y: -4)
                    }
                }
                Text(label)
                    .font(.system(size: 10))
                    .foregroundStyle(color)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
