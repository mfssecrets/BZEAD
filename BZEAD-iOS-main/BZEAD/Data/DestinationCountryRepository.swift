import Foundation

/// Mirrors web useDestinationCountry priority exactly.
final class DestinationCountryRepository {
    static let guestFallback = "United States"

    private let profileRepository = ProfileRepository()
    private let addressRepository = AddressRepository()

    func resolveCountry(session: BuyerSession, locationRepository: LocationRepository) async -> String {
        let candidates = await resolveCountryCandidates(session: session, locationRepository: locationRepository)
        return candidates.first ?? Self.guestFallback
    }

    func resolveCountryCandidates(session: BuyerSession, locationRepository: LocationRepository) async -> [String] {
        guard SupabaseConfig.isConfigured() else { return [Self.guestFallback] }

        let detected = await locationRepository.cachedLocation()?.country
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let shipping = (await CheckoutPreferencesRepository.readShippingCountry())
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let profileCountryId = await profileRepository.fetchProfile(session: session)?.countryId
        let profileCountry = profileCountryId.flatMap { await fetchCountryName(countryId: $0) }?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let addresses = await addressRepository.fetchAddresses(session: session)
        let defaultAddress = addresses.first(where: { $0.isDefault }) ?? addresses.first
        let addressCountry = defaultAddress?.country.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let ordered = [shipping, profileCountry, detected, addressCountry]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var distinct: [String] = []
        for value in ordered where !distinct.contains(value) {
            distinct.append(value)
        }
        return distinct.isEmpty ? [Self.guestFallback] : distinct
    }

    func resolveLocationLabel(session: BuyerSession, locationRepository: LocationRepository) async -> String {
        let pricingCountry = await resolveCountry(session: session, locationRepository: locationRepository)
        let addresses = await addressRepository.fetchAddresses(session: session)
        let defaultAddress = addresses.first(where: { $0.isDefault }) ?? addresses.first
        if let defaultAddress {
            let label = [defaultAddress.city, defaultAddress.state, defaultAddress.country]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
            if !label.isEmpty { return label }
        }

        if let cached = await locationRepository.cachedLocation()?.label(),
           !cached.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return cached
        }

        return pricingCountry
    }

    private func fetchCountryName(countryId: String) async -> String? {
        let http = SupabaseHTTP.shared
        let url = "\(SupabaseConfig.url)/rest/v1/countries" +
            "?id=eq.\(countryId)" +
            "&select=country_name,short_code,country_code,iso2" +
            "&limit=1"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return nil }
            let row = try http.decode([CountryNameRow].self, from: data).first
            return row?.countryName ?? row?.shortCode ?? row?.countryCode ?? row?.iso2
        } catch {
            return nil
        }
    }

    private struct CountryNameRow: Codable {
        let countryName: String?
        let shortCode: String?
        let countryCode: String?
        let iso2: String?
    }
}
