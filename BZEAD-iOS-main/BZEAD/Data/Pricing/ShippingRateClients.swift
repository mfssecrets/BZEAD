import Foundation

struct ShiprocketTier: Codable {
    let tier: String
    let rate: Double
    let etd: String
    let estimatedDays: String
    let carrierName: String?
    let serviceLevel: String?
    let rateId: String?
    let provider: String?

    init(
        tier: String,
        rate: Double,
        etd: String = "",
        estimatedDays: String = "",
        carrierName: String? = nil,
        serviceLevel: String? = nil,
        rateId: String? = nil,
        provider: String? = nil
    ) {
        self.tier = tier
        self.rate = rate
        self.etd = etd
        self.estimatedDays = estimatedDays
        self.carrierName = carrierName
        self.serviceLevel = serviceLevel
        self.rateId = rateId
        self.provider = provider
    }
}

private struct ShiprocketDomesticResponse: Codable {
    let tiers: [ShiprocketTier]?
    let domestic: Bool?
}

struct ShiprocketIntlResponse: Codable {
    let tiers: [ShiprocketTier]?
    let freeShippingAboveInr: Double?
}

struct ShippoRateResponse: Codable {
    let cheapest: ShippoRateTier?
    let tiers: [String: ShippoRateTier]?
    let provider: String?
}

struct ShippoRateTier: Codable {
    let rate: Double?
    let currency: String?
    let estimatedDeliveryDays: Int?
    let courierName: String?
    let serviceLevel: String?
    let rateId: String?
}

enum ShippingRateClients {
    private static func postEdge<T: Decodable>(_ path: String, body: [String: Any]) async -> T? {
        let http = SupabaseHTTP.shared
        var headers = http.anonHeaders()
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/functions/v1/\(path)",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else { return nil }
            return try http.decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    static func fetchShiprocketDomestic(
        pickupPincode: String,
        destinationPincode: String,
        weightKg: Double,
        cod: Bool = false
    ) async -> (Double, [ShiprocketTier])? {
        let body: [String: Any] = [
            "pickup_postcode": pickupPincode,
            "delivery_postcode": destinationPincode,
            "weight": weightKg,
            "cod": cod,
            "domestic": true,
        ]
        guard let result: ShiprocketDomesticResponse = await postEdge("shiprocket-rate", body: body) else {
            return nil
        }
        let tiers = result.tiers ?? []
        if tiers.isEmpty { return nil }
        let std = tiers.first(where: { $0.tier == "standard" }) ?? tiers[0]
        return (std.rate, tiers)
    }

    static func fetchShiprocketIntl(
        pickupPostcode: String,
        deliveryCountry: String,
        deliveryPostcode: String,
        weightKg: Double
    ) async -> ShiprocketIntlResponse? {
        let body: [String: Any] = [
            "pickup_postcode": pickupPostcode,
            "delivery_country": deliveryCountry,
            "delivery_postcode": deliveryPostcode,
            "weight": weightKg,
        ]
        return await postEdge("shiprocket-rate", body: body)
    }

    static func fetchShippoRate(
        fromCountry: String,
        fromZip: String,
        toCountry: String,
        toZip: String,
        weightG: Int,
        lengthCm: Double,
        widthCm: Double,
        heightCm: Double
    ) async -> ShippoRateResponse? {
        let body: [String: Any] = [
            "from_country": fromCountry,
            "from_zip": fromZip,
            "to_country": toCountry,
            "to_zip": toZip,
            "weight_g": weightG,
            "length_cm": lengthCm,
            "width_cm": widthCm,
            "height_cm": heightCm,
        ]
        return await postEdge("shippo-rate", body: body)
    }
}
