import SwiftUI

private let headerBg = Color(hex: 0x1E293B)
private let gold = Color(hex: 0xD4AF37)
private let menuPanelBg = Color(hex: 0x243047)
private let amberBadge = Color(hex: 0xF59E0B)

struct BuyerTopBar: View {
    let badges: BuyerBadges
    let locationLabel: String
    var locationLoading: Bool = false
    let userDisplayName: String
    let currencyCode: String
    var currencyLoading: Bool = false
    let onCurrencyChange: (String) -> Void
    var cartBounceTrigger: Int = 0
    let onCartPositioned: (CGPoint) -> Void
    let onLogoClick: () -> Void
    let onLocationClick: () -> Void
    let onCartClick: () -> Void
    let onWishlistClick: () -> Void
    let onProfileClick: () -> Void
    let onOrdersClick: () -> Void
    let onNotificationsClick: () -> Void
    let onBecomeSellerClick: () -> Void
    let onHelpClick: () -> Void
    let onLogoutClick: () -> Void

    @State private var menuOpen = false
    @State private var showLogoutConfirm = false
    @State private var showSellerConfirm = false
    @State private var loggingOut = false
    @State private var cartScale: CGFloat = 1

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onLogoClick) {
                    Group {
                        if UIImage(named: "bzead_logo") != nil {
                            Image("bzead_logo")
                                .resizable()
                                .scaledToFit()
                        } else {
                            Text(BuyerStrings.landingBrand)
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(gold)
                        }
                    }
                    .frame(height: 40)
                }
                .buttonStyle(.plain)

                Spacer()

                HStack(spacing: 4) {
                    headerIconButton(action: onLocationClick) {
                        if locationLoading {
                            BuyerInlineSkeleton(width: 18, height: 18, cornerRadius: 9, color: gold.opacity(0.55))
                        } else {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 14))
                                .foregroundStyle(gold)
                        }
                    }
                    headerIconButton(action: onWishlistClick, badgeCount: badges.wishlistCount) {
                        Image(systemName: "heart")
                            .font(.system(size: 14))
                            .foregroundStyle(gold)
                    }
                    headerIconButton(action: onCartClick, badgeCount: badges.cartCount) {
                        Image(systemName: "cart")
                            .font(.system(size: 14))
                            .foregroundStyle(gold)
                    }
                    .scaleEffect(cartScale)
                    .background(
                        GeometryReader { geo in
                            Color.clear
                                .onAppear { reportCartPosition(geo) }
                                .onChange(of: geo.frame(in: .global)) { _, _ in reportCartPosition(geo) }
                        }
                    )
                    menuToggleButton
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 56)

            if menuOpen {
                mobileMenuPanel
            }
        }
        .frame(maxWidth: .infinity)
        .background(headerBg)
        .onChange(of: cartBounceTrigger) { _, newValue in
            guard newValue > 0 else { return }
            withAnimation(.spring(response: 0.25, dampingFraction: 0.45)) {
                cartScale = 1.25
            }
            withAnimation(.spring(response: 0.25, dampingFraction: 0.55).delay(0.12)) {
                cartScale = 1
            }
        }
        .alert(BuyerStrings.headerLogoutConfirmTitle, isPresented: $showLogoutConfirm) {
            Button(BuyerStrings.cancel, role: .cancel) {}
            Button(BuyerStrings.menuLogout, role: .destructive) {
                loggingOut = true
                showLogoutConfirm = false
                onLogoutClick()
            }
            .disabled(loggingOut)
        } message: {
            Text(BuyerStrings.headerLogoutConfirmBody)
        }
        .alert(BuyerStrings.headerSellerConfirmTitle, isPresented: $showSellerConfirm) {
            Button(BuyerStrings.cancel, role: .cancel) {}
            Button(BuyerStrings.continueLabel) {
                showSellerConfirm = false
                onBecomeSellerClick()
            }
        } message: {
            Text("\(BuyerStrings.headerSellerConfirmBody)\n\n\(BuyerStrings.headerSellerConfirmHint)")
        }
    }

    private var menuToggleButton: some View {
        Button {
            menuOpen.toggle()
        } label: {
            Image(systemName: menuOpen ? "xmark" : "line.3.horizontal")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(menuOpen ? gold : Color.white)
                .frame(width: 36, height: 36)
                .background(menuOpen ? Color.white.opacity(0.1) : Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(menuOpen ? gold : gold.opacity(0.7), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(BuyerStrings.headerMenu)
    }

    private var mobileMenuPanel: some View {
        MobileMenuPanel(
            locationLabel: locationLoading ? BuyerStrings.locationDetecting : locationLabel,
            locationLoading: locationLoading,
            userDisplayName: userDisplayName,
            currencyCode: currencyCode,
            currencyLoading: currencyLoading,
            onLocationClick: onLocationClick,
            onCurrencyChange: onCurrencyChange,
            onProfileClick: {
                menuOpen = false
                onProfileClick()
            },
            onOrdersClick: {
                menuOpen = false
                onOrdersClick()
            },
            onNotificationsClick: {
                menuOpen = false
                onNotificationsClick()
            },
            onLogoutClick: {
                menuOpen = false
                showLogoutConfirm = true
            },
            onBecomeSellerClick: {
                menuOpen = false
                showSellerConfirm = true
            },
            onHelpClick: {
                menuOpen = false
                onHelpClick()
            }
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func headerIconButton<Content: View>(
        action: @escaping () -> Void,
        badgeCount: Int = 0,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                content()
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.1))
                    .clipShape(Circle())
                if badgeCount > 0 {
                    Text(badgeCount > 99 ? "99+" : "\(badgeCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(amberBadge)
                        .clipShape(Capsule())
                        .offset(x: 6, y: -6)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func reportCartPosition(_ geo: GeometryProxy) {
        let frame = geo.frame(in: .global)
        onCartPositioned(CGPoint(x: frame.midX, y: frame.midY))
    }
}

private struct MobileMenuPanel: View {
    let locationLabel: String
    let locationLoading: Bool
    let userDisplayName: String
    let currencyCode: String
    let currencyLoading: Bool
    let onLocationClick: () -> Void
    let onCurrencyChange: (String) -> Void
    let onProfileClick: () -> Void
    let onOrdersClick: () -> Void
    let onNotificationsClick: () -> Void
    let onLogoutClick: () -> Void
    let onBecomeSellerClick: () -> Void
    let onHelpClick: () -> Void

    @State private var currencyExpanded = false

    private var selectedCurrency: SupportedCurrency {
        SupportedCurrencies.all.first(where: { $0.code == currencyCode }) ?? SupportedCurrencies.all[0]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onLocationClick) {
                HStack(spacing: 8) {
                    if locationLoading {
                        BuyerInlineSkeleton(width: 14, height: 14, cornerRadius: 7, color: gold.opacity(0.55))
                    } else {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 12))
                            .foregroundStyle(gold)
                    }
                    Text(locationLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white.opacity(0.9))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.05))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                Text(BuyerStrings.headerCurrencyLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.7))
                Menu {
                    ForEach(SupportedCurrencies.all, id: \.code) { curr in
                        Button("\(curr.symbol) \(curr.code)") {
                            onCurrencyChange(curr.code)
                        }
                    }
                } label: {
                    HStack {
                        Text("\(selectedCurrency.symbol) \(selectedCurrency.code)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x0F172A))
                        Spacer()
                        if currencyLoading {
                            BuyerInlineSkeleton(width: 14, height: 14)
                        } else {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12))
                                .foregroundStyle(Color(hex: 0x64748B))
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(height: 32)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .disabled(currencyLoading)
            }
            .padding(.top, 12)

            Text(userDisplayName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.white)
                .padding(.top, 12)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                Divider().background(Color.white.opacity(0.1))
                menuLinkRow(icon: "person.fill", label: BuyerStrings.navProfile, action: onProfileClick)
                menuLinkRow(icon: "bag", label: BuyerStrings.headerTrackOrder, action: onOrdersClick)
                menuLinkRow(icon: "bell.fill", label: BuyerStrings.navNotifications, action: onNotificationsClick)
                menuLinkRow(icon: "rectangle.portrait.and.arrow.right", label: BuyerStrings.menuLogout, action: onLogoutClick, danger: true)
                Divider().background(Color.white.opacity(0.1)).padding(.top, 4)
                menuLinkRow(icon: "storefront.fill", label: BuyerStrings.menuBecomeSeller, action: onBecomeSellerClick)
                menuLinkRow(icon: "headphones", label: BuyerStrings.menuHelp, action: onHelpClick)
            }
            .padding(.top, 4)
        }
        .padding(12)
        .background(menuPanelBg)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func menuLinkRow(icon: String, label: String, action: @escaping () -> Void, danger: Bool = false) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(danger ? Color(hex: 0xF87171) : gold)
                    .frame(width: 16)
                Text(label)
                    .font(.system(size: 14))
                    .foregroundStyle(danger ? Color(hex: 0xF87171) : Color.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.4))
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}
