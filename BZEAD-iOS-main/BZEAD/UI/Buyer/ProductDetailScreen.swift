import SwiftUI

struct ProductDetailScreen: View {
    let session: BuyerSession
    let productId: String
    let destinationCountry: String
    let flyToCartController: FlyToCartController
    let onRefreshBadges: () -> Void
    let onHome: () -> Void
    let onProductClick: (String) -> Void
    let onBuyNow: () -> Void
    let onWriteReview: (String, String) -> Void
    let onManageAddresses: () -> Void

    @State private var loading = true
    @State private var bundle: ProductDetailBundle?
    @State private var inWishlist = false
    @State private var selectedSize: String?
    @State private var selectedColor: String?
    @State private var activeImage = 0
    @State private var adding = false
    @State private var activeTab: ProductDetailTab = .details
    @State private var publicPrice: ResolvedPublicPrice?
    @State private var similarPrices: [String: ResolvedPublicPrice] = [:]
    @State private var priceLoading = true
    @State private var delivery = DeliveryEstimateState()
    @State private var addresses: [UserAddressRow] = []
    @State private var selectedAddress: UserAddressRow?
    @State private var showAddressPicker = false
    @State private var heroCenter = CGPoint.zero
    @State private var heroSize = CGSize.zero
    @State private var variantProductIds: Set<String> = []
    @State private var deliveryLocationLabel = BuyerStrings.locationDetectHint
    @State private var shareURL: URL?
    @State private var toastMessage: String?

    private let productRepo = ProductRepository()
    private let detailRepo = ProductDetailRepository()
    private let pricingRepo = ProductPricingRepository()
    private let cartRepo = CartRepository()
    private let wishlistRepo = WishlistRepository()
    private let locationRepo = LocationRepository()
    private let countryRepository = DestinationCountryRepository()

    private var product: ProductDetail? { bundle?.product }
    private var variants: [ProductVariant] { product?.variants ?? [] }
    private var sizes: [String] { ProductDetailHelpers.availableSizes(variants: variants) }
    private var colors: [String] { ProductDetailHelpers.availableColors(variants: variants) }
    private var colorHexMap: [String: Color] { ProductDetailHelpers.colorHexByName(variants: variants) }
    private var requiresSize: Bool { sizes.count > 1 }
    private var requiresColor: Bool { colors.count > 1 }
    private var currentVariant: ProductVariant? {
        ProductDetailHelpers.resolveVariant(product: product, size: selectedSize, color: selectedColor)
    }
    private var effectiveStock: Int { currentVariant?.stock ?? product?.stock ?? 0 }
    private var inStock: Bool { effectiveStock > 0 }
    private var publicUnitPrice: Double? { publicPrice?.publicUnitPrice }
    private var canPurchase: Bool {
        !priceLoading && publicUnitPrice != nil
            && !(requiresSize && (selectedSize ?? "").isEmpty)
            && !(requiresColor && (selectedColor ?? "").isEmpty)
    }
    private var gallery: [String] {
        guard let product else { return [] }
        return ProductDetailHelpers.galleryImages(product: product, selectedSize: selectedSize, selectedColor: selectedColor)
    }
    private var offers: [OfferRuleRow] { ProductDetailHelpers.activeOffers(rules: product?.offerRules) }
    private var averageRating: Double {
        if (product?.rating ?? 0) > 0 { return product?.rating ?? 0 }
        if let reviews = bundle?.reviews, !reviews.isEmpty {
            return Double(reviews.map(\.rating).reduce(0, +)) / Double(reviews.count)
        }
        return 0
    }

    var body: some View {
        ZStack {
            Group {
                if loading {
                    BuyerDetailSkeleton()
                } else if product == nil {
                    Text(BuyerStrings.productNotFound)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let product {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ProductBreadcrumbView(
                                categoryName: bundle?.categoryName,
                                subCategoryName: bundle?.subCategoryName,
                                productName: product.name,
                                onHome: onHome
                            )
                            ProductGallerySectionView(
                                images: gallery,
                                productName: product.name,
                                inWishlist: inWishlist,
                                activeIndex: activeImage,
                                onActiveIndexChange: { activeImage = $0 },
                                onShare: shareProduct,
                                onWishlistToggle: toggleWishlist,
                                onHeroPositioned: { center, size in
                                    heroCenter = center
                                    heroSize = size
                                }
                            )
                            VStack(alignment: .leading, spacing: 8) {
                                ConditionBadgeView(condition: product.itemCondition)
                                Text(product.name)
                                    .font(.system(size: 17, weight: .medium))
                                if let brand = product.brand, !brand.isEmpty {
                                    Text(brand)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(Color(hex: 0x1F5EA8))
                                }
                                Divider().background(Color(hex: 0xE5E7EB))
                                ProductRatingRowView(
                                    rating: averageRating,
                                    reviewCount: bundle?.reviews.count ?? product.reviewCount ?? 0
                                )
                                if let short = product.shortDescription, !short.isEmpty {
                                    Text(short)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Color(hex: 0x555555))
                                }
                                if !inStock {
                                    Text(BuyerStrings.pdpOutOfStock)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(Color(hex: 0xEF4444))
                                }
                                ProductPriceBlockView(publicPrice: publicPrice, loading: priceLoading, currency: product.currency)
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 12)

                            if let offer = offers.first {
                                ProductOfferSectionView(offer: offer).padding(.top, 10)
                            }
                            if !colors.isEmpty || !sizes.isEmpty {
                                ProductColorSizeSectionView(
                                    colors: colors,
                                    sizes: sizes,
                                    selectedColor: selectedColor,
                                    selectedSize: selectedSize,
                                    colorHexMap: colorHexMap,
                                    onColorSelected: { selectedColor = $0 },
                                    onSizeSelected: { selectedSize = $0 }
                                )
                                .padding(.top, 10)
                            }
                            ProductCtaRowView(
                                adding: adding,
                                inStock: inStock,
                                canPurchase: canPurchase,
                                onAddToCart: { performAddToCart(onDone: {}) },
                                onBuyNow: { performAddToCart(onDone: onBuyNow) },
                                onShare: shareProduct
                            )
                            DeliveryEstimateCardView(
                                state: delivery,
                                detectedLocationLabel: deliveryLocationLabel,
                                onSelectAddress: { showAddressPicker = true }
                            )
                            .padding(.top, 8)
                            ProductDetailTabsView(activeTab: activeTab, onTabSelected: { activeTab = $0 })
                                .padding(.top, 16)
                            tabContent(product: product)
                                .padding(.top, 12)
                            SimilarProductsGridView(
                                products: bundle?.similarProducts ?? [],
                                publicPrices: similarPrices,
                                variantIds: variantProductIds,
                                onProductClick: onProductClick
                            )
                            .padding(.top, 20)
                            Spacer(minLength: 24)
                        }
                    }
                }
            }
            .background(Color.white)

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
                        .padding(.bottom, 24)
                }
            }
        }
        .sheet(isPresented: $showAddressPicker) {
            AddressPickerSheetView(
                addresses: addresses,
                selectedId: selectedAddress?.id,
                onDismiss: { showAddressPicker = false },
                onSelect: { address in
                    selectedAddress = address
                    showAddressPicker = false
                    Task { await refreshDelivery() }
                },
                onAddNew: {
                    showAddressPicker = false
                    onManageAddresses()
                }
            )
        }
        .sheet(item: Binding(
            get: { shareURL.map { ShareItem(url: $0, title: product?.name ?? "") } },
            set: { shareURL = $0?.url }
        )) { item in
            ShareSheetView(items: [item.url, item.title])
        }
        .task(id: productId) { await loadProduct() }
        .task(id: pricingTaskKey) { await loadPrices() }
        .task(id: selectedAddress?.id) { await refreshDelivery() }
        .onChange(of: selectedSize) { _, _ in activeImage = 0 }
        .onChange(of: selectedColor) { _, _ in activeImage = 0 }
        .task {
            if let label = await locationRepo.cachedLocation()?.label(), !label.isEmpty {
                deliveryLocationLabel = label
            }
        }
    }

    private var pricingTaskKey: String {
        "\(product?.id ?? "")|\(selectedSize ?? "")|\(selectedColor ?? "")|\(destinationCountry)|\(selectedAddress?.id ?? "")"
    }

    @ViewBuilder
    private func tabContent(product: ProductDetail) -> some View {
        switch activeTab {
        case .details:
            ProductDetailsTabContentView(product: product, bundle: bundle)
        case .specifications:
            ProductSpecificationsTabContentView(product: product, bundle: bundle, inStock: inStock)
        case .reviews:
            ProductReviewsSectionView(
                reviews: bundle?.reviews ?? [],
                averageRating: averageRating,
                onWriteReview: { onWriteReview(product.id, product.name) }
            )
        }
    }

    private func loadProduct() async {
        loading = true
        selectedSize = nil
        selectedColor = nil
        guard let loaded = await productRepo.fetchById(productId) else {
            bundle = nil
            loading = false
            return
        }
        let full = await detailRepo.loadBundle(product: loaded)
        bundle = full
        inWishlist = await wishlistRepo.isInWishlist(session: session, productId: loaded.id)
        addresses = await detailRepo.fetchAddresses(session: session)
        selectedAddress = addresses.first(where: \.isDefault) ?? addresses.first
        let loadedVariants = full.product.variants ?? []
        let loadedSizes = ProductDetailHelpers.availableSizes(variants: loadedVariants)
        let loadedColors = ProductDetailHelpers.availableColors(variants: loadedVariants)
        selectedSize = ProductDetailHelpers.preferredVariantSize(variants: loadedVariants, sizes: loadedSizes).nilIfEmpty
        selectedColor = ProductDetailHelpers.preferredVariantColor(variants: loadedVariants, colors: loadedColors).nilIfEmpty
        variantProductIds = await productRepo.fetchVariantProductIds(full.similarProducts.map(\.id))
        let cachedPostal = await locationRepo.cachedLocation()?.postalCode
        delivery = await detailRepo.fetchDeliveryEstimate(
            product: loaded,
            session: session,
            selectedAddress: selectedAddress,
            cachedPostal: cachedPostal
        )
        loading = false
    }

    private func loadPrices() async {
        guard let product else { return }
        priceLoading = true
        let variant = ProductDetailHelpers.resolveVariant(product: product, size: selectedSize, color: selectedColor)
        var override: [String: Double] = [:]
        if let variantPrice = variant?.price, variantPrice > 0 {
            override[product.id] = variantPrice
        }
        var candidates = await countryRepository.resolveCountryCandidates(session: session, locationRepository: locationRepo)
        if let country = selectedAddress?.country.trimmingCharacters(in: .whitespacesAndNewlines), !country.isEmpty, !candidates.contains(country) {
            candidates.insert(country, at: 0)
        }
        let ids = ([product.id] + (bundle?.similarProducts.map(\.id) ?? [])).uniqued()
        var currencies: [String: String] = [product.id: product.currency ?? "INR"]
        bundle?.similarProducts.forEach { currencies[$0.id] = $0.currency ?? "INR" }
        let prices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: ids,
            countryCandidates: candidates,
            priceOverrides: override,
            productCurrencies: currencies
        )
        publicPrice = prices[product.id]
        similarPrices = prices
        priceLoading = false
    }

    private func refreshDelivery() async {
        guard let product else { return }
        let cachedPostal = await locationRepo.cachedLocation()?.postalCode
        delivery = await detailRepo.fetchDeliveryEstimate(
            product: product,
            session: session,
            selectedAddress: selectedAddress,
            cachedPostal: cachedPostal
        )
    }

    private func shareProduct() {
        let slug = product?.slug?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? productId
        shareURL = URL(string: "\(SupabaseConfig.publicAppUrl)/share/\(slug)")
    }

    private func toggleWishlist() {
        guard let product else { return }
        Task {
            let result: Result<Void, Error>
            if inWishlist {
                result = await wishlistRepo.remove(session: session, productId: product.id)
            } else {
                result = await wishlistRepo.add(session: session, productId: product.id)
            }
            if case .success = result {
                inWishlist.toggle()
                onRefreshBadges()
            }
        }
    }

    private func performAddToCart(onDone: @escaping () -> Void) {
        guard let product else { return }
        if !canPurchase {
            toastMessage = purchaseBlockMessage
            return
        }
        adding = true
        let addAction = {
            Task {
                let unitPrice = publicUnitPrice ?? product.price
                let result = await cartRepo.upsertItem(
                    session: session,
                    product: product,
                    quantity: 1,
                    selectedSize: selectedSize,
                    selectedColor: selectedColor,
                    selectedVariantSku: currentVariant?.sku,
                    unitPrice: unitPrice
                )
                adding = false
                if case .success = result {
                    onRefreshBadges()
                    onDone()
                    toastMessage = BuyerStrings.addedToCart
                } else {
                    toastMessage = BuyerStrings.actionFailed
                }
            }
        }
        if heroCenter != .zero, flyToCartController.cartCenter != .zero {
            flyToCartController.fly(
                request: FlyToCartRequest(
                    imageUrl: gallery.first,
                    startCenter: heroCenter,
                    startSize: heroSize
                ),
                onDone: addAction
            )
        } else {
            addAction()
        }
    }

    private var purchaseBlockMessage: String {
        if priceLoading { return BuyerStrings.pdpLoadingPrice }
        if publicUnitPrice == nil { return BuyerStrings.pdpPriceUnavailable }
        if requiresSize && (selectedSize ?? "").isEmpty { return BuyerStrings.selectSize }
        if requiresColor && (selectedColor ?? "").isEmpty { return BuyerStrings.selectColor }
        return BuyerStrings.selectVariant
    }
}

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
}

private struct ShareSheetView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct ProductDetailsTabContentView: View {
    let product: ProductDetail
    let bundle: ProductDetailBundle?

    var body: some View {
        let points = ProductDetailUiHelpers.detailPoints(description: product.description)
        let highlights = product.highlights?.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? []
        let ingredients = product.ingredients?
            .components(separatedBy: CharacterSet.newlines.union(CharacterSet(charactersIn: ",")))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
        let directions = product.directions?
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
        let hasContent = !points.isEmpty || !highlights.isEmpty || !ingredients.isEmpty || !directions.isEmpty || !(product.importantNote ?? "").isEmpty

        VStack(spacing: 12) {
            if !points.isEmpty {
                CollapsibleSectionView(title: "About Product") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(points, id: \.self) { point in
                            Text("• \(point)").font(.system(size: 12))
                        }
                    }
                }
            }
            if !highlights.isEmpty {
                CollapsibleSectionView(title: "Highlights") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(highlights, id: \.self) { item in
                            Text("• \(item)").font(.system(size: 12))
                        }
                    }
                }
            }
            if !ingredients.isEmpty {
                CollapsibleSectionView(title: "Ingredients") {
                    SpecTableView(rows: stride(from: 0, to: ingredients.count, by: 2).map { index in
                        (ingredients[index], ingredients[safe: index + 1] ?? "—")
                    })
                }
            }
            if !directions.isEmpty {
                CollapsibleSectionView(title: "Directions") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(directions, id: \.self) { line in
                            Text(line).font(.system(size: 12))
                        }
                    }
                }
            }
            if let note = product.importantNote, !note.isEmpty {
                CollapsibleSectionView(title: "Important Note") {
                    Text(note).font(.system(size: 12))
                }
            }
            ProductBenefitsStripView()
            if !hasContent {
                Text(BuyerStrings.pdpNoDetails)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0x565959))
                    .padding(16)
            }
        }
    }
}

private struct ProductSpecificationsTabContentView: View {
    let product: ProductDetail
    let bundle: ProductDetailBundle?
    let inStock: Bool

    var body: some View {
        let specRows = ProductDetailUiHelpers.specificationRows(specs: product.specifications)
        let weightText = ProductDetailHelpers.formatWeight(weight: product.packageWeight, unitCode: bundle?.weightUnitCode ?? "KG")
        let dims = [product.packageLength, product.packageWidth, product.packageHeight]
        let dimsText = dims.compactMap { $0 }.contains(where: { $0 > 0 })
            ? "\(Int(product.packageLength ?? 0)) × \(Int(product.packageWidth ?? 0)) × \(Int(product.packageHeight ?? 0)) cm"
            : nil
        let packageSummary = [weightText, dimsText].compactMap { $0 }.joined(separator: " | ").nilIfEmpty
        var itemRows: [(String, String)] = [
            ("Brand", product.brand ?? "N/A"),
            ("Category", bundle?.subCategoryName ?? bundle?.categoryName ?? "N/A"),
            ("In Stock", inStock ? "Yes" : "No"),
            ("Manufacturer Name", product.manufacturerName ?? "N/A"),
            ("Manufacturer Country", product.manufacturerCountry ?? "N/A"),
            ("Country of Origin", product.originCountry ?? "N/A"),
        ]
        if let sku = product.sku { itemRows.insert(("SKU", sku), at: 1) }
        if let hsn = product.hsnCode { itemRows.append(("HSN Code", hsn)) }
        if let weightText { itemRows.append(("Item Weight", weightText)) }
        if let dimsText { itemRows.append(("Dimensions", dimsText)) }
        if let packageSummary { itemRows.append(("Package", packageSummary)) }

        VStack(spacing: 12) {
            if !specRows.isEmpty {
                CollapsibleSectionView(title: "Features & Specs") {
                    SpecTableView(rows: specRows)
                }
            }
            CollapsibleSectionView(title: "Item Details") {
                SpecTableView(rows: itemRows)
            }
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
