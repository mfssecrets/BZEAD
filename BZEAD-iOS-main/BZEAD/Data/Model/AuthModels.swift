import Foundation

enum OtpPurpose {
    case signup
    case passwordReset
}

struct SignInRequest: Codable {
    let email: String
    let password: String
}

struct SignUpRequest: Codable {
    let email: String
    let password: String
    let data: SignUpMetadata
    let emailRedirectTo: String?
}

struct SignUpMetadata: Codable {
    let fullName: String
    let role: String
    let currency: String?
    let phone: String
    let countryId: String?

    init(
        fullName: String,
        role: String = "user",
        currency: String? = nil,
        phone: String = "",
        countryId: String? = nil
    ) {
        self.fullName = fullName
        self.role = role
        self.currency = currency
        self.phone = phone
        self.countryId = countryId
    }
}

struct SignUpResponse: Codable {
    let user: AuthUserDto?
    let identities: [IdentityDto]?
}

struct IdentityDto: Codable {
    let id: String?
}

struct RecoverRequest: Codable {
    let email: String
    let redirectTo: String
}

struct VerifyOtpRequest: Codable {
    let email: String
    let token: String
    let type: String
}

struct ResendOtpRequest: Codable {
    let email: String
    let type: String
}

struct UpdateUserRequest: Codable {
    let password: String
}

struct UpdateUserMetadataRequest: Codable {
    let data: [String: String]
}

struct ProfileUpdateRequest: Codable {
    let fullName: String?
    let countryId: String?
}

struct CountryRow: Codable {
    let id: String
    let countryName: String
    let shortCode: String?
    let currencyCode: String?
    let dialingCode: String?
}

struct SignInResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int?
    let user: AuthUserDto
}

struct AuthUserDto: Codable {
    let id: String
    let email: String?
    let userMetadata: UserMetadataDto?
}

struct UserMetadataDto: Codable {
    let role: String?
    let fullName: String?
    let countryId: String?
}

struct ProfileRow: Codable {
    let role: String?
    let isBanned: Bool?
}

struct AuthErrorBody: Codable {
    let error: String?
    let errorDescription: String?
    let msg: String?
    let message: String?

    var bestMessage: String? {
        errorDescription ?? message ?? msg ?? error
    }
}

struct CountryOption {
    let id: String
    let name: String
    let currency: String
}

struct BuyerSession: Codable, Equatable {
    let userId: String
    let email: String
    let role: String
    let accessToken: String
    let refreshToken: String
}

enum AuthResult {
    case success(BuyerSession)
    case wrongRole(String)
    case error(String)
}

enum SimpleResult {
    case success
    case error(String)
}

struct DeleteAccountRequest: Codable {
    let password: String
    let reason: String
}

struct DeleteAccountResponse: Codable {
    let ok: Bool?
    let error: String?
}
