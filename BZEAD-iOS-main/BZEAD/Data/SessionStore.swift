import Combine
import Foundation

final class SessionStore {
    static let shared = SessionStore()

    private let defaults: UserDefaults
    private let accessTokenKey = "access_token"
    private let refreshTokenKey = "refresh_token"
    private let userIdKey = "user_id"
    private let emailKey = "email"
    private let roleKey = "role"

    private let sessionSubject = CurrentValueSubject<BuyerSession?, Never>(nil)

    var sessionPublisher: AnyPublisher<BuyerSession?, Never> {
        sessionSubject.eraseToAnyPublisher()
    }

    init(defaults: UserDefaults = UserDefaults(suiteName: SupabaseConfig.authStorageKey) ?? .standard) {
        self.defaults = defaults
        sessionSubject.send(readSession())
    }

    func currentSession() async -> BuyerSession? {
        readSession()
    }

    func save(_ session: BuyerSession) async {
        defaults.set(session.accessToken, forKey: accessTokenKey)
        defaults.set(session.refreshToken, forKey: refreshTokenKey)
        defaults.set(session.userId, forKey: userIdKey)
        defaults.set(session.email, forKey: emailKey)
        defaults.set(session.role, forKey: roleKey)
        sessionSubject.send(session)
    }

    func clear() async {
        defaults.removeObject(forKey: accessTokenKey)
        defaults.removeObject(forKey: refreshTokenKey)
        defaults.removeObject(forKey: userIdKey)
        defaults.removeObject(forKey: emailKey)
        defaults.removeObject(forKey: roleKey)
        sessionSubject.send(nil)
    }

    private func readSession() -> BuyerSession? {
        let accessToken = defaults.string(forKey: accessTokenKey) ?? ""
        let refreshToken = defaults.string(forKey: refreshTokenKey) ?? ""
        let userId = defaults.string(forKey: userIdKey) ?? ""
        let email = defaults.string(forKey: emailKey) ?? ""
        let role = defaults.string(forKey: roleKey) ?? ""

        guard !accessToken.isEmpty, !userId.isEmpty else { return nil }

        return BuyerSession(
            userId: userId,
            email: email,
            role: role.isEmpty ? "user" : role,
            accessToken: accessToken,
            refreshToken: refreshToken
        )
    }
}
