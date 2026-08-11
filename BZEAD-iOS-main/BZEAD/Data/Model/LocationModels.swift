import Foundation

struct ResolvedLocation: Codable {
    var city: String = ""
    var state: String = ""
    var country: String = ""
    var countryCode: String = ""
    var postalCode: String = ""
    var latitude: Double = 0
    var longitude: Double = 0
    var resolvedAt: String = ""

    func label() -> String {
        [city, state, country].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}
