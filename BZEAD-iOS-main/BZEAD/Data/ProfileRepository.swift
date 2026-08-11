import Foundation

final class ProfileRepository {
    private let http = SupabaseHTTP.shared

    func fetchProfile(session: BuyerSession) async -> ProfileDetail? {
        guard SupabaseConfig.isConfigured() else { return nil }

        let url = "\(SupabaseConfig.url)/rest/v1/profiles" +
            "?id=eq.\(session.userId)" +
            "&select=id,full_name,email,phone,country_id,notification_preferences"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return nil }
            return try http.decode([ProfileDetail].self, from: data).first
        } catch {
            return nil
        }
    }

    func updateProfile(
        session: BuyerSession,
        fullName: String?,
        phone: String?,
        countryId: String? = nil
    ) async -> Result<Void, Error> {
        var body: [String: Any] = [:]
        if let fullName { body["full_name"] = fullName }
        if let phone { body["phone"] = phone }
        if let countryId { body["country_id"] = countryId }

        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/profiles?id=eq.\(session.userId)",
                headers: headers,
                body: try http.encodeJSONObject(body)
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "ProfileRepository", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to update profile" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func updateNotificationPreferences(
        session: BuyerSession,
        preferences: [String: JSONValue]
    ) async -> Result<Void, Error> {
        let body = try? http.encoder.encode(["notification_preferences": preferences])
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/profiles?id=eq.\(session.userId)",
                headers: headers,
                body: body ?? Data()
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "ProfileRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to update notifications" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func changePassword(
        session: BuyerSession,
        currentPassword: String,
        newPassword: String
    ) async -> Result<Void, Error> {
        var verifyHeaders = http.anonHeaders()
        verifyHeaders["Content-Type"] = "application/json"
        let verifyBody = try? http.encodeJSONObject([
            "email": session.email,
            "password": currentPassword,
        ])

        do {
            let (verifyData, verifyResponse) = try await http.postAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/token?grant_type=password",
                headers: verifyHeaders,
                body: verifyBody
            )
            guard http.isSuccess(verifyResponse) else {
                return .failure(NSError(domain: "ProfileRepository", code: 3, userInfo: [
                    NSLocalizedDescriptionKey: "Current password is incorrect",
                ]))
            }
            _ = verifyData

            var headers = http.anonHeaders()
            headers["Authorization"] = "Bearer \(session.accessToken)"
            headers["Content-Type"] = "application/json"
            let (data, response) = try await http.putAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/user",
                headers: headers,
                body: try http.encodeJSONObject(["password": newPassword])
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "ProfileRepository", code: 4, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to change password" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func changePasswordWithoutVerify(session: BuyerSession, newPassword: String) async -> Result<Void, Error> {
        var headers = http.anonHeaders()
        headers["Authorization"] = "Bearer \(session.accessToken)"
        headers["Content-Type"] = "application/json"
        do {
            let (data, response) = try await http.putAllowingErrorStatus(
                "\(SupabaseConfig.url)/auth/v1/user",
                headers: headers,
                body: try http.encodeJSONObject(["password": newPassword])
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "ProfileRepository", code: 5, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to change password" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }
}

final class AddressRepository {
    private let http = SupabaseHTTP.shared

    func fetchAddresses(session: BuyerSession) async -> [UserAddressRow] {
        guard SupabaseConfig.isConfigured() else { return [] }

        let url = "\(SupabaseConfig.url)/rest/v1/user_addresses" +
            "?user_id=eq.\(session.userId)" +
            "&select=*" +
            "&order=is_default.desc"

        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return [] }
            return try http.decode([UserAddressRow].self, from: data)
        } catch {
            return []
        }
    }

    func createAddress(session: BuyerSession, address: UserAddressRow) async -> Result<UserAddressRow, Error> {
        let body: [String: Any] = [
            "user_id": session.userId,
            "full_name": address.fullName,
            "phone_number": address.phoneNumber as Any,
            "email": address.email as Any,
            "country": address.country,
            "street_address_1": address.streetAddress1,
            "street_address_2": address.streetAddress2 as Any,
            "city": address.city,
            "state": address.state,
            "postal_code": address.postalCode,
            "address_type": address.addressType,
            "delivery_notes": address.deliveryNotes as Any,
            "is_default": address.isDefault,
        ]

        var headers = http.authHeaders(session: session)
        headers["Prefer"] = "return=representation"
        headers["Content-Type"] = "application/json"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/user_addresses",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "AddressRepository", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to create address" : http.bodyAsText(data),
                ]))
            }
            guard let created = try http.decode([UserAddressRow].self, from: data).first else {
                return .failure(NSError(domain: "AddressRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "No address returned",
                ]))
            }
            if address.isDefault {
                _ = await setDefault(session: session, addressId: created.id)
            }
            return .success(created)
        } catch {
            return .failure(error)
        }
    }

    func updateAddress(session: BuyerSession, addressId: String, address: UserAddressRow) async -> Result<Void, Error> {
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        do {
            let body = try http.encodeBody(address)
            let (data, response) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/user_addresses?id=eq.\(addressId)&user_id=eq.\(session.userId)",
                headers: headers,
                body: body
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "AddressRepository", code: 3, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to update address" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func deleteAddress(session: BuyerSession, addressId: String) async -> Result<Void, Error> {
        do {
            let (data, response) = try await http.deleteAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/user_addresses?id=eq.\(addressId)&user_id=eq.\(session.userId)",
                headers: http.authHeaders(session: session)
            )
            return http.isSuccess(response)
                ? .success(())
                : .failure(NSError(domain: "AddressRepository", code: 4, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to delete address" : http.bodyAsText(data),
                ]))
        } catch {
            return .failure(error)
        }
    }

    func setDefault(session: BuyerSession, addressId: String) async -> Result<Void, Error> {
        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        do {
            let (patchData, patchResponse) = try await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/user_addresses?id=eq.\(addressId)&user_id=eq.\(session.userId)",
                headers: headers,
                body: try http.encodeJSONObject(["is_default": true])
            )
            guard http.isSuccess(patchResponse) else {
                return .failure(NSError(domain: "AddressRepository", code: 5, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(patchData).isEmpty ? "Failed to set default address" : http.bodyAsText(patchData),
                ]))
            }

            _ = try? await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/user_addresses?user_id=eq.\(session.userId)&id=neq.\(addressId)&is_default=eq.true",
                headers: headers,
                body: try http.encodeJSONObject(["is_default": false])
            )
            return .success(())
        } catch {
            return .failure(error)
        }
    }
}
