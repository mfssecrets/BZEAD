package com.bzead.apk.data

import com.bzead.apk.data.model.BuyerSession
import com.bzead.apk.data.model.ProfileDetail
import com.bzead.apk.data.model.UserAddressRow
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import com.bzead.apk.data.SupabaseHttp.authHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ProfileRepository {
    suspend fun fetchProfile(session: BuyerSession): ProfileDetail? {
        if (!SupabaseConfig.isConfigured()) return null

        val response = SupabaseHttp.client.get(
            "${SupabaseConfig.url}/rest/v1/profiles" +
                "?id=eq.${session.userId}" +
                "&select=id,full_name,email,phone,country_id,notification_preferences",
        ) {
            authHeaders(session)
        }
        if (!response.status.isSuccess()) return null
        return response.body<List<ProfileDetail>>().firstOrNull()
    }

    suspend fun updateProfile(
        session: BuyerSession,
        fullName: String?,
        phone: String?,
        countryId: String? = null,
        currency: String? = null,
    ): Result<Unit> {
        val body = buildJsonObject {
            fullName?.let { put("full_name", it) }
            phone?.let { put("phone", it) }
            countryId?.let { put("country_id", it) }
            currency?.let { put("currency", it) }
        }
        val response = SupabaseHttp.client.patch(
            "${SupabaseConfig.url}/rest/v1/profiles?id=eq.${session.userId}",
        ) {
            authHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to update profile"))
    }

    suspend fun updateNotificationPreferences(
        session: BuyerSession,
        preferences: JsonObject,
    ): Result<Unit> {
        val body = buildJsonObject { put("notification_preferences", preferences) }
        val response = SupabaseHttp.client.patch(
            "${SupabaseConfig.url}/rest/v1/profiles?id=eq.${session.userId}",
        ) {
            authHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to update notifications"))
    }

    suspend fun changePassword(
        session: BuyerSession,
        currentPassword: String,
        newPassword: String,
    ): Result<Unit> {
        val verify = SupabaseHttp.client.post("${SupabaseConfig.url}/auth/v1/token?grant_type=password") {
            header("apikey", SupabaseConfig.anonKey)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("email", session.email)
                    put("password", currentPassword)
                },
            )
        }
        if (!verify.status.isSuccess()) {
            return Result.failure(IllegalStateException("Current password is incorrect"))
        }
        val response = SupabaseHttp.client.put("${SupabaseConfig.url}/auth/v1/user") {
            header("apikey", SupabaseConfig.anonKey)
            header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("password", newPassword) })
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to change password"))
    }

    suspend fun changePasswordWithoutVerify(
        session: BuyerSession,
        newPassword: String,
    ): Result<Unit> {
        val response = SupabaseHttp.client.put("${SupabaseConfig.url}/auth/v1/user") {
            header("apikey", SupabaseConfig.anonKey)
            header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("password", newPassword) })
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to change password"))
    }
}

class AddressRepository {
    suspend fun fetchAddresses(session: BuyerSession): List<UserAddressRow> {
        if (!SupabaseConfig.isConfigured()) return emptyList()

        val response = SupabaseHttp.client.get(
            "${SupabaseConfig.url}/rest/v1/user_addresses" +
                "?user_id=eq.${session.userId}" +
                "&select=*" +
                "&order=is_default.desc",
        ) {
            authHeaders(session)
        }
        return if (response.status.isSuccess()) response.body() else emptyList()
    }

    suspend fun createAddress(session: BuyerSession, address: UserAddressRow): Result<UserAddressRow> {
        val body = buildJsonObject {
            put("user_id", session.userId)
            put("full_name", address.fullName)
            put("phone_number", address.phoneNumber)
            put("email", address.email)
            put("country", address.country)
            put("street_address_1", address.streetAddress1)
            put("street_address_2", address.streetAddress2)
            put("city", address.city)
            put("state", address.state)
            put("postal_code", address.postalCode)
            put("address_type", address.addressType)
            put("delivery_notes", address.deliveryNotes)
            put("is_default", address.isDefault)
        }
        val response = SupabaseHttp.client.post("${SupabaseConfig.url}/rest/v1/user_addresses") {
            authHeaders(session)
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        if (!response.status.isSuccess()) {
            return Result.failure(IllegalStateException("Failed to create address"))
        }
        val created = response.body<List<UserAddressRow>>().firstOrNull()
            ?: return Result.failure(IllegalStateException("No address returned"))
        if (address.isDefault) setDefault(session, created.id)
        return Result.success(created)
    }

    suspend fun updateAddress(
        session: BuyerSession,
        addressId: String,
        address: UserAddressRow,
    ): Result<Unit> {
        val response = SupabaseHttp.client.patch(
            "${SupabaseConfig.url}/rest/v1/user_addresses?id=eq.$addressId&user_id=eq.${session.userId}",
        ) {
            authHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(address)
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to update address"))
    }

    suspend fun deleteAddress(session: BuyerSession, addressId: String): Result<Unit> {
        val response = SupabaseHttp.client.delete(
            "${SupabaseConfig.url}/rest/v1/user_addresses?id=eq.$addressId&user_id=eq.${session.userId}",
        ) {
            authHeaders(session)
        }
        return if (response.status.isSuccess()) Result.success(Unit)
        else Result.failure(IllegalStateException("Failed to delete address"))
    }

    suspend fun setDefault(session: BuyerSession, addressId: String): Result<Unit> {
        val patch = SupabaseHttp.client.patch(
            "${SupabaseConfig.url}/rest/v1/user_addresses?id=eq.$addressId&user_id=eq.${session.userId}",
        ) {
            authHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("is_default", true) })
        }
        if (!patch.status.isSuccess()) {
            return Result.failure(IllegalStateException("Failed to set default address"))
        }
        SupabaseHttp.client.patch(
            "${SupabaseConfig.url}/rest/v1/user_addresses?user_id=eq.${session.userId}&id=neq.$addressId&is_default=eq.true",
        ) {
            authHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("is_default", false) })
        }
        return Result.success(Unit)
    }
}
