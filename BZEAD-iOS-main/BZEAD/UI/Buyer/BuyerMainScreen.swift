import SwiftUI

struct BuyerMainScreen: View {
    let session: BuyerSession
    let onLogout: () -> Void
    var pendingOrderId: String?
    var openNotificationsTab: Bool = false

    @State private var selectedTab: BuyerTab = .home
    @State private var navStack: [BuyerNavRoute] = []
    @State private var checkoutAddress: UserAddressRow?
    @State private var checkoutShippingTier: ShippingTier = .standard
    @State private var badges = BuyerBadges()
    @State private var locationLabel = BuyerStrings.locationDetectHint
    @State private var locationLoading = false
    @State private var destinationCountry = DestinationCountryRepository.guestFallback
    @State private var userDisplayName: String
    @State private var currencyCode = "INR"
    @State private var currencyLoading = false
    @State private var cartBounceTrigger = 0
    @State private var locationPermissionAsked = false
    @State private var toastMessage: String?

    @State private var flyToCartController = FlyToCartController()

    private let badgeRepository = BuyerBadgeRepository()
    private let locationRepository = LocationRepository()
    private let countryRepository = DestinationCountryRepository()
    private let profileRepository = ProfileRepository()

    init(
        session: BuyerSession,
        onLogout: @escaping () -> Void,
        pendingOrderId: String? = nil,
        openNotificationsTab: Bool = false
    ) {
        self.session = session
        self.onLogout = onLogout
        self.pendingOrderId = pendingOrderId
        self.openNotificationsTab = openNotificationsTab
        let fallbackName = session.email.split(separator: "@").first.map(String.init) ?? "User"
        _userDisplayName = State(initialValue: fallbackName.isEmpty ? "User" : fallbackName)
    }

    private var currentRoute: BuyerNavRoute? {
        navStack.last
    }

    private var showBottomBar: Bool {
        guard let route = currentRoute else { return true }
        switch route {
        case .cart, .checkoutShipping, .checkoutReview, .checkoutPayment, .wishlist,
             .productDetail, .categoryProducts, .sectionProducts, .orderConfirmation,
             .orderDetail, .addresses, .writeReview, .settings:
            return true
        case .home:
            return true
        }
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                if currentRoute != .wishlist {
                    BuyerTopBar(
                        badges: badges,
                        locationLabel: locationLabel,
                        locationLoading: locationLoading,
                        userDisplayName: userDisplayName,
                        currencyCode: currencyCode,
                        currencyLoading: currencyLoading,
                        onCurrencyChange: { code in
                            Task {
                                currencyLoading = true
                                await CurrencyPreferencesRepository.save(code: code)
                                currencyCode = code
                                currencyLoading = false
                            }
                        },
                        cartBounceTrigger: cartBounceTrigger,
                        onCartPositioned: { flyToCartController.cartCenter = $0 },
                        onLogoClick: {
                            navStack = []
                            selectedTab = .home
                        },
                        onLocationClick: requestLocation,
                        onCartClick: { push(.cart) },
                        onWishlistClick: { push(.wishlist) },
                        onProfileClick: {
                            navStack = []
                            selectedTab = .profile
                        },
                        onOrdersClick: {
                            navStack = []
                            selectedTab = .orders
                        },
                        onNotificationsClick: {
                            navStack = []
                            selectedTab = .notifications
                        },
                        onBecomeSellerClick: {
                            ExternalBrowser.open(url: SupabaseConfig.sellerPortalUrl)
                        },
                        onHelpClick: {
                            ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)/contact")
                        },
                        onLogoutClick: onLogout
                    )
                }

                routeContent
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if showBottomBar {
                    BuyerBottomNav(
                        selectedTab: selectedTab,
                        badges: badges,
                        onTabSelected: { tab in
                            navStack = []
                            selectedTab = tab
                        }
                    )
                }
            }
            .background(Color.white)

            FlyToCartOverlay(controller: flyToCartController) {
                cartBounceTrigger += 1
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
                        .padding(.bottom, 80)
                }
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        self.toastMessage = nil
                    }
                }
            }
        }
        .task(id: session.userId) {
            await bootstrapSession()
        }
        .task(id: "\(pendingOrderId ?? "")|\(openNotificationsTab)") {
            if let pendingOrderId, !pendingOrderId.isEmpty {
                selectedTab = .orders
                navStack = [.orderDetail(orderId: pendingOrderId)]
            } else if openNotificationsTab {
                selectedTab = .notifications
                navStack = []
            }
            await requestPushPermissionIfNeeded()
        }
        .task(id: "\(navStack.count)|\(selectedTab)") {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await refreshBadges()
        }
    }

    @ViewBuilder
    private var routeContent: some View {
        switch currentRoute {
        case .categoryProducts(let categoryRef):
            CategoryProductsScreen(
                session: session,
                categoryRef: categoryRef,
                destinationCountry: destinationCountry,
                flyToCartController: flyToCartController,
                onHome: {
                    navStack = []
                    selectedTab = .home
                },
                onCategoryClick: { push(.categoryProducts(categoryRef: $0)) },
                onProductClick: { push(.productDetail(productId: $0)) },
                onRefreshBadges: { Task { await refreshBadges() } }
            )
        case .sectionProducts(let section):
            SectionProductsScreen(
                session: session,
                sectionSlug: section,
                destinationCountry: destinationCountry,
                flyToCartController: flyToCartController,
                onHome: {
                    navStack = []
                    selectedTab = .home
                },
                onProductClick: { push(.productDetail(productId: $0)) },
                onRefreshBadges: { Task { await refreshBadges() } }
            )
        case .productDetail(let productId):
            ProductDetailScreen(
                session: session,
                productId: productId,
                destinationCountry: destinationCountry,
                flyToCartController: flyToCartController,
                onRefreshBadges: { Task { await refreshBadges() } },
                onHome: {
                    navStack = []
                    selectedTab = .home
                },
                onProductClick: { push(.productDetail(productId: $0)) },
                onBuyNow: { push(.cart) },
                onWriteReview: { id, name in push(.writeReview(productId: id, productName: name)) },
                onManageAddresses: { push(.addresses) }
            )
        case .cart:
            BuyerCartScreen(
                session: session,
                destinationCountry: destinationCountry,
                displayCurrencyCode: currencyCode,
                onCheckout: { push(.checkoutShipping) },
                onProductClick: { push(.productDetail(productId: $0)) },
                onContinueShopping: {
                    pop()
                    selectedTab = .home
                }
            )
        case .wishlist:
            BuyerWishlistScreen(
                session: session,
                destinationCountry: destinationCountry,
                onBack: pop,
                onProductClick: { push(.productDetail(productId: $0)) },
                onContinueShopping: {
                    navStack = []
                    selectedTab = .home
                }
            )
        case .checkoutShipping:
            CheckoutShippingScreen(
                session: session,
                onBack: pop,
                onManageAddresses: { push(.addresses) },
                onContinue: { address in
                    checkoutAddress = address
                    checkoutShippingTier = .standard
                    push(.checkoutReview)
                }
            )
        case .checkoutReview:
            if let address = checkoutAddress {
                CheckoutReviewScreen(
                    session: session,
                    shippingAddress: address,
                    initialTier: checkoutShippingTier,
                    onChangeAddress: pop,
                    onBackToCart: {
                        navStack = navStack.filter {
                            switch $0 {
                            case .checkoutShipping, .checkoutReview, .checkoutPayment: return false
                            default: return true
                            }
                        }
                        checkoutAddress = nil
                        checkoutShippingTier = .standard
                        push(.cart)
                    },
                    onProceedToPayment: { tier in
                        checkoutShippingTier = tier
                        push(.checkoutPayment)
                    }
                )
            }
        case .checkoutPayment:
            if let address = checkoutAddress {
                CheckoutPaymentScreen(
                    session: session,
                    shippingAddress: address,
                    shippingTier: checkoutShippingTier,
                    onBack: pop,
                    onViewReview: {
                        navStack = navStack.filter {
                            if case .checkoutPayment = $0 { return false }
                            return true
                        }
                    },
                    onOrderPlaced: { orderId in
                        navStack = [.orderConfirmation(orderId: orderId)]
                        checkoutAddress = nil
                        checkoutShippingTier = .standard
                        Task { await refreshBadges() }
                    }
                )
            }
        case .orderConfirmation(let orderId):
            OrderConfirmationScreen(
                session: session,
                orderId: orderId,
                onContinueShopping: {
                    navStack = []
                    selectedTab = .home
                },
                onViewOrders: {
                    navStack = []
                    selectedTab = .orders
                },
                onContactSupport: {
                    ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)/contact")
                }
            )
        case .orderDetail(let orderId):
            OrderDetailScreen(
                session: session,
                orderId: orderId,
                onBack: pop,
                onWriteReview: { id, name in push(.writeReview(productId: id, productName: name)) }
            )
        case .settings:
            BuyerSettingsScreen(session: session, onBack: pop)
        case .addresses:
            BuyerAddressesScreen(session: session, onBack: pop)
        case .writeReview(let productId, let productName):
            WriteReviewScreen(
                session: session,
                productId: productId,
                productName: productName,
                destinationCountry: destinationCountry,
                onBack: pop,
                onSubmitted: pop
            )
        case .home, .none:
            tabContent
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .home:
            BuyerHomeScreen(
                session: session,
                destinationCountry: destinationCountry,
                displayCurrencyCode: currencyCode,
                flyToCartController: flyToCartController,
                onRefreshBadges: { Task { await refreshBadges() } },
                onProductClick: { push(.productDetail(productId: $0)) },
                onCategoryClick: { push(.categoryProducts(categoryRef: $0)) },
                onSectionClick: { push(.sectionProducts(section: $0.toSlug())) }
            )
        case .orders:
            BuyerOrdersScreen(
                session: session,
                onOrderClick: { push(.orderDetail(orderId: $0)) },
                onNavigateCart: { push(.cart) },
                onWriteReview: { id, name in push(.writeReview(productId: id, productName: name)) },
                onRefreshBadges: { Task { await refreshBadges() } }
            )
        case .notifications:
            BuyerNotificationsScreen(
                session: session,
                onOrderClick: { push(.orderDetail(orderId: $0)) }
            )
        case .profile:
            BuyerProfileScreen(
                session: session,
                onLogout: onLogout,
                onOpenSettings: { push(.settings) },
                onOpenAddresses: { push(.addresses) }
            )
        }
    }

    private func push(_ route: BuyerNavRoute) {
        navStack.append(route)
    }

    private func pop() {
        guard !navStack.isEmpty else { return }
        navStack.removeLast()
        let inCheckout = navStack.contains {
            switch $0 {
            case .checkoutShipping, .checkoutReview, .checkoutPayment: return true
            default: return false
            }
        }
        if !inCheckout {
            checkoutAddress = nil
            checkoutShippingTier = .standard
        }
    }

    private func refreshBadges() async {
        badges = await badgeRepository.fetchBadges(session: session)
    }

    private func refreshPricingCountry() async {
        destinationCountry = await countryRepository.resolveCountry(
            session: session,
            locationRepository: locationRepository
        )
        let label = await countryRepository.resolveLocationLabel(
            session: session,
            locationRepository: locationRepository
        )
        if !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            locationLabel = label
        }
    }

    private func bootstrapSession() async {
        await refreshBadges()
        currencyCode = await CurrencyPreferencesRepository.read()
        if let profile = await profileRepository.fetchProfile(session: session),
           let name = profile.fullName?.trimmingCharacters(in: .whitespacesAndNewlines),
           !name.isEmpty {
            userDisplayName = name
        }
        await refreshPricingCountry()
        if !locationRepository.hasPermission(), !locationPermissionAsked {
            locationPermissionAsked = true
            locationRepository.requestPermission()
        } else if locationRepository.hasPermission() {
            await detectLocation()
            await refreshPricingCountry()
        }
    }

    private func requestLocation() {
        if locationRepository.hasPermission() {
            Task {
                await detectLocation()
                await refreshPricingCountry()
            }
        } else {
            locationRepository.requestPermission()
            toastMessage = BuyerStrings.locationPermissionDenied
        }
    }

    private func detectLocation() async {
        locationLoading = true
        let result = await locationRepository.detectLocation()
        locationLoading = false
        if case .success(let location) = result {
            let label = location.label()
            if !label.isEmpty {
                locationLabel = label
            }
        }
    }

    private func requestPushPermissionIfNeeded() async {
        guard PushNotificationManager.isConfigured() else { return }
        _ = await PushNotificationManager.requestPermission(fallbackToSettings: true)
    }
}
