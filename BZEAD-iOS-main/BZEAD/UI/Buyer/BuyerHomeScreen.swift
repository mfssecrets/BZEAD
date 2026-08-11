import SwiftUI

struct BuyerHomeScreen: View {
    let session: BuyerSession
    let destinationCountry: String
    let displayCurrencyCode: String
    @Bindable var flyToCartController: FlyToCartController
    let onRefreshBadges: () -> Void
    let onProductClick: (String) -> Void
    let onCategoryClick: (String) -> Void
    let onSectionClick: (ProductSection) -> Void

    @State private var loading = true
    @State private var categories: [CategoryRow] = []
    @State private var heroBanners: [HomeBanner] = []
    @State private var adSlot1: [HomeBanner] = []
    @State private var adSlot2: [HomeBanner] = []
    @State private var adSlot3: [HomeBanner] = []
    @State private var featured = HomeSectionData(products: [])
    @State private var hotDeals = HomeSectionData(products: [])
    @State private var trending = HomeSectionData(products: [])
    @State private var publicPrices: [String: ResolvedPublicPrice] = [:]
    @State private var variantProductIds: Set<String> = []
    @State private var cartProductIds: Set<String> = []
    @State private var wishlistProductIds: Set<String> = []
    @State private var searchQuery = ""
    @State private var toastMessage: String?

    private let countryRepository = DestinationCountryRepository()
    private let locationRepository = LocationRepository()
    private let productRepo = ProductRepository()
    private let pricingRepo = ProductPricingRepository()
    private let cartRepo = CartRepository()
    private let wishlistRepo = WishlistRepository()
    private let homeRepo = HomeRepository()

    var body: some View {
        ZStack {
            if loading {
                BuyerHomePageSkeleton()
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        HomeSearchBar(query: $searchQuery, onSearch: {})
                        HomeCategoryBar(categories: categories, onCategoryClick: onCategoryClick)
                        HomeHeroCarousel(banners: heroBanners)

                        if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                            let filtered = (featured.products + hotDeals.products + trending.products)
                                .uniqued(by: \.id)
                                .filter { $0.name.lowercased().contains(query) }
                            HomeSectionGrid(
                                title: BuyerStrings.homeSearchResults,
                                products: filtered,
                                isSponsored: false,
                                section: nil,
                                publicPrices: publicPrices,
                                variantProductIds: variantProductIds,
                                cartProductIds: cartProductIds,
                                wishlistProductIds: wishlistProductIds,
                                onProductClick: onProductClick,
                                onSeeMore: {},
                                onWishlistToggle: handleWishlistToggle,
                                onAddToCart: handleAddToCart
                            )
                        } else {
                            sectionBlock(section: .featured, data: featured)
                            HomeAdBannerCarousel(banners: adSlot1)
                            sectionBlock(section: .hotDeals, data: hotDeals)
                            HomeAdBannerCarousel(banners: adSlot2)
                            sectionBlock(section: .trending, data: trending)
                            HomeAdBannerCarousel(banners: adSlot3)
                        }
                    }
                    .padding(.bottom, 16)
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
                .transition(.opacity)
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        self.toastMessage = nil
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .task { await loadHome() }
        .task(id: pricingRefreshKey) { await refreshPublicPrices() }
    }

    private var pricingRefreshKey: String {
        "\(destinationCountry)|\(displayCurrencyCode)|\(featured.products.count)|\(hotDeals.products.count)|\(trending.products.count)"
    }

    @ViewBuilder
    private func sectionBlock(section: ProductSection, data: HomeSectionData) -> some View {
        let meta = productRepo.sectionMeta(section)
        let title = [meta.icon, meta.title].compactMap { $0 }.joined(separator: " ")
        HomeSectionGrid(
            title: title,
            products: data.products,
            isSponsored: data.isSponsored,
            section: section,
            publicPrices: publicPrices,
            variantProductIds: variantProductIds,
            cartProductIds: cartProductIds,
            wishlistProductIds: wishlistProductIds,
            onProductClick: onProductClick,
            onSeeMore: { onSectionClick(section) },
            onWishlistToggle: handleWishlistToggle,
            onAddToCart: handleAddToCart
        )
    }

    private func loadHome() async {
        loading = true
        let sections = await productRepo.loadHomeSections()
        featured = sections.0
        hotDeals = sections.1
        trending = sections.2
        categories = await homeRepo.fetchTopCategories()
        heroBanners = await homeRepo.fetchHeroBanners()
        adSlot1 = await homeRepo.fetchAdBanners(slot: 1)
        adSlot2 = await homeRepo.fetchAdBanners(slot: 2)
        adSlot3 = await homeRepo.fetchAdBanners(slot: 3)
        let allIds = (featured.products + hotDeals.products + trending.products).map(\.id).uniqued()
        variantProductIds = await productRepo.fetchVariantProductIds(allIds)
        await reloadCartAndWishlist()
        loading = false
    }

    private func refreshPublicPrices() async {
        let allProducts = featured.products + hotDeals.products + trending.products
        let allIds = allProducts.map(\.id).uniqued()
        guard !allIds.isEmpty else {
            publicPrices = [:]
            return
        }
        let candidates = await countryRepository.resolveCountryCandidates(session: session, locationRepository: locationRepository)
        publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: allIds,
            countryCandidates: candidates,
            productCurrencies: Dictionary(uniqueKeysWithValues: allProducts.map { ($0.id, $0.currency ?? "INR") })
        )
    }

    private func reloadCartAndWishlist() async {
        cartProductIds = Set(await cartRepo.fetchCart(session: session).map { $0.product.id })
        wishlistProductIds = Set(await wishlistRepo.fetchWishlist(session: session).map(\.id))
    }

    private func handleWishlistToggle(product: ProductRow, inList: Bool) {
        Task {
            if inList {
                _ = await wishlistRepo.remove(session: session, productId: product.id)
            } else {
                _ = await wishlistRepo.add(session: session, productId: product.id)
            }
            wishlistProductIds = Set(await wishlistRepo.fetchWishlist(session: session).map(\.id))
        }
    }

    private func handleAddToCart(product: ProductRow, center: CGPoint, size: CGSize, price: Double?) {
        flyToCartController.fly(
            request: FlyToCartRequest(imageUrl: product.imageUrl, startCenter: center, startSize: size),
            onDone: onRefreshBadges
        )
        Task {
            let result = await cartRepo.addProduct(session: session, productId: product.id, unitPrice: price)
            switch result {
            case .success:
                cartProductIds = Set(await cartRepo.fetchCart(session: session).map { $0.product.id })
                toastMessage = BuyerStrings.addedToCart
            case .failure:
                toastMessage = BuyerStrings.actionFailed
            }
        }
    }
}

private struct HomeSectionGrid: View {
    let title: String
    let products: [ProductRow]
    let isSponsored: Bool
    let section: ProductSection?
    let publicPrices: [String: ResolvedPublicPrice]
    let variantProductIds: Set<String>
    let cartProductIds: Set<String>
    let wishlistProductIds: Set<String>
    let onProductClick: (String) -> Void
    let onSeeMore: () -> Void
    let onWishlistToggle: (ProductRow, Bool) -> Void
    let onAddToCart: (ProductRow, CGPoint, CGSize, Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color(hex: 0x111827))
                    if isSponsored {
                        Text(BuyerStrings.homeSponsored)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color(hex: 0xDC2626))
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                }
                Spacer()
                if section != nil, !products.isEmpty {
                    Button(action: onSeeMore) {
                        HStack(spacing: 2) {
                            Text(BuyerStrings.seeMore)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(BuyerColors.seeMoreBlue)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(BuyerColors.seeMoreBlue)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            if products.isEmpty {
                Text(BuyerStrings.homeNoProducts)
                    .font(.system(size: 14))
                    .foregroundStyle(Color(hex: 0x9CA3AF))
                    .padding(16)
            } else {
                let rows = stride(from: 0, to: products.count, by: 2).map {
                    Array(products[$0..<min($0 + 2, products.count)])
                }
                VStack(spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, pair in
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(pair, id: \.id) { product in
                                let price = publicPrices[product.id]
                                HomeProductCard(
                                    product: product,
                                    publicPrice: price,
                                    inWishlist: wishlistProductIds.contains(product.id),
                                    inCart: cartProductIds.contains(product.id),
                                    hasVariants: variantProductIds.contains(product.id),
                                    onProductClick: { onProductClick(product.id) },
                                    onQuickView: { onProductClick(product.id) },
                                    onWishlistToggle: { onWishlistToggle(product, wishlistProductIds.contains(product.id)) },
                                    onAddToCart: { center, size in
                                        onAddToCart(product, center, size, price?.publicUnitPrice)
                                    }
                                )
                                .frame(maxWidth: .infinity)
                            }
                            if pair.count == 1 {
                                Color.clear.frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }
}

private struct BuyerHomePageSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BuyerSkeletonBox(cornerRadius: 0).frame(height: 56)
            BuyerSkeletonBox(cornerRadius: 0).frame(height: 40)
            BuyerSkeletonBox(cornerRadius: 0).frame(height: 160)
            BuyerProductGridSkeleton(count: 4)
        }
    }
}

private extension Array {
    func uniqued<ID: Hashable>(by keyPath: KeyPath<Element, ID>) -> [Element] {
        var seen = Set<ID>()
        return filter { seen.insert($0[keyPath: keyPath]).inserted }
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
