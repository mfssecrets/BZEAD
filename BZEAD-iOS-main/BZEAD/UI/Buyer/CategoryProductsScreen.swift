import SwiftUI

private let catPageBg = Color(hex: 0xF9FAFB)
private let catBorderGray = Color(hex: 0xE5E7EB)
private let catTextPrimary = Color(hex: 0x111827)
private let catTextSecondary = Color(hex: 0x6B7280)
private let catAmber = Color(hex: 0xF59E0B)
private let catChipSelected = Color(hex: 0x111827)

struct CategoryProductsScreen: View {
    let session: BuyerSession
    let categoryRef: String
    let destinationCountry: String
    let flyToCartController: FlyToCartController
    let onHome: () -> Void
    let onCategoryClick: (String) -> Void
    let onProductClick: (String) -> Void
    let onRefreshBadges: () -> Void

    @State private var loading = true
    @State private var fetchError: String?
    @State private var contextData: CategoryContext?
    @State private var products: [CategoryProductRow] = []
    @State private var publicPrices: [String: ResolvedPublicPrice] = [:]
    @State private var variantIds: Set<String> = []
    @State private var cartProductIds: Set<String> = []
    @State private var wishlistProductIds: Set<String> = []
    @State private var showFilters = false
    @State private var filters = CategoryFilterState()
    @State private var dynamicMax: Float = 100_000
    @State private var reloadTrigger = 0
    @State private var toastMessage: String?

    private let categoryRepo = CategoryRepository()
    private let productRepo = ProductRepository()
    private let pricingRepo = ProductPricingRepository()
    private let cartRepo = CartRepository()
    private let wishlistRepo = WishlistRepository()

    private var filtered: [CategoryProductRow] {
        guard let ctx = contextData else { return [] }
        return CategoryProductsLogic.filterAndSort(
            products: products,
            filters: filters,
            parentById: ctx.parentById,
            subcategories: ctx.children
        )
    }

    private var subCounts: [String: Int] {
        guard let ctx = contextData else { return [:] }
        return CategoryProductsLogic.subcategoryCounts(products: products, subcategories: ctx.children, parentById: ctx.parentById)
    }

    private var activeFilters: Int {
        CategoryProductsLogic.activeFilterCount(filters: filters, dynamicMax: dynamicMax)
    }

    private var showSectioned: Bool {
        filters.selectedSubcategory == nil && !(contextData?.children.isEmpty ?? true)
    }

    var body: some View {
        ZStack {
            Group {
                if loading {
                    BuyerCatalogPageSkeleton()
                } else if let error = fetchError {
                    categoryErrorState(message: error)
                } else if contextData == nil {
                    categoryNotFoundState
                } else if let ctx = contextData {
                    ScrollView {
                        VStack(spacing: 0) {
                            categoryBreadcrumb(ctx: ctx)
                            categoryHeader(name: ctx.category.name, resultCount: filtered.count)
                            if !ctx.children.isEmpty {
                                subcategoryChips(ctx: ctx)
                            }
                            sortFilterBar
                            if filtered.isEmpty {
                                emptyProductsState
                            } else if showSectioned {
                                let sections = CategoryProductsLogic.subcategorySections(
                                    filtered: filtered,
                                    subcategories: ctx.children,
                                    parentById: ctx.parentById
                                )
                                let other = CategoryProductsLogic.uncategorizedProducts(
                                    filtered: filtered,
                                    subcategories: ctx.children,
                                    parentById: ctx.parentById
                                )
                                ForEach(sections, id: \.0.id) { sub, sectionProducts in
                                    productSectionBlock(title: sub.name, count: sectionProducts.count, products: sectionProducts)
                                }
                                if !other.isEmpty {
                                    productSectionBlock(
                                        title: BuyerStrings.categoryOtherIn(ctx.category.name),
                                        count: other.count,
                                        products: other
                                    )
                                }
                            } else {
                                productGrid(products: filtered)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 16)
                            }
                        }
                        .padding(.bottom, 88)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(catPageBg)

            if showFilters, let ctx = contextData {
                CategoryFilterDrawerView(
                    categoryName: ctx.category.name,
                    subcategories: ctx.children,
                    counts: subCounts,
                    brands: CategoryProductsLogic.uniqueBrands(products: products),
                    filters: $filters,
                    dynamicMax: dynamicMax,
                    onDismiss: { showFilters = false },
                    onReset: { filters = CategoryFilterState(priceMax: dynamicMax) }
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
        .task(id: "\(categoryRef)|\(reloadTrigger)") { await loadCategory() }
        .task(id: "\(products.count)|\(destinationCountry)") { await loadPrices() }
        .task(id: "\(session.userId)|\(products.count)") { await loadCartWishlist() }
    }

    private func loadCategory() async {
        loading = true
        fetchError = nil
        filters = CategoryFilterState()
        if let ctx = await categoryRepo.fetchCategoryContext(slugOrId: categoryRef) {
            let prods = await categoryRepo.fetchProductsForCategories(
                categoryIds: ctx.allCategoryIds,
                categoryNames: ctx.categoryNames
            )
            contextData = ctx
            products = prods
            dynamicMax = CategoryProductsLogic.dynamicPriceMax(products: prods)
            filters = CategoryFilterState(priceMax: dynamicMax)
            fetchError = nil
        } else {
            contextData = nil
            products = []
            fetchError = BuyerStrings.categoryLoadError
        }
        loading = false
    }

    private func loadPrices() async {
        guard !products.isEmpty else {
            publicPrices = [:]
            return
        }
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
        let cart = await cartRepo.fetchCart(session: session)
        cartProductIds = Set(cart.map(\.product.id))
        let wishlist = await wishlistRepo.fetchWishlist(session: session)
        wishlistProductIds = Set(wishlist.map(\.id))
    }

    private func categoryBreadcrumb(ctx: CategoryContext) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                Text(BuyerStrings.navHome)
                    .font(.system(size: 12))
                    .foregroundStyle(catTextSecondary)
                    .onTapGesture(perform: onHome)
                if let parent = ctx.parent {
                    Image(systemName: "chevron.right").font(.system(size: 10)).foregroundStyle(Color(hex: 0x9CA3AF))
                    Text(parent.name)
                        .font(.system(size: 12))
                        .foregroundStyle(catTextSecondary)
                        .onTapGesture { onCategoryClick(parent.slug) }
                }
                Image(systemName: "chevron.right").font(.system(size: 10)).foregroundStyle(Color(hex: 0x9CA3AF))
                Text(ctx.category.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(catTextPrimary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Color.white)
        .overlay(alignment: .bottom) { Divider() }
    }

    private func categoryHeader(name: String, resultCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name).font(.system(size: 20, weight: .bold))
            Text(BuyerStrings.categoryResults(resultCount))
                .font(.system(size: 14))
                .foregroundStyle(catTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.white)
        .overlay(alignment: .bottom) { Divider() }
    }

    private func subcategoryChips(ctx: CategoryContext) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                subcategoryChip(BuyerStrings.categoryAll, selected: filters.selectedSubcategory == nil) {
                    filters.selectedSubcategory = nil
                }
                ForEach(ctx.children, id: \.id) { sub in
                    let count = subCounts[sub.id] ?? 0
                    let label = count > 0 ? "\(sub.name) (\(count))" : sub.name
                    subcategoryChip(label, selected: filters.selectedSubcategory == sub.id) {
                        filters.selectedSubcategory = filters.selectedSubcategory == sub.id ? nil : sub.id
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color.white)
        .overlay(alignment: .bottom) { Divider() }
    }

    private func subcategoryChip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Text(label)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(selected ? Color.white : Color(hex: 0x374151))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(selected ? catChipSelected : Color.white)
            .overlay(Capsule().stroke(selected ? catChipSelected : Color(hex: 0xD1D5DB)))
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }

    private var sortFilterBar: some View {
        HStack {
            Button { showFilters = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                    Text(BuyerStrings.categoryFilters)
                    if activeFilters > 0 {
                        Text("\(activeFilters)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(catAmber)
                            .clipShape(Capsule())
                    }
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color(hex: 0x374151))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xD1D5DB)))
            }
            Menu {
                ForEach(CategorySortBy.allCases, id: \.self) { option in
                    Button(categorySortLabel(option)) { filters.sortBy = option }
                }
            } label: {
                Text(categorySortLabel(filters.sortBy))
                    .font(.system(size: 14))
                    .foregroundStyle(Color(hex: 0x374151))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xD1D5DB)))
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(alignment: .bottom) { Divider() }
    }

    private func productSectionBlock(title: String, count: Int, products: [CategoryProductRow]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.system(size: 17, weight: .bold))
                Spacer()
                Text(BuyerStrings.categoryProductCount(count))
                    .font(.system(size: 12))
                    .foregroundStyle(catTextSecondary)
            }
            Divider().padding(.vertical, 4)
            productGrid(products: products)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }

    private func productGrid(products: [CategoryProductRow]) -> some View {
        VStack(spacing: 12) {
            ForEach(Array(stride(from: 0, to: products.count, by: 2)), id: \.self) { index in
                HStack(spacing: 12) {
                    catalogCard(products[index])
                    if index + 1 < products.count {
                        catalogCard(products[index + 1])
                    } else {
                        Spacer().frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func catalogCard(_ item: CategoryProductRow) -> some View {
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
            onAddToCart: { center, size in
                Task { await addToCart(product: product, center: center, size: size) }
            }
        )
        .frame(maxWidth: .infinity)
    }

    private var emptyProductsState: some View {
        VStack(spacing: 8) {
            Text(BuyerStrings.categoryNoProducts).font(.system(size: 18, weight: .semibold))
            Text(BuyerStrings.categoryNoProductsHint)
                .font(.system(size: 14))
                .foregroundStyle(catTextSecondary)
            if activeFilters > 0 {
                Text(BuyerStrings.categoryClearFilters)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(catAmber)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.top, 16)
                    .onTapGesture { filters = CategoryFilterState(priceMax: dynamicMax) }
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(catBorderGray))
        .padding(16)
    }

    private var categoryNotFoundState: some View {
        VStack(spacing: 12) {
            Text(BuyerStrings.categoryNotFound).font(.system(size: 22, weight: .bold))
            Text(BuyerStrings.categoryNotFoundHint).font(.system(size: 14)).foregroundStyle(catTextSecondary)
            Text(BuyerStrings.categoryBackHome)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(catAmber)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture(perform: onHome)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func categoryErrorState(message: String) -> some View {
        VStack(spacing: 12) {
            Text(BuyerStrings.categoryErrorTitle).font(.system(size: 22, weight: .bold))
            Text(message).font(.system(size: 14)).foregroundStyle(catTextSecondary)
            Text(BuyerStrings.categoryTryAgain)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(catAmber)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture { reloadTrigger += 1 }
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
            if inWishlist { wishlistProductIds.remove(product.id) }
            else { wishlistProductIds.insert(product.id) }
            onRefreshBadges()
        }
    }

    private func addToCart(product: ProductRow, center: CGPoint, size: CGSize) async {
        guard !variantIds.contains(product.id) else { return }
        flyToCartController.fly(
            request: FlyToCartRequest(imageUrl: product.imageUrl, startCenter: center, startSize: size)
        ) {}
        let result = await cartRepo.addProduct(
            session: session,
            productId: product.id,
            unitPrice: publicPrices[product.id]?.publicUnitPrice
        )
        if case .success = result {
            cartProductIds.insert(product.id)
            onRefreshBadges()
            toastMessage = BuyerStrings.addedToCart
        } else {
            toastMessage = BuyerStrings.actionFailed
        }
    }

    private func categorySortLabel(_ sort: CategorySortBy) -> String {
        switch sort {
        case .featured: return BuyerStrings.categorySortFeatured
        case .priceLowHigh: return BuyerStrings.categorySortPriceLow
        case .priceHighLow: return BuyerStrings.categorySortPriceHigh
        case .rating: return BuyerStrings.categorySortRating
        case .newest: return BuyerStrings.categorySortNewest
        }
    }
}

extension CategorySortBy: CaseIterable {
    static var allCases: [CategorySortBy] {
        [.featured, .priceLowHigh, .priceHighLow, .rating, .newest]
    }
}

private struct CategoryFilterDrawerView: View {
    let categoryName: String
    let subcategories: [CategoryInfo]
    let counts: [String: Int]
    let brands: [String]
    @Binding var filters: CategoryFilterState
    let dynamicMax: Float
    let onDismiss: () -> Void
    let onReset: () -> Void

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)
            VStack(spacing: 0) {
                HStack {
                    Text(BuyerStrings.categoryFilters).font(.system(size: 18, weight: .bold))
                    Spacer()
                    Button(action: onDismiss) { Image(systemName: "xmark") }
                }
                .padding(16)
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if !subcategories.isEmpty {
                            filterSectionTitle(BuyerStrings.categoryDepartment)
                            filterTextOption(BuyerStrings.categoryAllNamed(categoryName), selected: filters.selectedSubcategory == nil) {
                                filters.selectedSubcategory = nil
                            }
                            ForEach(subcategories, id: \.id) { sub in
                                filterTextOption("\(sub.name) (\(counts[sub.id] ?? 0))", selected: filters.selectedSubcategory == sub.id) {
                                    filters.selectedSubcategory = filters.selectedSubcategory == sub.id ? nil : sub.id
                                }
                            }
                            Divider()
                        }
                        filterSectionTitle(BuyerStrings.categoryPrice)
                        Text(BuyerStrings.categoryPriceMin(formatCurrency(amount: Double(filters.priceMin), currency: "INR")))
                            .font(.system(size: 12)).foregroundStyle(Color(hex: 0x6B7280))
                        Slider(value: Binding(
                            get: { filters.priceMin },
                            set: { filters.priceMin = min($0, filters.priceMax) }
                        ), in: 0...dynamicMax)
                        .tint(Color(hex: 0xF59E0B))
                        Text(BuyerStrings.categoryPriceMax(formatCurrency(amount: Double(filters.priceMax), currency: "INR")))
                            .font(.system(size: 12)).foregroundStyle(Color(hex: 0x6B7280))
                        Slider(value: Binding(
                            get: { filters.priceMax },
                            set: { filters.priceMax = max($0, filters.priceMin) }
                        ), in: 0...dynamicMax)
                        .tint(Color(hex: 0xF59E0B))
                        Divider()
                        filterSectionTitle(BuyerStrings.categoryCustomerReview)
                        ForEach([4, 3, 2, 1], id: \.self) { stars in
                            ratingFilterRow(stars: stars, selected: filters.rating == stars) {
                                filters.rating = filters.rating == stars ? nil : stars
                            }
                        }
                        Divider()
                        Toggle(BuyerStrings.categoryInStock, isOn: $filters.inStock)
                            .tint(Color(hex: 0xF59E0B))
                        if !brands.isEmpty {
                            Divider()
                            filterSectionTitle(BuyerStrings.categoryBrand)
                            ForEach(brands.prefix(15), id: \.self) { brand in
                                Text(brand).font(.system(size: 14)).foregroundStyle(Color(hex: 0x6B7280))
                            }
                        }
                    }
                    .padding(16)
                }
                HStack(spacing: 12) {
                    Button(BuyerStrings.categoryReset, action: onReset)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xD1D5DB)))
                    Button(BuyerStrings.categoryShowResults, action: onDismiss)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .background(Color(hex: 0xF59E0B))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(16)
            }
            .frame(width: 320)
            .background(Color.white)
            .frame(maxHeight: .infinity)
        }
    }

    private func filterSectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.5)
    }

    private func filterTextOption(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Text(label)
            .font(.system(size: 14, weight: selected ? .semibold : .regular))
            .foregroundStyle(selected ? Color(hex: 0xF59E0B) : Color(hex: 0x6B7280))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
            .onTapGesture(perform: action)
    }

    private func ratingFilterRow(stars: Int, selected: Bool, action: @escaping () -> Void) -> some View {
        HStack(spacing: 6) {
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: index < stars ? "star.fill" : "star")
                    .font(.system(size: 14))
                    .foregroundStyle(index < stars ? Color(hex: 0xFBBF24) : Color(hex: 0xD1D5DB))
            }
            Text(BuyerStrings.categoryRatingUp)
                .font(.system(size: 14))
                .foregroundStyle(selected ? Color(hex: 0xF59E0B) : Color(hex: 0x6B7280))
        }
        .onTapGesture(perform: action)
    }
}
