import SwiftUI

private let secPageBg = Color.white
private let secBorderGray = Color(hex: 0xF3F4F6)
private let secTextPrimary = Color(hex: 0x111827)
private let secTextSecondary = Color(hex: 0x6B7280)
private let secAmber = Color(hex: 0xF59E0B)
private let secChipSelected = Color(hex: 0xF59E0B)

struct SectionProductsScreen: View {
    let session: BuyerSession
    let sectionSlug: String
    let destinationCountry: String
    let flyToCartController: FlyToCartController
    let onHome: () -> Void
    let onProductClick: (String) -> Void
    let onRefreshBadges: () -> Void

    @State private var loading = true
    @State private var products: [CategoryProductRow] = []
    @State private var categoryNames: [String: String] = [:]
    @State private var publicPrices: [String: ResolvedPublicPrice] = [:]
    @State private var variantIds: Set<String> = []
    @State private var cartProductIds: Set<String> = []
    @State private var wishlistProductIds: Set<String> = []
    @State private var showFilters = false
    @State private var filters = SectionFilterState()
    @State private var dynamicMax: Float = 200_000
    @State private var reloadTrigger = 0
    @State private var toastMessage: String?

    private let productRepo = ProductRepository()
    private let categoryRepo = CategoryRepository()
    private let pricingRepo = ProductPricingRepository()
    private let cartRepo = CartRepository()
    private let wishlistRepo = WishlistRepository()

    private var section: ProductSection? { productSectionFromSlug(sectionSlug) }
    private var meta: ProductSectionMeta? { section.map { productRepo.sectionMeta($0) } }

    private var availableCategories: [(String, String)] {
        SectionProductsLogic.availableCategories(products: products, categoryNames: categoryNames)
    }

    private var filtered: [CategoryProductRow] {
        SectionProductsLogic.filterAndSort(products: products, filters: filters)
    }

    private var activeFilters: Int {
        SectionProductsLogic.activeFilterCount(filters: filters, dynamicMax: dynamicMax)
    }

    var body: some View {
        ZStack {
            Group {
                if loading {
                    BuyerCatalogPageSkeleton()
                } else if section == nil || meta == nil {
                    sectionNotFoundState
                } else if let meta {
                    ScrollView {
                        VStack(spacing: 0) {
                            sectionPageHeader(meta: meta)
                            sectionSortFilterBar
                            if filtered.isEmpty {
                                sectionEmptyState(icon: meta.icon ?? "")
                            } else {
                                sectionProductGrid(products: filtered)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 16)
                            }
                        }
                        .padding(.bottom, 88)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(secPageBg)

            if showFilters, section != nil {
                SectionFilterDrawerView(
                    categories: availableCategories,
                    filters: $filters,
                    dynamicMax: dynamicMax,
                    onDismiss: { showFilters = false },
                    onReset: { filters = SectionFilterState(priceMax: dynamicMax) }
                )
            }

            if let toastMessage {
                VStack {
                    Spacer()
                    Text(toastMessage)
                        .font(.system(size: 14))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.black.opacity(0.85))
                        .clipShape(Capsule())
                        .padding(.bottom, 88)
                }
            }
        }
        .task(id: "\(sectionSlug)|\(reloadTrigger)") { await loadSection() }
        .task(id: "\(products.count)|\(destinationCountry)") { await loadPrices() }
        .task(id: "\(session.userId)|\(products.count)") { await loadCartWishlist() }
    }

    private func loadSection() async {
        loading = true
        guard let section else {
            products = []
            loading = false
            return
        }
        categoryNames = await categoryRepo.fetchCategoryNameMap()
        products = await productRepo.fetchSectionPageProducts(section: section, categoryNames: categoryNames)
        dynamicMax = SectionProductsLogic.dynamicPriceMax(products: products)
        filters = SectionFilterState(priceMax: dynamicMax)
        loading = false
    }

    private func loadPrices() async {
        guard !products.isEmpty else { publicPrices = [:]; return }
        let ids = products.map(\.id)
        variantIds = await productRepo.fetchVariantProductIds(productIds: ids)
        publicPrices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: ids,
            countryCandidates: [destinationCountry],
            productCurrencies: Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.currency ?? "INR") })
        )
    }

    private func loadCartWishlist() async {
        guard !products.isEmpty else { return }
        cartProductIds = Set((await cartRepo.fetchCart(session: session)).map(\.product.id))
        wishlistProductIds = Set((await wishlistRepo.fetchWishlist(session: session)).map(\.id))
    }

    private func sectionPageHeader(meta: ProductSectionMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left").font(.system(size: 14))
                        Text(BuyerStrings.categoryBackHome).font(.system(size: 13))
                    }
                    .foregroundStyle(secTextSecondary)
                    .onTapGesture(perform: onHome)
                    Text("\(meta.icon ?? "") \(meta.title)")
                        .font(.system(size: 20, weight: .bold))
                    if let subtitle = meta.subtitle, !subtitle.isEmpty {
                        Text(subtitle).font(.system(size: 13)).foregroundStyle(secTextSecondary)
                    }
                    Text(BuyerStrings.categoryProductCount(filtered.count))
                        .font(.system(size: 12))
                        .foregroundStyle(secTextSecondary)
                }
                Spacer()
                Button { showFilters = true } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .foregroundStyle(secAmber)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var sectionSortFilterBar: some View {
        HStack {
            Menu {
                ForEach(CategorySortBy.allCases, id: \.self) { option in
                    Button(sectionSortLabel(option)) { filters.sortBy = option }
                }
            } label: {
                Text(sectionSortLabel(filters.sortBy))
                    .font(.system(size: 13))
                    .foregroundStyle(secTextPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
            Spacer()
            Button { showFilters = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "line.3.horizontal.decrease.circle").foregroundStyle(secAmber)
                    Text(activeFilters > 0 ? BuyerStrings.sectionFiltersCount(activeFilters) : BuyerStrings.categoryFilters)
                        .font(.system(size: 13))
                        .foregroundStyle(secTextPrimary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Divider().background(secBorderGray) }
    }

    private func sectionProductGrid(products: [CategoryProductRow]) -> some View {
        VStack(spacing: 12) {
            ForEach(Array(stride(from: 0, to: products.count, by: 2)), id: \.self) { index in
                HStack(spacing: 12) {
                    sectionCard(products[index])
                    if index + 1 < products.count {
                        sectionCard(products[index + 1])
                    } else {
                        Spacer().frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func sectionCard(_ item: CategoryProductRow) -> some View {
        let product = item.toProductRow()
        return HomeProductCard(
            product: product,
            publicPrice: publicPrices[product.id],
            inWishlist: wishlistProductIds.contains(product.id),
            inCart: cartProductIds.contains(product.id),
            hasVariants: variantIds.contains(product.id),
            onProductClick: { onProductClick(product.id) },
            onQuickView: { onProductClick(product.id) },
            onWishlistToggle: { Task { await toggleWishlist(product) } },
            onAddToCart: { center, size in Task { await addToCart(product: product, center: center, size: size) } }
        )
        .frame(maxWidth: .infinity)
    }

    private func sectionEmptyState(icon: String) -> some View {
        VStack(spacing: 12) {
            Text(icon).font(.system(size: 36))
            Text(BuyerStrings.sectionNoProducts).font(.system(size: 18, weight: .semibold))
            Text(BuyerStrings.sectionNoProductsHint)
                .font(.system(size: 14))
                .foregroundStyle(secTextSecondary)
            if activeFilters > 0 {
                Text(BuyerStrings.categoryReset)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(secChipSelected)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture { filters = SectionFilterState(priceMax: dynamicMax) }
            }
        }
        .padding(32)
    }

    private var sectionNotFoundState: some View {
        VStack(spacing: 12) {
            Text(BuyerStrings.sectionNotFound).font(.system(size: 20, weight: .bold))
            Text(BuyerStrings.sectionNotFoundHint).font(.system(size: 14)).foregroundStyle(secTextSecondary)
            Text(BuyerStrings.categoryBackHome)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(secChipSelected)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture(perform: onHome)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func toggleWishlist(_ product: ProductRow) async {
        let inWishlist = wishlistProductIds.contains(product.id)
        let result: Result<Void, Error> = inWishlist
            ? await wishlistRepo.remove(session: session, productId: product.id)
            : await wishlistRepo.add(session: session, productId: product.id)
        if case .success = result {
            if inWishlist { wishlistProductIds.remove(product.id) } else { wishlistProductIds.insert(product.id) }
            onRefreshBadges()
        }
    }

    private func addToCart(product: ProductRow, center: CGPoint, size: CGSize) async {
        guard !variantIds.contains(product.id) else { return }
        flyToCartController.fly(request: FlyToCartRequest(imageUrl: product.imageUrl, startCenter: center, startSize: size)) {}
        let result = await cartRepo.addProduct(session: session, productId: product.id, unitPrice: publicPrices[product.id]?.publicUnitPrice)
        if case .success = result {
            cartProductIds.insert(product.id)
            onRefreshBadges()
            toastMessage = BuyerStrings.addedToCart
        } else {
            toastMessage = BuyerStrings.actionFailed
        }
    }

    private func sectionSortLabel(_ sort: CategorySortBy) -> String {
        switch sort {
        case .featured: return BuyerStrings.sectionSortFeatured
        case .priceLowHigh: return BuyerStrings.categorySortPriceLow
        case .priceHighLow: return BuyerStrings.categorySortPriceHigh
        case .rating: return BuyerStrings.categorySortRating
        case .newest: return BuyerStrings.categorySortNewest
        }
    }
}

private struct SectionFilterDrawerView: View {
    let categories: [(String, String)]
    @Binding var filters: SectionFilterState
    let dynamicMax: Float
    let onDismiss: () -> Void
    let onReset: () -> Void

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.4).ignoresSafeArea().onTapGesture(perform: onDismiss)
            VStack(spacing: 0) {
                HStack {
                    Text(BuyerStrings.categoryFilters).font(.system(size: 18, weight: .bold))
                    Spacer()
                    Button(action: onDismiss) { Image(systemName: "xmark") }
                }
                .padding(16)
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(BuyerStrings.sectionSortBy).font(.system(size: 14, weight: .semibold))
                        ForEach(CategorySortBy.allCases, id: \.self) { option in
                            sectionFilterChip(sectionSortLabel(option), selected: filters.sortBy == option) {
                                filters.sortBy = option
                            }
                        }
                        if categories.count > 1 {
                            Divider()
                            Text(BuyerStrings.sectionCategoryFilter).font(.system(size: 14, weight: .semibold))
                            sectionFilterChip(BuyerStrings.sectionAllCategories, selected: filters.category == nil) {
                                filters.category = nil
                            }
                            ForEach(categories, id: \.0) { id, name in
                                sectionFilterChip(name, selected: filters.category == id) {
                                    filters.category = filters.category == id ? nil : id
                                }
                            }
                        }
                        Divider()
                        Text(BuyerStrings.categoryPrice).font(.system(size: 14, weight: .semibold))
                        Text(BuyerStrings.categoryPriceMin(formatCurrency(amount: Double(filters.priceMin), currency: nil)))
                            .font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
                        Slider(value: Binding(get: { filters.priceMin }, set: { filters.priceMin = min($0, filters.priceMax) }), in: 0...dynamicMax).tint(secAmber)
                        Text(BuyerStrings.categoryPriceMax(formatCurrency(amount: Double(filters.priceMax), currency: nil)))
                            .font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
                        Slider(value: Binding(get: { filters.priceMax }, set: { filters.priceMax = max($0, filters.priceMin) }), in: 0...dynamicMax).tint(secAmber)
                        Divider()
                        Text(BuyerStrings.categoryCustomerReview).font(.system(size: 14, weight: .semibold))
                        ForEach([4, 3, 2, 1], id: \.self) { rating in
                            sectionFilterChip(String(repeating: "⭐", count: rating) + " \(rating)+ \(BuyerStrings.categoryRatingUp)", selected: filters.rating == rating) {
                                filters.rating = filters.rating == rating ? nil : rating
                            }
                        }
                        sectionFilterChip(BuyerStrings.categoryInStock, selected: filters.inStock) {
                            filters.inStock.toggle()
                        }
                    }
                    .padding(16)
                }
                HStack(spacing: 12) {
                    Button(BuyerStrings.categoryReset, action: onReset)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(secBorderGray))
                    Button(BuyerStrings.categoryShowResults, action: onDismiss)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .foregroundStyle(.white).background(secChipSelected)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(16)
            }
            .frame(width: 320).background(Color.white).frame(maxHeight: .infinity)
        }
    }

    private func sectionFilterChip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Text(label)
            .font(.system(size: 14))
            .foregroundStyle(selected ? Color.white : Color(hex: 0x6B7280))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(selected ? secChipSelected : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .onTapGesture(perform: action)
    }

    private func sectionSortLabel(_ sort: CategorySortBy) -> String {
        switch sort {
        case .featured: return BuyerStrings.sectionSortFeatured
        case .priceLowHigh: return BuyerStrings.categorySortPriceLow
        case .priceHighLow: return BuyerStrings.categorySortPriceHigh
        case .rating: return BuyerStrings.categorySortRating
        case .newest: return BuyerStrings.categorySortNewest
        }
    }
}
