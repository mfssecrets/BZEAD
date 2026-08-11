import CoreLocation
import Foundation

final class LocationRepository: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let defaults = UserDefaults(suiteName: "bzead_location") ?? .standard
    private let cacheKey = "detected_location"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func hasPermission() -> Bool {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            return true
        default:
            return false
        }
    }

    func requestPermission() {
        manager.requestWhenInUseAuthorization()
    }

    func cachedLocation() async -> ResolvedLocation? {
        guard let raw = defaults.string(forKey: cacheKey) else { return nil }
        guard let data = raw.data(using: .utf8) else { return nil }
        return try? decoder.decode(ResolvedLocation.self, from: data)
    }

    func detectLocation() async -> Result<ResolvedLocation, Error> {
        guard hasPermission() else {
            return .failure(NSError(
                domain: "LocationRepository",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Location permission not granted"]
            ))
        }

        do {
            let location = try await requestCurrentLocation()
            let geocoder = CLGeocoder()
            let placemarks = try await geocoder.reverseGeocodeLocation(location)
            let address = placemarks.first

            let resolved = ResolvedLocation(
                city: address?.locality?.isEmpty == false ? address?.locality ?? "" : address?.subAdministrativeArea ?? "",
                state: address?.administrativeArea ?? "",
                country: address?.country ?? "",
                countryCode: address?.isoCountryCode ?? "",
                postalCode: address?.postalCode ?? "",
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                resolvedAt: String(Int64(Date().timeIntervalSince1970 * 1000))
            )

            if let data = try? encoder.encode(resolved),
               let json = String(data: data, encoding: .utf8) {
                defaults.set(json, forKey: cacheKey)
            }
            return .success(resolved)
        } catch {
            if (error as NSError).domain == "LocationRepository" {
                return .failure(error)
            }
            return .failure(NSError(
                domain: "LocationRepository",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Unable to get GPS location. Turn on location services."]
            ))
        }
    }

    private func requestCurrentLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        continuation?.resume(returning: location)
        continuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}
