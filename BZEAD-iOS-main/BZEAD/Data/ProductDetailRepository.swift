import Foundation

final class ProductDetailRepository {
    private let http = SupabaseHTTP.shared
    private let similarFields =
        "id,public_product_id,name,image_url,brand,price,currency,discount_price,rating,review_count,item_condition"

    func loadBundle(product: ProductDetail) async -> ProductDetailBundle {
        let categories = await resolveCategories(product: product)
        let weightUnitCode: String
        if let unitId = product.packageWeightUnitId {
            weightUnitCode = await fetchWeightUnitCode(unitId: unitId)
        } else {
            weightUnitCode = "KG"
        }
        let reviews = await fetchReviews(productId: product.id)
        let similar: [ProductRow]
        if let categoryId = product.category {
            similar = await fetchSimilarProducts(categoryId: categoryId, excludeId: product.id)
        } else {
            similar = []
        }

        return ProductDetailBundle(
            product: product,
            categoryName: categories.categoryName,
            categorySlug: categories.categorySlug,
            subCategoryName: categories.subCategoryName,
            subCategorySlug: categories.subCategorySlug,
            weightUnitCode: weightUnitCode,
            reviews: reviews,
            similarProducts: similar
        )
    }

    func fetchDeliveryEstimate(
        product: ProductDetail,
        session: BuyerSession,
        selectedAddress: UserAddressRow?,
        cachedPostal: String?
    ) async -> DeliveryEstimateState {
        let address = selectedAddress ?? await fetchDefaultAddress(session: session)
        let pincode = address?.postalCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? address!.postalCode.trimmingCharacters(in: .whitespacesAndNewlines)
            : cachedPostal?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let addressLabel = address.map {
            [$0.streetAddress1, $0.streetAddress2, $0.city]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
        }.flatMap { $0.isEmpty ? nil : $0 }

        if pincode.isEmpty {
            return DeliveryEstimateState(
                addressLabel: addressLabel,
                addressType: address?.addressType,
                fallbackMessage: "Select delivery location"
            )
        }

        let originPin = await resolveSellerPickupPin(productId: product.id, sellerId: product.sellerId)
        if originPin.isEmpty || !isIndianPincode(originPin) || !isIndianPincode(pincode) {
            return DeliveryEstimateState(
                addressLabel: addressLabel,
                addressType: address?.addressType,
                pincode: pincode,
                fallbackMessage: "Delivery details available at checkout"
            )
        }

        let weightKg = max((product.packageWeight ?? 0.5), 0.1)
        guard let result = await ShippingRateClients.fetchShiprocketDomestic(
            pickupPincode: originPin,
            destinationPincode: pincode,
            weightKg: weightKg,
            cod: false
        ) else {
            return DeliveryEstimateState(
                addressLabel: addressLabel,
                addressType: address?.addressType,
                pincode: pincode,
                fallbackMessage: "Delivery details available at checkout"
            )
        }

        let tiers = result.1
        if tiers.isEmpty {
            return DeliveryEstimateState(
                addressLabel: addressLabel,
                addressType: address?.addressType,
                pincode: pincode,
                notServiceable: true
            )
        }

        let days = tiers.compactMap { parseEstimatedDays($0.estimatedDays.isEmpty ? $0.etd : $0.estimatedDays) }.min()
        let dateText = days.map { formatDeliveryDate(days: $0) }
        return DeliveryEstimateState(
            addressLabel: addressLabel,
            addressType: address?.addressType,
            pincode: pincode,
            deliveryDateText: dateText
        )
    }

    func fetchAddresses(session: BuyerSession) async -> [UserAddressRow] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/user_addresses" +
            "?user_id=eq.\(session.userId)" +
            "&order=is_default.desc,created_at.desc"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            return try http.decode([UserAddressRow].self, from: data)
        } catch {
            return []
        }
    }

    private func fetchDefaultAddress(session: BuyerSession) async -> UserAddressRow? {
        await fetchAddresses(session: session).first
    }

    private func resolveSellerPickupPin(productId: String, sellerId: String?) async -> String {
        guard SupabaseConfig.isConfigured() else { return "" }
        if let sellerId, !sellerId.isEmpty {
            let direct = await fetchSellerPin(sellerId: sellerId)
            if !direct.isEmpty { return direct }
        }
        let url = "\(SupabaseConfig.url)/rest/v1/products?id=eq.\(productId)&select=seller_id"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return "" }
            let resolvedSellerId = try http.decode([SellerIdRow].self, from: data).first?.sellerId ?? ""
            guard !resolvedSellerId.isEmpty else { return "" }
            return await fetchSellerPin(sellerId: resolvedSellerId)
        } catch {
            return ""
        }
    }

    private func fetchSellerPin(sellerId: String) async -> String {
        let url = "\(SupabaseConfig.url)/rest/v1/seller_kyc?seller_id=eq.\(sellerId)" +
            "&select=seller_id,business_postal_code" +
            "&limit=1"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return "" }
            return try http.decode([SellerKycPinRow].self, from: data)
                .first?
                .businessPostalCode?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        } catch {
            return ""
        }
    }

    private func fetchWeightUnitCode(unitId: String) async -> String {
        let url = "\(SupabaseConfig.url)/rest/v1/measurement_units?id=eq.\(unitId)&select=code&limit=1"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return "KG" }
            return try http.decode([MeasurementUnitRow].self, from: data)
                .first?
                .code?
                .uppercased() ?? "KG"
        } catch {
            return "KG"
        }
    }

    private func resolveCategories(product: ProductDetail) async -> ResolvedCategoryInfo {
        let catIds = Array(Set([product.category, product.subCategory].compactMap { $0 }))
        guard !catIds.isEmpty, SupabaseConfig.isConfigured() else { return ResolvedCategoryInfo() }

        let inClause = catIds.map { "\"\($0)\"" }.joined(separator: ",")
        let url = "\(SupabaseConfig.url)/rest/v1/categories?id=in.(\(inClause))&select=id,name,slug,parent_id"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return ResolvedCategoryInfo() }

            let catMap = Dictionary(uniqueKeysWithValues: try http.decode([CategoryRow].self, from: data).map { ($0.id, $0) })
            let cat = product.category.flatMap { catMap[$0] }
            let subCat = product.subCategory.flatMap { catMap[$0] }

            var categoryName = cat?.name
            var categorySlug = cat?.slug
            if cat == nil, let parentId = subCat?.parentId {
                let parentUrl = "\(SupabaseConfig.url)/rest/v1/categories?id=eq.\(parentId)&select=id,name,slug&limit=1"
                let (parentData, parentResponse) = try await http.getAllowingErrorStatus(parentUrl, headers: http.anonHeaders())
                if http.isSuccess(parentResponse),
                   let parent = try http.decode([CategoryRow].self, from: parentData).first {
                    categoryName = parent.name
                    categorySlug = parent.slug
                }
            }

            return ResolvedCategoryInfo(
                categoryName: categoryName,
                categorySlug: categorySlug,
                subCategoryName: subCat?.name,
                subCategorySlug: subCat?.slug
            )
        } catch {
            return ResolvedCategoryInfo()
        }
    }

    private func fetchReviews(productId: String) async -> [ProductReview] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/reviews" +
            "?product_id=eq.\(productId)" +
            "&is_flagged=eq.false" +
            "&order=created_at.desc"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }

            let rows = try http.decode([ReviewDbRow].self, from: data)
            let userIds = Array(Set(rows.compactMap(\.userId)))
            var profileMap: [String: String?] = [:]
            if !userIds.isEmpty {
                let inClause = userIds.map { "\"\($0)\"" }.joined(separator: ",")
                let profilesUrl = "\(SupabaseConfig.url)/rest/v1/profiles?id=in.(\(inClause))&select=id,full_name"
                let (profileData, profileResponse) = try await http.getAllowingErrorStatus(profilesUrl, headers: http.anonHeaders())
                if http.isSuccess(profileResponse) {
                    profileMap = Dictionary(uniqueKeysWithValues: try http.decode([ProfileNameRow].self, from: profileData).map { ($0.id, $0.fullName) })
                }
            }

            let formatter = DateFormatter()
            formatter.dateFormat = "dd MMM yyyy"

            return rows.map { row in
                let dateText: String
                if let createdAt = row.createdAt,
                   let date = ISO8601DateFormatter().date(from: createdAt) {
                    dateText = formatter.string(from: date)
                } else {
                    dateText = ""
                }
                let reviewer = profileMap[row.userId ?? ""]??.trimmingCharacters(in: .whitespacesAndNewlines)
                return ProductReview(
                    id: row.id,
                    reviewerName: (reviewer?.isEmpty == false ? reviewer! : "Anonymous"),
                    rating: row.rating ?? 0,
                    heading: row.heading ?? "",
                    text: row.comment ?? "",
                    date: dateText,
                    images: row.images ?? []
                )
            }
        } catch {
            return []
        }
    }

    private func fetchSimilarProducts(categoryId: String, excludeId: String, limit: Int = 8) async -> [ProductRow] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/products" +
            "?category=eq.\(categoryId)" +
            "&approval_status=eq.approved" +
            "&is_active=eq.true" +
            "&id=neq.\(excludeId)" +
            "&select=\(similarFields)" +
            "&limit=\(limit)"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            return try http.decode([ProductRow].self, from: data)
        } catch {
            return []
        }
    }

    private func isIndianPincode(_ pin: String) -> Bool {
        pin.range(of: "^\\d{6}$", options: .regularExpression) != nil
    }

    private func parseEstimatedDays(_ raw: String) -> Int? {
        let nums = raw.components(separatedBy: CharacterSet.decimalDigits.inverted)
            .compactMap { Int($0) }
        return nums.max()
    }

    private func formatDeliveryDate(days: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }

    private struct ResolvedCategoryInfo {
        let categoryName: String?
        let categorySlug: String?
        let subCategoryName: String?
        let subCategorySlug: String?

        init(
            categoryName: String? = nil,
            categorySlug: String? = nil,
            subCategoryName: String? = nil,
            subCategorySlug: String? = nil
        ) {
            self.categoryName = categoryName
            self.categorySlug = categorySlug
            self.subCategoryName = subCategoryName
            self.subCategorySlug = subCategorySlug
        }
    }

    private struct ReviewDbRow: Codable {
        let id: String
        let userId: String?
        let rating: Int?
        let heading: String?
        let comment: String?
        let createdAt: String?
        let images: [String]?
    }

    private struct ProfileNameRow: Codable {
        let id: String
        let fullName: String?
    }

    private struct MeasurementUnitRow: Codable {
        let code: String?
    }

    private struct SellerKycPinRow: Codable {
        let sellerId: String?
        let businessPostalCode: String?
    }

    private struct SellerIdRow: Codable {
        let sellerId: String?
    }
}
