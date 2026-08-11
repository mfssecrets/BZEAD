import Foundation

enum CheckoutPricingService {
    private static let refCacheMs: Int64 = 5 * 60 * 1000
    private static var refCache: RefData?
    private static let indiaTokens: Set<String> = ["INDIA", "IN", "IND"]
    private static let tableOnlyRoutes: Set<String> = ["IN->MT", "IN->US", "IN->FR", "IN->DE", "IN->CH", "IN->KE", "IN->AL"]
    private static let iso3ToIso2 = ["IND": "IN", "GBR": "GB", "IRL": "IE"]
    private static let countryAliases: [String: [String]] = [
        "IN": ["IN", "IND", "INDIA"],
        "GB": ["GB", "GBR", "UK", "UNITEDKINGDOM", "ENGLAND", "SCOTLAND", "WALES", "NORTHERNIRELAND"],
        "IE": ["IE", "IRL", "IRELAND"],
    ]

    private struct RefData {
        let countries: [PricingCountryRow]
        let measurementUnits: [PricingMeasurementUnitRow]
        let shippingProviderConfig: [ShippingProviderConfigRow]
        let checkoutMinOrderRules: [CheckoutMinOrderRuleRow]
        let expiresAt: Int64
    }

    private struct PricingLine {
        let productId: String
        let productName: String
        let quantity: Int
        let sourceCurrency: String
        let sourceUnitPrice: Double
        var convertedUnitPrice: Double
        var convertedLineTotal: Double
        var convertedShippingTotal: Double
        var offerDiscount: Double
    }

    private struct WeightItem {
        let lineIndex: Int
        let productId: String
        let quantity: Int
        let weightPerUnitKg: Double
        let packageLengthCm: Double
        let packageWidthCm: Double
        let packageHeightCm: Double
        let pickupPincode: String
        let sourceCurrency: String
        let fallbackShippingTotal: Double
        let originCountryId: String
        let originCountryToken: String
        let originCountryIso: String
        let sellerId: String
    }

    private struct ShipmentMetrics {
        let totalWeightKg: Double
        let chargeableWeightKg: Double
        let maxL: Double
        let maxW: Double
        let maxH: Double
    }

    private struct PodMatch {
        let standard: Double
        let express: Double
        let currency: String
        let stdEta: String
        let expEta: String
    }

    private struct PricingCountryRow: Codable {
        let id: String?
        let countryName: String?
        let countryCode: String?
        let shortCode: String?
        let iso2: String?
        let currencyCode: String?
    }

    private struct PricingMeasurementUnitRow: Codable {
        let id: String?
        let code: String?
    }

    private struct ShippingProviderConfigRow: Codable {
        let countryCode: String
        let provider: String
        let domestic: Bool
        let international: Bool
    }

    private struct CheckoutMinOrderRuleRow: Codable {
        let originIso2: String?
        let destinationIso2: String?
        let minOrderInr: Double?
    }

    private struct PricingProductRow: Codable {
        let id: String?
        let originCountry: String?
        let originCountryId: String?
        let currency: String?
        let isCodAvailable: Bool?
        let packageWeight: Double?
        let packageWeightUnitId: String?
        let packageLength: Double?
        let packageLengthUnitId: String?
        let packageWidth: Double?
        let packageWidthUnitId: String?
        let packageHeight: Double?
        let packageHeightUnitId: String?
        let sellerId: String?
    }

    private struct PricingOfferRuleRow: Codable {
        let productId: String?
        let offerType: String?
        let buyQuantity: Double?
        let getQuantity: Double?
        let discountPercent: Double?
        let startTime: String?
        let endTime: String?
        let bundleMinQty: Double?
        let bundleDiscount: Double?
    }

    private struct PricingProfileRow: Codable {
        let id: String?
        let countryId: String?
    }

    private struct PricingSellerKycRow: Codable {
        let sellerId: String?
        let businessPostalCode: String?
    }

    private struct MarkupPriceRow: Codable {
        let productId: String?
        let sellingPrice: Double?
    }

    private struct CountryPriceRow: Codable {
        let productId: String?
        let sellingPrice: Double?
    }

    private struct PodRateRow: Codable {
        let weightBandUnit: String?
        let weightBandFrom: Double?
        let weightBandTo: Double?
        let currencyCode: String?
        let standardShippingAmount: Double?
        let standardEstDeliveryDate: String?
        let expressShippingAmount: Double?
        let expressEstDeliveryDate: String?
    }

    static func calculateDestinationCheckoutPricing(
        items: [CheckoutPricingInputItem],
        destinationCountry: String,
        destinationPostalCode: String = "",
        isCod: Bool = false,
        session: BuyerSession? = nil
    ) async -> CheckoutPricingQuote {
        let filtered = items.filter { !$0.productId.isEmpty && $0.quantity > 0 }
        let destCountry = destinationCountry.trimmingCharacters(in: .whitespacesAndNewlines)
        let destPostal = sanitizePostal(destinationPostalCode)
        let rates = await CurrencyConverter.fetchRates()
        let http = SupabaseHTTP.shared

        if filtered.isEmpty {
            return CheckoutPricingQuote(
                currency: await DisplayCurrencyHelper.resolveCheckoutCurrency(destinationCountry: destCountry.isEmpty ? "IN" : destCountry),
                destinationCountry: destCountry,
                subtotal: 0,
                offerDiscount: 0,
                shipping: 0,
                total: 0,
                platformHandlingCharge: 0,
                actualShippingCost: 0,
                platformShippingMargin: 0,
                codEligible: false,
                hasInternationalItems: false,
                lineItems: [],
                minimumOrderConstraint: nil,
                shippingError: nil,
                shippingCarrier: nil,
                shippingServiceLevel: nil,
                shippingProvider: nil,
                shippingRateId: nil,
                estimatedDeliveryDays: nil,
                intlShippingOptions: nil
            )
        }

        let ref = await getRefData()
        let countries = ref.countries
        let targetCurrency = await DisplayCurrencyHelper.resolveCheckoutCurrency(destinationCountry: destCountry.isEmpty ? "IN" : destCountry)
        let productIds = Array(Set(filtered.map(\.productId)))
        let destTokenSet = buildTokenSet(destCountry)
        let destLooksIndia = destTokenSet.contains(where: { indiaTokens.contains($0) })

        var markupByProduct: [String: Double] = [:]
        do {
            var body: [String: Any] = ["p_product_ids": productIds]
            if !destCountry.isEmpty { body["p_country"] = destCountry }
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/get_public_product_prices",
                headers: headers,
                body: body
            )
            if http.isSuccess(response) {
                let markupRows = try http.decode([MarkupPriceRow].self, from: data)
                for row in markupRows {
                    if let pid = row.productId, let price = row.sellingPrice, price > 0 {
                        markupByProduct[pid] = price
                    }
                }
            }
        } catch { }

        async let productsTask: [PricingProductRow] = {
            let url = "\(SupabaseConfig.url)/rest/v1/products?id=in.(\(inClause(productIds)))" +
                "&select=id,origin_country,origin_country_id,currency,is_cod_available," +
                "package_weight,package_weight_unit_id,package_length,package_length_unit_id," +
                "package_width,package_width_unit_id,package_height,package_height_unit_id,seller_id"
            do {
                let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
                guard http.isSuccess(response) else { return [] }
                return try http.decode([PricingProductRow].self, from: data)
            } catch { return [] }
        }()

        async let offersTask: [PricingOfferRuleRow] = {
            let url = "\(SupabaseConfig.url)/rest/v1/offer_rules?product_id=in.(\(inClause(productIds)))" +
                "&is_active=eq.true&select=product_id,offer_type,buy_quantity,get_quantity,discount_percent,start_time,end_time,bundle_min_qty,bundle_discount"
            do {
                let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
                guard http.isSuccess(response) else { return [] }
                return try http.decode([PricingOfferRuleRow].self, from: data)
            } catch { return [] }
        }()

        let productRows = await productsTask
        let offerRows = await offersTask

        let shippoDomestic = Set(ref.shippingProviderConfig.filter { $0.provider == "shippo" && $0.domestic }.map(\.countryCode))
        let shippoIntl = Set(ref.shippingProviderConfig.filter { $0.provider == "shippo" && $0.international }.map(\.countryCode))

        let destRow = countries.first { c in
            buildTokenSet(c.countryName, c.countryCode, c.shortCode, c.iso2).contains(where: { destTokenSet.contains($0) })
        }
        let destCountryId = destRow?.id

        if let destCountryId {
            let url = "\(SupabaseConfig.url)/rest/v1/product_country_selling_prices?product_id=in.(\(inClause(productIds)))" +
                "&country_id=eq.\(destCountryId)&select=product_id,selling_price"
            if let (data, response) = try? await http.getAllowingErrorStatus(url, headers: http.anonHeaders()),
               http.isSuccess(response),
               let countryPrices = try? http.decode([CountryPriceRow].self, from: data) {
                for row in countryPrices {
                    if let pid = row.productId, let price = row.sellingPrice, price >= 0 {
                        markupByProduct[pid] = price
                    }
                }
            }
        }

        let sellerIds = Array(Set(productRows.compactMap(\.sellerId)))
        var profiles: [PricingProfileRow] = []
        if !sellerIds.isEmpty {
            let url = "\(SupabaseConfig.url)/rest/v1/profiles?id=in.(\(inClause(sellerIds)))&select=id,country_id"
            if let (data, response) = try? await http.getAllowingErrorStatus(url, headers: http.anonHeaders()),
               http.isSuccess(response) {
                profiles = (try? http.decode([PricingProfileRow].self, from: data)) ?? []
            }
        }

        var kycRows: [PricingSellerKycRow] = []
        if !sellerIds.isEmpty {
            let url = "\(SupabaseConfig.url)/rest/v1/seller_kyc?seller_id=in.(\(inClause(sellerIds)))&select=seller_id,business_postal_code"
            if let (data, response) = try? await http.getAllowingErrorStatus(url, headers: http.anonHeaders()),
               http.isSuccess(response) {
                kycRows = (try? http.decode([PricingSellerKycRow].self, from: data)) ?? []
            }
        }

        var kycPostal: [String: String] = [:]
        for row in kycRows {
            guard let sid = row.sellerId else { continue }
            let pc = sanitizePostal(row.businessPostalCode ?? "")
            if !pc.isEmpty { kycPostal[sid] = pc }
        }

        let unitCodeById = Dictionary(uniqueKeysWithValues: ref.measurementUnits.compactMap { unit in
            guard let id = unit.id else { return nil }
            return (id, (unit.code ?? "KG").uppercased())
        })
        let countryNameById = Dictionary(uniqueKeysWithValues: ref.countries.compactMap { c in
            guard let id = c.id else { return nil }
            return (id, c.countryName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "")
        })
        let countryCodeById = Dictionary(uniqueKeysWithValues: ref.countries.compactMap { c in
            guard let id = c.id, let code = (c.iso2 ?? c.countryCode)?.uppercased(), !code.isEmpty else { return nil }
            return (id, code)
        })
        var countryCodeByToken: [String: String] = [:]
        for c in ref.countries {
            let code = (c.iso2 ?? c.countryCode ?? "").uppercased()
            for token in buildTokenSet(c.countryName, c.countryCode, c.shortCode, c.iso2) {
                countryCodeByToken[token] = code
            }
        }
        var countryIdByToken: [String: String] = [:]
        for c in ref.countries {
            guard let id = c.id else { continue }
            for token in buildTokenSet(c.countryName, c.countryCode, c.shortCode, c.iso2) {
                countryIdByToken[token] = id
            }
        }

        func resolveIso(_ token: String, countryId: String? = nil) -> String {
            if let countryId, let code = countryCodeById[countryId], !code.isEmpty { return code }
            return countryCodeByToken[normalizeToken(token)] ?? token
        }

        func resolveCountryId(_ token: String, countryId: String? = nil) -> String {
            if let countryId, !countryId.isEmpty { return countryId }
            return countryIdByToken[normalizeToken(token)] ?? ""
        }

        func isShippoDomestic(_ token: String, countryId: String?) -> Bool {
            shippoDomestic.contains(resolveIso(token, countryId: countryId))
        }

        func isShippoIntl(_ token: String, countryId: String?) -> Bool {
            shippoIntl.contains(resolveIso(token, countryId: countryId))
        }

        let destIso = normalizeToken(resolveIso(destCountry, countryId: destCountryId))
        func requiresTableOnly(_ originIso: String) -> Bool {
            tableOnlyRoutes.contains("\(normalizeToken(originIso))->\(destIso)")
        }

        let productById = Dictionary(uniqueKeysWithValues: productRows.compactMap { row in
            guard let id = row.id else { return nil }
            return (id, row)
        })
        let sellerCountryById = Dictionary(uniqueKeysWithValues: profiles.compactMap { row in
            guard let id = row.id else { return nil }
            return (id, row.countryId ?? "")
        })
        var pickupByProduct: [String: String] = [:]
        for (pid, row) in productById {
            if let sid = row.sellerId, let pc = kycPostal[sid] {
                pickupByProduct[pid] = pc
            }
        }

        let productCurrency = Dictionary(uniqueKeysWithValues: productRows.compactMap { row in
            guard let id = row.id else { return nil }
            return (id, (row.currency ?? "INR").uppercased())
        })
        let nowTs = Int64(Date().timeIntervalSince1970 * 1000)
        var offersByProduct: [String: [PricingOfferRuleRow]] = [:]
        for offer in offerRows {
            let pid = offer.productId ?? ""
            let start = offer.startTime.flatMap { ISO8601DateFormatter().date(from: $0) }.map { Int64($0.timeIntervalSince1970 * 1000) }
            let end = offer.endTime.flatMap { ISO8601DateFormatter().date(from: $0) }.map { Int64($0.timeIntervalSince1970 * 1000) }
            if let start, nowTs < start { continue }
            if let end, nowTs > end { continue }
            offersByProduct[pid, default: []].append(offer)
        }

        var lines: [PricingLine] = []
        var domesticGroups: [String: [WeightItem]] = [:]
        var shippoDomGroups: [String: [WeightItem]] = [:]
        var intlItems: [WeightItem] = []
        var hasIntl = false
        var codIneligible = false
        var subtotalInrByOrigin: [String: Double] = [:]

        for item in filtered {
            let row = productById[item.productId]
            let profileCountryId = sellerCountryById[row?.sellerId ?? ""] ?? ""
            let profileCountryName = countryNameById[profileCountryId] ?? ""
            let effectiveOriginId = row?.originCountryId ?? profileCountryId
            let effectiveOriginToken = normalizeToken(row?.originCountry ?? profileCountryName)
            let productOriginToken = normalizeToken(row?.originCountry ?? "")

            let isOriginBuyer = (destCountryId != nil && effectiveOriginId == destCountryId)
                || (!effectiveOriginToken.isEmpty && effectiveOriginToken == normalizeToken(destCountry))
                || (!productOriginToken.isEmpty && productOriginToken == normalizeToken(destCountry))

            if !isOriginBuyer {
                hasIntl = true
                codIneligible = true
            } else if row?.isCodAvailable == false {
                codIneligible = true
            }

            let hasMarkup = markupByProduct[item.productId] != nil
            let sourceUnit = hasMarkup ? markupByProduct[item.productId]! : item.unitPrice
            let sourceCurrency = hasMarkup ? (productCurrency[item.productId] ?? item.currency.uppercased()) : item.currency.uppercased()
            let sourceLine = sourceUnit * Double(item.quantity)

            let lineInr = sourceCurrency == "INR"
                ? sourceLine
                : CurrencyConverter.convert(sourceLine, fromCurrency: sourceCurrency, toCurrency: "INR", rates: rates)
            let originIsoToken = normalizeToken(
                !resolveIso(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId).isEmpty
                    ? resolveIso(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId)
                    : (effectiveOriginToken.isEmpty ? productOriginToken : effectiveOriginToken)
            )
            if !originIsoToken.isEmpty {
                subtotalInrByOrigin[originIsoToken, default: 0] += lineInr
            }

            var sourceOffer = 0.0
            for offer in offersByProduct[item.productId] ?? [] {
                let type = (offer.offerType ?? "").lowercased()
                switch type {
                case "special_day", "special_day_offer":
                    let pct = offer.discountPercent ?? 0
                    if pct >= 0.01, pct <= 100 {
                        sourceOffer = max(sourceOffer, sourceLine * pct / 100)
                    }
                case "bundle_discount":
                    let minQ = Int(offer.bundleMinQty ?? 0)
                    let pct = offer.bundleDiscount ?? 0
                    if minQ > 0, pct >= 0.01, pct <= 100, item.quantity >= minQ {
                        sourceOffer = max(sourceOffer, sourceLine * pct / 100)
                    }
                case "buy_x_get_y":
                    let buy = Int(offer.buyQuantity ?? 0)
                    let get = Int(offer.getQuantity ?? 0)
                    if buy > 0, get > 0, item.quantity >= buy {
                        let free = (item.quantity / buy) * get
                        sourceOffer = max(sourceOffer, min(Double(free), Double(item.quantity)) * sourceUnit)
                    }
                default:
                    break
                }
            }
            sourceOffer = min(sourceOffer, sourceLine)

            var shippingPerUnit = 0.0
            if isOriginBuyer {
                if !isShippoDomestic(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId) {
                    shippingPerUnit = 50.0
                } else {
                    shippingPerUnit = 4.99
                }
            }
            let sourceShipping = shippingPerUnit * Double(item.quantity)
            let hasPickup = pickupByProduct[item.productId] != nil
            let useShiprocket = isOriginBuyer
                && !isShippoDomestic(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId)
                && row != nil && !destPostal.isEmpty && hasPickup
            let useShippoDom = isOriginBuyer
                && isShippoDomestic(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId)
                && row != nil && !destPostal.isEmpty && hasPickup
            let pickup = (useShiprocket || useShippoDom) ? (pickupByProduct[item.productId] ?? "") : ""

            let lineIdx = lines.count
            lines.append(PricingLine(
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                sourceCurrency: sourceCurrency,
                sourceUnitPrice: sourceUnit,
                convertedUnitPrice: CurrencyConverter.round2(CurrencyConverter.convert(sourceUnit, fromCurrency: sourceCurrency, toCurrency: targetCurrency, rates: rates)),
                convertedLineTotal: CurrencyConverter.round2(CurrencyConverter.convert(sourceLine, fromCurrency: sourceCurrency, toCurrency: targetCurrency, rates: rates)),
                convertedShippingTotal: CurrencyConverter.round2(CurrencyConverter.convert(sourceShipping, fromCurrency: sourceCurrency, toCurrency: targetCurrency, rates: rates)),
                offerDiscount: CurrencyConverter.round2(CurrencyConverter.convert(sourceOffer, fromCurrency: sourceCurrency, toCurrency: targetCurrency, rates: rates))
            ))

            if let row, (useShiprocket || useShippoDom), !pickup.isEmpty {
                let sid = row.sellerId ?? ""
                let originId = resolveCountryId(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId)
                let originIso = resolveIso(effectiveOriginToken, countryId: originId.isEmpty ? nil : originId)
                let wUnit = unitCodeById[row.packageWeightUnitId ?? ""] ?? "KG"
                let lUnit = unitCodeById[row.packageLengthUnitId ?? ""] ?? "CM"
                let wdUnit = unitCodeById[row.packageWidthUnitId ?? ""] ?? "CM"
                let hUnit = unitCodeById[row.packageHeightUnitId ?? ""] ?? "CM"
                let wPer = max(normalizeWeightToKg(row.packageWeight ?? 0, unitCode: wUnit), 0.1)
                let l = max(normalizeDimToCm(row.packageLength ?? 0, unitCode: lUnit), 1.0)
                let wd = max(normalizeDimToCm(row.packageWidth ?? 0, unitCode: wdUnit), 1.0)
                let h = max(normalizeDimToCm(row.packageHeight ?? 0, unitCode: hUnit), 1.0)
                let wi = WeightItem(
                    lineIndex: lineIdx,
                    productId: item.productId,
                    quantity: item.quantity,
                    weightPerUnitKg: wPer,
                    packageLengthCm: l,
                    packageWidthCm: wd,
                    packageHeightCm: h,
                    pickupPincode: pickup,
                    sourceCurrency: sourceCurrency,
                    fallbackShippingTotal: sourceShipping,
                    originCountryId: originId,
                    originCountryToken: effectiveOriginToken,
                    originCountryIso: originIso,
                    sellerId: sid
                )
                let key = "\(sid):\(originId.isEmpty ? (originIso.isEmpty ? effectiveOriginToken : originIso) : originId)"
                if useShiprocket {
                    domesticGroups[key, default: []].append(wi)
                } else {
                    shippoDomGroups[key, default: []].append(wi)
                }
            }

            if !isOriginBuyer, let row {
                let wUnit = unitCodeById[row.packageWeightUnitId ?? ""] ?? "KG"
                let wPer = normalizeWeightToKg(row.packageWeight ?? 0, unitCode: wUnit)
                if wPer > 0 {
                    let lUnit = unitCodeById[row.packageLengthUnitId ?? ""] ?? "CM"
                    let wdUnit = unitCodeById[row.packageWidthUnitId ?? ""] ?? "CM"
                    let hUnit = unitCodeById[row.packageHeightUnitId ?? ""] ?? "CM"
                    intlItems.append(WeightItem(
                        lineIndex: lineIdx,
                        productId: item.productId,
                        quantity: item.quantity,
                        weightPerUnitKg: max(wPer, 0.1),
                        packageLengthCm: max(normalizeDimToCm(row.packageLength ?? 0, unitCode: lUnit), 1.0),
                        packageWidthCm: max(normalizeDimToCm(row.packageWidth ?? 0, unitCode: wdUnit), 1.0),
                        packageHeightCm: max(normalizeDimToCm(row.packageHeight ?? 0, unitCode: hUnit), 1.0),
                        pickupPincode: pickupByProduct[item.productId] ?? kycPostal[row.sellerId ?? ""] ?? "",
                        sourceCurrency: sourceCurrency,
                        fallbackShippingTotal: sourceShipping,
                        originCountryId: resolveCountryId(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId),
                        originCountryToken: effectiveOriginToken,
                        originCountryIso: resolveIso(effectiveOriginToken, countryId: effectiveOriginId.isEmpty ? nil : effectiveOriginId),
                        sellerId: row.sellerId ?? ""
                    ))
                }
            }
        }

        var podCache: [String: [PodRateRow]] = [:]

        func loadPodRows(originId: String, destId: String) async -> [PodRateRow] {
            let key = "\(originId):\(destId)"
            if let cached = podCache[key] { return cached }
            let url = "\(SupabaseConfig.url)/rest/v1/product_origin_destination_shipping_rates" +
                "?product_origin_country_id=eq.\(originId)&destination_country_id=eq.\(destId)" +
                "&select=weight_band_unit,weight_band_from,weight_band_to,currency_code,standard_shipping_amount,standard_est_delivery_date,express_shipping_amount,express_est_delivery_date" +
                "&order=weight_band_from.asc"
            var headers = http.anonHeaders()
            if let session, !session.accessToken.isEmpty {
                headers = http.authHeaders(session: session)
            }
            let rows: [PodRateRow]
            if let (data, response) = try? await http.getAllowingErrorStatus(url, headers: headers),
               http.isSuccess(response) {
                rows = (try? http.decode([PodRateRow].self, from: data)) ?? []
            } else {
                rows = []
            }
            podCache[key] = rows
            return rows
        }

        func selectPodRow(_ rows: [PodRateRow], weightKg: Double) -> PodRateRow? {
            guard !rows.isEmpty, weightKg > 0 else { return nil }
            for (idx, row) in rows.enumerated() {
                let unit = (row.weightBandUnit ?? "KG").uppercased()
                let from = row.weightBandFrom ?? 0
                let to = row.weightBandTo ?? 0
                if to <= from { continue }
                let converted = convertKgToUnit(weightKg, unitCode: unit)
                let last = idx == rows.count - 1
                if converted >= from && (converted < to || (last && converted <= to)) {
                    return row
                }
            }
            return nil
        }

        func resolvePod(originId: String, weightKg: Double) async -> PodMatch? {
            guard let destId = destCountryId else { return nil }
            guard let row = selectPodRow(await loadPodRows(originId: originId, destId: destId), weightKg: weightKg) else { return nil }
            return PodMatch(
                standard: max(0, row.standardShippingAmount ?? 0),
                express: max(0, row.expressShippingAmount ?? 0),
                currency: (row.currencyCode ?? "INR").uppercased(),
                stdEta: row.standardEstDeliveryDate ?? "",
                expEta: (row.expressEstDeliveryDate ?? "").isEmpty ? (row.standardEstDeliveryDate ?? "") : (row.expressEstDeliveryDate ?? "")
            )
        }

        func shipmentMetrics(_ items: [WeightItem]) -> ShipmentMetrics {
            let totalW = items.reduce(0.0) { $0 + $1.weightPerUnitKg * Double($1.quantity) }
            let maxL = items.map(\.packageLengthCm).max() ?? 1.0
            let maxWd = items.map(\.packageWidthCm).max() ?? 1.0
            let maxH = items.map(\.packageHeightCm).max() ?? 1.0
            let vol = (maxL * maxWd * maxH) / 5000.0
            return ShipmentMetrics(
                totalWeightKg: totalW,
                chargeableWeightKg: max(totalW, vol, 0.1),
                maxL: maxL,
                maxW: maxWd,
                maxH: maxH
            )
        }

        func distributePod(_ items: [WeightItem], amount: Double, currency: String) {
            let ship = shipmentMetrics(items)
            let totalW = ship.totalWeightKg > 0 ? ship.totalWeightKg : 1.0
            for wi in items {
                let share = amount * (wi.weightPerUnitKg * Double(wi.quantity) / totalW)
                lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                    CurrencyConverter.convert(share, fromCurrency: currency, toCurrency: targetCurrency, rates: rates)
                )
            }
        }

        var intlTiers: [ShiprocketTier] = []
        var intlStdRate = 0.0
        var intlRateCurrency = "INR"
        var missingPod = false
        var intlFreeThreshold = 0.0
        var shiprocketIntlForFree: [WeightItem] = []
        var domesticError: String?
        var intlError: String?
        var shippoDomTiers: [ShiprocketTier] = []

        for groupItems in domesticGroups.values {
            guard !groupItems.isEmpty else { continue }
            let first = groupItems[0]
            let ship = shipmentMetrics(groupItems)
            if let pod = await resolvePod(originId: first.originCountryId, weightKg: ship.chargeableWeightKg) {
                distributePod(groupItems, amount: pod.standard, currency: pod.currency)
                continue
            }
            if let result = await ShippingRateClients.fetchShiprocketDomestic(
                pickupPincode: first.pickupPincode,
                destinationPincode: destPostal,
                weightKg: ship.chargeableWeightKg,
                cod: isCod
            ) {
                let rate = result.0
                let totalW = ship.totalWeightKg > 0 ? ship.totalWeightKg : 1.0
                for wi in groupItems {
                    let share = rate * (wi.weightPerUnitKg * Double(wi.quantity) / totalW)
                    lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                        CurrencyConverter.convert(share, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates)
                    )
                }
            } else {
                for wi in groupItems {
                    lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                        CurrencyConverter.convert(wi.fallbackShippingTotal, fromCurrency: wi.sourceCurrency, toCurrency: targetCurrency, rates: rates)
                    )
                }
            }
        }

        for groupItems in shippoDomGroups.values {
            guard !groupItems.isEmpty else { continue }
            let first = groupItems[0]
            let ship = shipmentMetrics(groupItems)
            if let pod = await resolvePod(originId: first.originCountryId, weightKg: ship.chargeableWeightKg) {
                distributePod(groupItems, amount: pod.standard, currency: pod.currency)
                continue
            }
            let resp = await ShippingRateClients.fetchShippoRate(
                fromCountry: first.originCountryIso,
                fromZip: first.pickupPincode,
                toCountry: first.originCountryIso,
                toZip: destPostal,
                weightG: Int(ship.chargeableWeightKg * 1000),
                lengthCm: ship.maxL,
                widthCm: ship.maxW,
                heightCm: ship.maxH
            )
            let cheapest = resp?.cheapest?.rate ?? resp?.tiers?["standard"]?.rate
            let rateCurrency = resp?.cheapest?.currency ?? resp?.tiers?["standard"]?.currency ?? {
                switch first.originCountryIso {
                case "US": return "USD"
                case "CA": return "CAD"
                case "GB": return "GBP"
                default: return "EUR"
                }
            }()
            if let cheapest, cheapest >= 0 {
                let totalW = ship.totalWeightKg > 0 ? ship.totalWeightKg : 1.0
                for wi in groupItems {
                    let share = cheapest * (wi.weightPerUnitKg * Double(wi.quantity) / totalW)
                    lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                        CurrencyConverter.convert(share, fromCurrency: rateCurrency, toCurrency: targetCurrency, rates: rates)
                    )
                }
            }
            if let tiers = resp?.tiers {
                for (key, tier) in tiers where ["standard", "express"].contains(key) {
                    guard let rate = tier.rate else { continue }
                    let days = tier.estimatedDeliveryDays ?? 0
                    shippoDomTiers.append(ShiprocketTier(
                        tier: key,
                        rate: rate,
                        etd: days > 0 ? "\(days) days" : "",
                        estimatedDays: days > 0 ? "\(days)" : "",
                        carrierName: tier.courierName,
                        serviceLevel: tier.serviceLevel,
                        rateId: tier.rateId,
                        provider: resp?.provider ?? "shippo"
                    ))
                }
            }
        }

        let shiprocketIntl = intlItems.filter { !isShippoIntl($0.originCountryToken, countryId: $0.originCountryId.isEmpty ? nil : $0.originCountryId) }
        let shippoIntlItems = intlItems.filter { isShippoIntl($0.originCountryToken, countryId: $0.originCountryId.isEmpty ? nil : $0.originCountryId) }
        let destName = destRow?.countryName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? destRow!.countryName!
            : destCountry

        func groupByRoute(_ items: [WeightItem]) -> [String: [WeightItem]] {
            Dictionary(grouping: items) { wi in
                "\(wi.sellerId):\(wi.originCountryId.isEmpty ? (wi.originCountryIso.isEmpty ? wi.originCountryToken : wi.originCountryIso) : wi.originCountryId)"
            }
        }

        for groupItems in groupByRoute(shiprocketIntl).values {
            guard !groupItems.isEmpty else { continue }
            let first = groupItems[0]
            let ship = shipmentMetrics(groupItems)
            if let pod = await resolvePod(originId: first.originCountryId, weightKg: ship.chargeableWeightKg) {
                distributePod(groupItems, amount: pod.standard, currency: pod.currency)
                if intlTiers.isEmpty {
                    intlRateCurrency = pod.currency
                    intlStdRate = pod.standard
                    intlTiers = [
                        ShiprocketTier(tier: "standard", rate: pod.standard, etd: pod.stdEta, estimatedDays: parseEstimatedDays(pod.stdEta), provider: "bzead-rate-card"),
                        ShiprocketTier(tier: "express", rate: pod.express > 0 ? pod.express : pod.standard, etd: pod.expEta, estimatedDays: parseEstimatedDays(pod.expEta), provider: "bzead-rate-card"),
                    ]
                }
                continue
            }
            let originIso = normalizeToken(first.originCountryIso.isEmpty
                ? resolveIso(first.originCountryToken, countryId: first.originCountryId.isEmpty ? nil : first.originCountryId)
                : first.originCountryIso)
            if requiresTableOnly(originIso) {
                missingPod = true
                for wi in groupItems { lines[wi.lineIndex].convertedShippingTotal = 0 }
                continue
            }
            guard !destName.isEmpty else { continue }
            let pickup = first.pickupPincode.isEmpty ? (kycPostal[first.sellerId] ?? "") : first.pickupPincode
            let resp = await ShippingRateClients.fetchShiprocketIntl(
                pickupPostcode: pickup,
                deliveryCountry: destName,
                deliveryPostcode: destinationPostalCode,
                weightKg: ship.chargeableWeightKg
            )
            let tiers = resp?.tiers ?? []
            guard !tiers.isEmpty else { continue }
            shiprocketIntlForFree.append(contentsOf: groupItems)
            if intlTiers.isEmpty {
                intlTiers = tiers
                intlRateCurrency = "INR"
            }
            if let threshold = resp?.freeShippingAboveInr, threshold > 0 {
                intlFreeThreshold = max(intlFreeThreshold, threshold)
            }
            let std = tiers.first(where: { $0.tier == "standard" }) ?? tiers[0]
            if intlStdRate <= 0 { intlStdRate = std.rate }
            let totalW = ship.totalWeightKg > 0 ? ship.totalWeightKg : 1.0
            for wi in groupItems {
                let share = std.rate * (wi.weightPerUnitKg * Double(wi.quantity) / totalW)
                lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                    CurrencyConverter.convert(share, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates)
                )
            }
        }

        for groupItems in groupByRoute(shippoIntlItems).values {
            guard !groupItems.isEmpty else { continue }
            let first = groupItems[0]
            let ship = shipmentMetrics(groupItems)
            if let pod = await resolvePod(originId: first.originCountryId, weightKg: ship.chargeableWeightKg) {
                distributePod(groupItems, amount: pod.standard, currency: pod.currency)
                if intlTiers.isEmpty {
                    intlRateCurrency = pod.currency
                    intlStdRate = pod.standard
                    intlTiers = [
                        ShiprocketTier(tier: "standard", rate: pod.standard, etd: pod.stdEta, estimatedDays: parseEstimatedDays(pod.stdEta), provider: "bzead-rate-card"),
                        ShiprocketTier(tier: "express", rate: pod.express > 0 ? pod.express : pod.standard, etd: pod.expEta, estimatedDays: parseEstimatedDays(pod.expEta), provider: "bzead-rate-card"),
                    ]
                }
                continue
            }
            let originIso = first.originCountryIso.isEmpty
                ? resolveIso(first.originCountryToken, countryId: first.originCountryId.isEmpty ? nil : first.originCountryId)
                : first.originCountryIso
            if requiresTableOnly(originIso) {
                missingPod = true
                for wi in groupItems { lines[wi.lineIndex].convertedShippingTotal = 0 }
                continue
            }
            guard !destName.isEmpty else { continue }
            let pickup = first.pickupPincode.isEmpty ? (kycPostal[first.sellerId] ?? "") : first.pickupPincode
            let destIsoCode = destRow?.iso2 ?? destRow?.countryCode ?? destName
            let resp = await ShippingRateClients.fetchShippoRate(
                fromCountry: originIso,
                fromZip: pickup,
                toCountry: destIsoCode,
                toZip: destinationPostalCode,
                weightG: Int(ship.chargeableWeightKg * 1000),
                lengthCm: ship.maxL,
                widthCm: ship.maxW,
                heightCm: ship.maxH
            )
            let shippoCur: String = {
                switch originIso.uppercased() {
                case "US": return "USD"
                case "CA": return "CAD"
                case "GB": return "GBP"
                default: return "EUR"
                }
            }()
            var built: [ShiprocketTier] = []
            if let tiers = resp?.tiers {
                for (key, tier) in tiers where ["standard", "premium", "express"].contains(key) {
                    guard let rate = tier.rate else { continue }
                    let days = tier.estimatedDeliveryDays ?? 0
                    built.append(ShiprocketTier(
                        tier: key,
                        rate: rate,
                        etd: days > 0 ? "\(days) days" : "",
                        estimatedDays: days > 0 ? "\(days)" : "",
                        carrierName: tier.courierName,
                        serviceLevel: tier.serviceLevel,
                        rateId: tier.rateId,
                        provider: resp?.provider ?? "shippo"
                    ))
                }
            }
            guard !built.isEmpty else { continue }
            if intlTiers.isEmpty {
                intlTiers = built
                intlRateCurrency = shippoCur
                if let std = built.first(where: { $0.tier == "standard" }) {
                    intlStdRate = std.rate
                }
            }
            guard let std = built.first(where: { $0.tier == "standard" }) else { continue }
            let totalW = ship.totalWeightKg > 0 ? ship.totalWeightKg : 1.0
            for wi in groupItems {
                let share = std.rate * (wi.weightPerUnitKg * Double(wi.quantity) / totalW)
                lines[wi.lineIndex].convertedShippingTotal = CurrencyConverter.round2(
                    CurrencyConverter.convert(share, fromCurrency: shippoCur, toCurrency: targetCurrency, rates: rates)
                )
            }
        }

        if intlFreeThreshold > 0, !shiprocketIntlForFree.isEmpty {
            let originSet = Set(shiprocketIntlForFree.map {
                normalizeToken(resolveIso($0.originCountryToken, countryId: $0.originCountryId.isEmpty ? nil : $0.originCountryId))
            })
            let routeSubtotalInr = originSet.reduce(0.0) { $0 + (subtotalInrByOrigin[$1] ?? 0) }
            if routeSubtotalInr >= intlFreeThreshold {
                for wi in shiprocketIntlForFree {
                    lines[wi.lineIndex].convertedShippingTotal = 0
                }
            }
        }

        if missingPod { intlTiers = [] }

        let actualShipping = lines.reduce(0.0) { $0 + $1.convertedShippingTotal }
        let indiaDomesticLines = Set(domesticGroups.values.flatMap { $0 }.map(\.lineIndex))
        let platformMargin: Double = {
            if destLooksIndia, !indiaDomesticLines.isEmpty {
                return CurrencyConverter.round2(CurrencyConverter.convert(15.0, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates))
            }
            if destLooksIndia {
                let ukDom = Set(shippoDomGroups.values.flatMap { $0 }.map(\.lineIndex))
                let intlIdx = Set(intlItems.map(\.lineIndex))
                let hasOther = lines.indices.contains { i in !ukDom.contains(i) && !intlIdx.contains(i) }
                if hasOther {
                    return CurrencyConverter.round2(CurrencyConverter.convert(15.0, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates))
                }
                return 0
            }
            return 0
        }()

        let subtotal = CurrencyConverter.round2(lines.reduce(0.0) { $0 + $1.convertedLineTotal })
        let offerDiscount = CurrencyConverter.round2(lines.reduce(0.0) { $0 + $1.offerDiscount })
        let shipping = CurrencyConverter.round2(lines.reduce(0.0) { $0 + $1.convertedShippingTotal })
        let payableBeforeCommission = (subtotal - offerDiscount) + shipping
        let platformHandlingCharge = CurrencyConverter.round2(payableBeforeCommission * 0.0)
        let total = CurrencyConverter.round2(payableBeforeCommission + platformHandlingCharge)

        if hasIntl, intlTiers.isEmpty {
            intlError = "Not a Serviceable Area — no shipping available for this route."
        }
        if !hasIntl, !shippoDomGroups.isEmpty, shippoDomTiers.isEmpty {
            domesticError = "Not a Serviceable Area — no shipping available for this route."
        }

        let stdTier = intlTiers.first(where: { $0.tier == "standard" })
        let premTier = intlTiers.first(where: { $0.tier == "premium" })
        let expTier = intlTiers.first(where: { $0.tier == "express" })

        func buildOption(_ tier: ShiprocketTier?, baseStdRate: Double) -> IntlShippingOption? {
            guard let tier, baseStdRate.isFinite else { return nil }
            let delta = tier.rate - baseStdRate
            let shipDelta = CurrencyConverter.convert(delta, fromCurrency: intlRateCurrency, toCurrency: targetCurrency, rates: rates)
            let shipAmt = CurrencyConverter.round2(shipping + shipDelta)
            let tot = CurrencyConverter.round2((subtotal - offerDiscount) + shipAmt)
            return IntlShippingOption(
                shipping: shipAmt,
                total: tot,
                estimatedDays: tier.estimatedDays.isEmpty ? tier.etd : tier.estimatedDays,
                carrierName: tier.carrierName,
                serviceLevel: tier.serviceLevel,
                rateId: tier.rateId,
                provider: tier.provider
            )
        }

        let intlOptions: IntlShippingOptions? = {
            guard hasIntl, !intlTiers.isEmpty else { return nil }
            let base = stdTier?.rate ?? intlStdRate
            return IntlShippingOptions(
                standard: IntlShippingOption(
                    shipping: shipping,
                    total: total,
                    estimatedDays: stdTier?.estimatedDays.isEmpty == false ? stdTier!.estimatedDays : (stdTier?.etd ?? ""),
                    carrierName: stdTier?.carrierName,
                    serviceLevel: stdTier?.serviceLevel,
                    rateId: stdTier?.rateId,
                    provider: stdTier?.provider
                ),
                premium: buildOption(premTier, baseStdRate: base),
                express: buildOption(expTier, baseStdRate: base)
            )
        }()

        let shippingError = intlError ?? domesticError

        var minimumOrderConstraint: MinimumOrderConstraint?
        let matchingRouteRules = ref.checkoutMinOrderRules.compactMap { rule -> (String, String, Double)? in
            let originIsoToken = normalizeToken(rule.originIso2 ?? "")
            let destinationRuleToken = normalizeToken(rule.destinationIso2 ?? "")
            let minimumInr = asFinite(rule.minOrderInr)
            guard !originIsoToken.isEmpty, !destinationRuleToken.isEmpty, minimumInr > 0 else { return nil }
            return (originIsoToken, destinationRuleToken, minimumInr)
        }.filter { $0.1 == destIso }

        for (originIsoToken, _, minimumInr) in matchingRouteRules {
            let currentSubtotalInr = CurrencyConverter.round2(subtotalInrByOrigin[originIsoToken] ?? 0)
            guard currentSubtotalInr > 0 else { continue }
            minimumOrderConstraint = MinimumOrderConstraint(
                minimumInr: CurrencyConverter.round2(minimumInr),
                minimumInCheckoutCurrency: CurrencyConverter.round2(
                    CurrencyConverter.convert(minimumInr, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates)
                ),
                currentSubtotalInr: currentSubtotalInr,
                currentSubtotalInCheckoutCurrency: CurrencyConverter.round2(
                    CurrencyConverter.convert(currentSubtotalInr, fromCurrency: "INR", toCurrency: targetCurrency, rates: rates)
                ),
                isMet: currentSubtotalInr >= minimumInr
            )
            break
        }

        return CheckoutPricingQuote(
            currency: targetCurrency,
            destinationCountry: destCountry,
            subtotal: subtotal,
            offerDiscount: offerDiscount,
            shipping: shipping,
            total: total,
            platformHandlingCharge: platformHandlingCharge,
            actualShippingCost: actualShipping,
            platformShippingMargin: platformMargin,
            codEligible: !codIneligible && !lines.isEmpty && shippingError == nil,
            hasInternationalItems: hasIntl,
            lineItems: lines.map {
                CheckoutPricingLineItem(
                    productId: $0.productId,
                    productName: $0.productName,
                    quantity: $0.quantity,
                    sourceCurrency: $0.sourceCurrency,
                    sourceUnitPrice: $0.sourceUnitPrice,
                    convertedUnitPrice: $0.convertedUnitPrice,
                    convertedLineTotal: $0.convertedLineTotal
                )
            },
            minimumOrderConstraint: minimumOrderConstraint,
            shippingError: shippingError,
            shippingCarrier: stdTier?.carrierName,
            shippingServiceLevel: stdTier?.serviceLevel,
            shippingProvider: stdTier?.provider,
            shippingRateId: stdTier?.rateId,
            estimatedDeliveryDays: stdTier?.estimatedDays.split(separator: "-").first.flatMap { Int($0) },
            intlShippingOptions: intlOptions
        )
    }

    static func withTier(quote: CheckoutPricingQuote, tier: ShippingTier) -> CheckoutPricingQuote {
        let option: IntlShippingOption?
        switch tier {
        case .standard: option = quote.intlShippingOptions?.standard
        case .premium: option = quote.intlShippingOptions?.premium
        case .express: option = quote.intlShippingOptions?.express
        }
        guard let option else { return quote }
        return quote.copy(
            shipping: option.shipping,
            total: option.total,
            shippingCarrier: option.carrierName,
            shippingServiceLevel: option.serviceLevel,
            shippingRateId: option.rateId,
            shippingProvider: option.provider,
            estimatedDeliveryDays: option.estimatedDays.split(separator: "-").first.flatMap { Int($0) }
        )
    }

    // MARK: - Helpers

    private static func getRefData() async -> RefData {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if let cache = refCache, now < cache.expiresAt { return cache }

        let http = SupabaseHTTP.shared
        let countriesUrl = "\(SupabaseConfig.url)/rest/v1/countries?is_active=eq.true&select=id,country_name,country_code,short_code,iso2,currency_code"
        let unitsUrl = "\(SupabaseConfig.url)/rest/v1/measurement_units?is_active=eq.true&select=id,code"
        let providerUrl = "\(SupabaseConfig.url)/rest/v1/shipping_provider_config?active=eq.true&select=country_code,provider,domestic,international"

        let countries: [PricingCountryRow] = {
            guard let (data, response) = try? await http.getAllowingErrorStatus(countriesUrl, headers: http.anonHeaders()),
                  http.isSuccess(response) else { return [] }
            return (try? http.decode([PricingCountryRow].self, from: data)) ?? []
        }()

        let units: [PricingMeasurementUnitRow] = {
            guard let (data, response) = try? await http.getAllowingErrorStatus(unitsUrl, headers: http.anonHeaders()),
                  http.isSuccess(response) else { return [] }
            return (try? http.decode([PricingMeasurementUnitRow].self, from: data)) ?? []
        }()

        let providerConfig: [ShippingProviderConfigRow] = {
            guard let (data, response) = try? await http.getAllowingErrorStatus(providerUrl, headers: http.anonHeaders()),
                  http.isSuccess(response) else { return [] }
            return (try? http.decode([ShippingProviderConfigRow].self, from: data)) ?? []
        }()

        let minOrderRules: [CheckoutMinOrderRuleRow] = {
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            guard let (data, response) = try? await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/rpc/get_active_checkout_min_order_rules",
                headers: headers,
                body: try? http.encodeJSONObject([:])
            ), http.isSuccess(response) else { return [] }
            return (try? http.decode([CheckoutMinOrderRuleRow].self, from: data)) ?? []
        }()

        let data = RefData(
            countries: countries,
            measurementUnits: units,
            shippingProviderConfig: providerConfig,
            checkoutMinOrderRules: minOrderRules,
            expiresAt: now + refCacheMs
        )
        refCache = data
        return data
    }

    private static func normalizeToken(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
    }

    private static func sanitizePostal(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^a-zA-Z0-9]", with: "", options: .regularExpression)
            .uppercased()
    }

    private static func asFinite(_ value: Double?) -> Double {
        guard let value, value.isFinite else { return 0 }
        return value
    }

    private static func buildTokenSet(_ values: String?...) -> Set<String> {
        var tokens = Set<String>()
        for value in values {
            let token = normalizeToken(value ?? "")
            guard !token.isEmpty else { continue }
            tokens.insert(token)
            let iso2 = token.count == 3 ? (iso3ToIso2[token] ?? "") : token
            for alias in countryAliases[iso2] ?? [] {
                tokens.insert(alias)
            }
        }
        return tokens
    }

    private static func normalizeWeightToKg(_ value: Double, unitCode: String) -> Double {
        guard value.isFinite, value > 0 else { return 0 }
        switch unitCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "G": return value / 1000
        case "LB": return value * 0.453592
        case "OZ": return value * 0.0283495
        default: return value
        }
    }

    private static func normalizeDimToCm(_ value: Double, unitCode: String) -> Double {
        guard value.isFinite, value > 0 else { return 0 }
        switch unitCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "MM": return value / 10
        case "M": return value * 100
        case "IN": return value * 2.54
        case "FT": return value * 30.48
        default: return value
        }
    }

    private static func convertKgToUnit(_ weightKg: Double, unitCode: String) -> Double {
        guard weightKg.isFinite, weightKg > 0 else { return 0 }
        switch unitCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "GM", "G": return weightKg * 1000
        case "LB": return weightKg / 0.453592
        case "OZ": return weightKg / 0.0283495
        default: return weightKg
        }
    }

    private static func parseEstimatedDays(_ text: String) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return "" }
        if let match = t.range(of: "(\\d+)\\s*(?:-|to)\\s*(\\d+)", options: .regularExpression) {
            let parts = t[match].components(separatedBy: CharacterSet.decimalDigits.inverted).compactMap { Int($0) }
            if parts.count >= 2 { return "\(parts[0])-\(parts[1])" }
        }
        if let match = t.range(of: "(\\d+)", options: .regularExpression) {
            return String(t[match])
        }
        return ""
    }

    private static func inClause(_ ids: [String]) -> String {
        ids.map { "\"\($0)\"" }.joined(separator: ",")
    }
}
