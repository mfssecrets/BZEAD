import Foundation

final class AuthRepository {
    private let sessionStore: SessionStore
    private let http: SupabaseHTTP
    private static let otpRegex = try! NSRegularExpression(pattern: "^\\d{6}$")

    init(sessionStore: SessionStore = .shared, http: SupabaseHTTP = .shared) {
        self.sessionStore = sessionStore
        self.http = http
    }

    func currentSession() async -> BuyerSession? {
        await sessionStore.currentSession()
    }

    func signOut() async {
        await sessionStore.clear()
    }

    func deleteAccount(session: BuyerSession, password: String, reason: String) async -> SimpleResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }
        if password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .error("Password is required")
        }
        if reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .error("Please select a reason for deleting your account")
        }

        do {
            var headers = http.anonHeaders()
            headers["Authorization"] = "Bearer \(session.accessToken)"
            headers["Content-Type"] = "application/json"

            let body = try http.encodeBody(DeleteAccountRequest(password: password, reason: reason))
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/functions/v1/delete-account",
                headers: headers,
                body: body
            )

            let decoded = try? http.decode(DeleteAccountResponse.self, from: data)
            if http.isSuccess(response), decoded?.ok == true {
                await sessionStore.clear()
                return .success
            }

            let message = decoded?.error
                ?? (try? http.decode(AuthErrorBody.self, from: data))?.bestMessage
                ?? http.bodyAsText(data).isEmpty ? "Failed to delete account" : http.bodyAsText(data)
            return .error(message)
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to delete account"))
        }
    }

    func fetchCountries() async -> [CountryOption] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let url = "\(SupabaseConfig.url)/rest/v1/countries" +
            "?is_active=eq.true" +
            "&select=id,country_name,short_code,currency_code,dialing_code" +
            "&order=country_name"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([CountryRow].self, from: data)
            return rows.map {
                CountryOption(id: $0.id, name: $0.countryName, currency: $0.currencyCode ?? "")
            }
        } catch {
            return []
        }
    }

    func signUpBuyer(
        email: String,
        password: String,
        fullName: String,
        countryId: String,
        currency: String?
    ) async -> SimpleResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let err = AuthValidator.validateEmail(normalizedEmail) { return .error(err) }
        if let err = AuthValidator.validateFullName(fullName) { return .error(err) }
        let passwordErrors = AuthValidator.validatePassword(password)
        if let first = passwordErrors.first { return .error(first) }
        if countryId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .error("Please select your country")
        }

        do {
            let request = SignUpRequest(
                email: normalizedEmail,
                password: password,
                data: SignUpMetadata(
                    fullName: fullName.trimmingCharacters(in: .whitespacesAndNewlines),
                    role: "user",
                    currency: currency,
                    countryId: countryId
                ),
                emailRedirectTo: "\(SupabaseConfig.publicAppUrl)/otp-verification"
            )
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let body = try http.encodeBody(request)
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/signup",
                headers: headers,
                body: body
            )
            if !http.isSuccess(response) {
                return .error(await mapAuthError(data: data, response: response, fallback: "Failed to sign up"))
            }

            let signUp = try http.decode(SignUpResponse.self, from: data)
            if let identities = signUp.identities, identities.isEmpty {
                return .error("A user account already exists with this email address. Please use another email address.")
            }
            return .success
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to sign up"))
        }
    }

    func resetPassword(email: String) async -> SimpleResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let err = AuthValidator.validateEmail(normalizedEmail) { return .error(err) }

        do {
            let request = RecoverRequest(
                email: normalizedEmail,
                redirectTo: "\(SupabaseConfig.publicAppUrl)/new-password"
            )
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let body = try http.encodeBody(request)
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/recover",
                headers: headers,
                body: body
            )
            if !http.isSuccess(response) {
                return .error(await mapAuthError(data: data, response: response, fallback: "Failed to send reset code"))
            }
            return .success
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to send reset code"))
        }
    }

    func confirmSignUp(
        email: String,
        otpCode: String,
        fullName: String?,
        countryId: String?
    ) async -> AuthResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedOtp = otpCode.trimmingCharacters(in: .whitespacesAndNewlines)
        let otpRange = NSRange(trimmedOtp.startIndex..., in: trimmedOtp)
        if Self.otpRegex.firstMatch(in: trimmedOtp, range: otpRange) == nil {
            return .error("Please enter a 6-digit OTP code")
        }

        do {
            let request = VerifyOtpRequest(email: normalizedEmail, token: trimmedOtp, type: "signup")
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let body = try http.encodeBody(request)
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/verify",
                headers: headers,
                body: body
            )
            if !http.isSuccess(response) {
                let message = await mapAuthError(data: data, response: response, fallback: "Failed to verify OTP. Please try again.")
                if message.localizedCaseInsensitiveContains("already") {
                    return .error("This account is already verified. Please sign in.")
                }
                return .error(message)
            }

            let signIn = try http.decode(SignInResponse.self, from: data)
            await applySignupProfileFields(
                accessToken: signIn.accessToken,
                userId: signIn.user.id,
                email: signIn.user.email ?? normalizedEmail,
                fullName: fullName,
                countryId: countryId
            )

            let session = BuyerSession(
                userId: signIn.user.id,
                email: signIn.user.email ?? normalizedEmail,
                role: "user",
                accessToken: signIn.accessToken,
                refreshToken: signIn.refreshToken
            )
            await sessionStore.save(session)
            return .success(session)
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to verify OTP"))
        }
    }

    func confirmPasswordReset(email: String, otpCode: String, newPassword: String) async -> SimpleResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedOtp = otpCode.trimmingCharacters(in: .whitespacesAndNewlines)
        let otpRange = NSRange(trimmedOtp.startIndex..., in: trimmedOtp)
        if Self.otpRegex.firstMatch(in: trimmedOtp, range: otpRange) == nil {
            return .error("Please enter a 6-digit OTP code")
        }
        let passwordErrors = AuthValidator.validatePassword(newPassword)
        if let first = passwordErrors.first { return .error(first) }

        do {
            let verifyRequest = VerifyOtpRequest(email: normalizedEmail, token: trimmedOtp, type: "recovery")
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let verifyBody = try http.encodeBody(verifyRequest)
            let (verifyData, verifyResponse) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/verify",
                headers: headers,
                body: verifyBody
            )
            if !http.isSuccess(verifyResponse) {
                return .error(await mapAuthError(
                    data: verifyData,
                    response: verifyResponse,
                    fallback: "Failed to verify reset code. Please try again."
                ))
            }

            let verify = try http.decode(SignInResponse.self, from: verifyData)
            var updateHeaders = http.anonHeaders()
            updateHeaders["Authorization"] = "Bearer \(verify.accessToken)"
            updateHeaders["Content-Type"] = "application/json"
            let updateBody = try http.encodeBody(UpdateUserRequest(password: newPassword))
            let (updateData, updateResponse) = try await http.putAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/user",
                headers: updateHeaders,
                body: updateBody
            )
            if !http.isSuccess(updateResponse) {
                return .error(await mapAuthError(
                    data: updateData,
                    response: updateResponse,
                    fallback: "Password update failed after code verification. Please request a new reset code."
                ))
            }

            await sessionStore.clear()
            return .success
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to reset password"))
        }
    }

    func resendSignupOtp(email: String) async -> SimpleResult {
        await resendOtp(email: email, type: "signup", fallback: "Failed to resend OTP")
    }

    func resendPasswordReset(email: String) async -> SimpleResult {
        await resetPassword(email: email)
    }

    func signInBuyer(email: String, password: String) async -> AuthResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let err = AuthValidator.validateEmail(normalizedEmail) { return .error(err) }
        if password.isEmpty { return .error("Password is required") }

        do {
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let body = try http.encodeBody(SignInRequest(email: normalizedEmail, password: password))
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/token?grant_type=password",
                headers: headers,
                body: body
            )
            if !http.isSuccess(response) {
                return .error(await mapSignInError(data: data, response: response))
            }

            let signIn = try http.decode(SignInResponse.self, from: data)
            let profile = await fetchProfile(accessToken: signIn.accessToken, userId: signIn.user.id)
            let role = resolveRole(user: signIn.user, profile: profile)

            if profile?.isBanned == true {
                return .error("Your account has been suspended. Please contact support.")
            }
            if role == "seller" || role == "admin" {
                return .wrongRole(role)
            }

            let session = BuyerSession(
                userId: signIn.user.id,
                email: signIn.user.email ?? normalizedEmail,
                role: role,
                accessToken: signIn.accessToken,
                refreshToken: signIn.refreshToken
            )
            await sessionStore.save(session)
            return .success(session)
        } catch {
            return .error(mapNetworkError(error, fallback: "Failed to sign in"))
        }
    }

    private func applySignupProfileFields(
        accessToken: String,
        userId: String,
        email: String,
        fullName: String?,
        countryId: String?
    ) async {
        let trimmedName = fullName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasName = !(trimmedName?.isEmpty ?? true)
        let hasCountry = !(countryId?.isEmpty ?? true)
        if !hasName && !hasCountry { return }

        var patchHeaders = http.anonHeaders()
        patchHeaders["Authorization"] = "Bearer \(accessToken)"
        patchHeaders["Content-Type"] = "application/json"
        patchHeaders["Prefer"] = "return=minimal"

        let patchBody = try? http.encodeBody(ProfileUpdateRequest(
            fullName: hasName ? trimmedName : nil,
            countryId: hasCountry ? countryId : nil
        ))
        if let patchBody {
            _ = try? await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/profiles?id=eq.\(userId)",
                headers: patchHeaders,
                body: patchBody
            )
        }

        var metadata: [String: String] = [:]
        if hasName, let trimmedName { metadata["full_name"] = trimmedName }
        if hasCountry, let countryId { metadata["country_id"] = countryId }
        if !metadata.isEmpty {
            var putHeaders = http.anonHeaders()
            putHeaders["Authorization"] = "Bearer \(accessToken)"
            putHeaders["Content-Type"] = "application/json"
            let putBody = try? http.encodeBody(UpdateUserMetadataRequest(data: metadata))
            if let putBody {
                _ = try? await http.putAllowingErrorStatus(
                    "\(SupabaseConfig.url)/auth/v1/user",
                    headers: putHeaders,
                    body: putBody
                )
            }
        }
    }

    private func resendOtp(email: String, type: String, fallback: String) async -> SimpleResult {
        guard SupabaseConfig.isConfigured() else {
            return .error("Supabase is not configured. Add SUPABASE_ANON_KEY to local.properties.")
        }

        do {
            let request = ResendOtpRequest(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                type: type
            )
            var headers = http.anonHeaders()
            headers["Content-Type"] = "application/json"
            let body = try http.encodeBody(request)
            let (data, response) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/resend",
                headers: headers,
                body: body
            )
            if !http.isSuccess(response) {
                return .error(await mapAuthError(data: data, response: response, fallback: fallback))
            }
            return .success
        } catch {
            return .error(mapNetworkError(error, fallback: fallback))
        }
    }

    private func fetchProfile(accessToken: String, userId: String) async -> ProfileRow? {
        var headers = http.anonHeaders()
        headers["Authorization"] = "Bearer \(accessToken)"
        let url = "\(SupabaseConfig.url)/rest/v1/profiles?id=eq.\(userId)&select=role,is_banned"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: headers)
            guard http.isSuccess(response) else { return nil }
            return try http.decode([ProfileRow].self, from: data).first
        } catch {
            return nil
        }
    }

    private func resolveRole(user: AuthUserDto, profile: ProfileRow?) -> String {
        if let role = normalizeRole(user.userMetadata?.role) { return role }
        return normalizeRole(profile?.role) ?? "user"
    }

    private func normalizeRole(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else { return nil }
        switch trimmed {
        case "user", "seller", "admin": return trimmed
        default: return nil
        }
    }

    private func mapSignInError(data: Data, response: HTTPURLResponse) async -> String {
        let raw = await readErrorMessage(data: data)
        if raw.localizedCaseInsensitiveContains("Invalid login credentials") {
            return "Incorrect email or password."
        }
        if raw.localizedCaseInsensitiveContains("Email not confirmed") {
            return "Please verify your email first. Check your inbox for the OTP code."
        }
        if raw.localizedCaseInsensitiveContains("Database error querying schema") {
            return "Your account auth record is incomplete. Please contact support."
        }
        return raw.isEmpty ? "Failed to sign in" : raw
    }

    private func mapAuthError(data: Data, response: HTTPURLResponse, fallback: String) async -> String {
        let raw = await readErrorMessage(data: data)
        if raw.localizedCaseInsensitiveContains("already exists")
            || raw.localizedCaseInsensitiveContains("already registered")
            || raw.localizedCaseInsensitiveContains("duplicate key") {
            return "A user account already exists with this email address. Please use another email address."
        }
        return raw.isEmpty ? fallback : raw
    }

    private func readErrorMessage(data: Data) async -> String {
        if let body = try? http.decode(AuthErrorBody.self, from: data), let message = body.bestMessage {
            return message
        }
        return http.bodyAsText(data)
    }

    private func mapNetworkError(_ error: Error, fallback: String) -> String {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if message.localizedCaseInsensitiveContains("timeout")
            || message.localizedCaseInsensitiveContains("failed to connect")
            || message.localizedCaseInsensitiveContains("Unable to resolve host")
            || message.localizedCaseInsensitiveContains("not connected to internet") {
            return "Network error — please check your internet connection and try again."
        }
        return message.isEmpty ? fallback : message
    }
}
