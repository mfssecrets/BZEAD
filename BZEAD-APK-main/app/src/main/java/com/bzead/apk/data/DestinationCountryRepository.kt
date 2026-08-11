package com.bzead.apk.data

import com.bzead.apk.data.model.BuyerSession
import io.ktor.client.call.body
import io.ktor.client.request.get
import com.bzead.apk.data.SupabaseHttp.anonHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors web [useDestinationCountry] priority exactly.
 *
 * Logged-in: profile country (DB) → default address (DB). No local prefs / GPS —
 * the profile country is required at signup, so it is the authoritative source
 * and a locally-saved shipping country can never override it.
 * Guest: detected GPS → United States fallback.
 */
class DestinationCountryRepository {
    companion object {
        const val GUEST_FALLBACK = "United States"
    }

    /** Primary country used for pricing (same as web `selectedCountry`). */
    suspend fun resolveCountry(
        session: BuyerSession,
        locationRepository: LocationRepository,
    ): String {
        return resolveCountryCandidates(session, locationRepository).firstOrNull()
            ?: GUEST_FALLBACK
    }

    /**
     * Ordered list of countries to try for pricing RPCs (web resolution order).
     */
    suspend fun resolveCountryCandidates(
        session: BuyerSession,
        locationRepository: LocationRepository,
    ): List<String> {
        if (!SupabaseConfig.isConfigured()) return listOf(GUEST_FALLBACK)

        // Guest (no signed-in user): fall back to detected GPS, then US.
        if (session.userId.isBlank()) {
            val detected = locationRepository.cachedLocation()?.country?.trim().orEmpty()
            return listOf(detected)
                .filter { it.isNotBlank() }
                .distinct()
                .ifEmpty { listOf(GUEST_FALLBACK) }
        }

        // Signed-in users: DB only. Profile country (required at signup) wins, then
        // the DB default address. Local prefs / GPS are never consulted so a saved
        // foreign shipping country cannot override the user's profile country.
        val profileCountry = ProfileRepository().fetchProfile(session)?.countryId
            ?.let { fetchCountryName(it)?.trim().orEmpty() }
            .orEmpty()

        val addresses = AddressRepository().fetchAddresses(session)
        val addressCountry = addresses.firstOrNull { it.isDefault }?.country?.trim().orEmpty()
            .ifBlank { addresses.firstOrNull()?.country?.trim().orEmpty() }

        val ordered = listOf(profileCountry, addressCountry)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()

        return if (ordered.isEmpty()) listOf(GUEST_FALLBACK) else ordered
    }

    suspend fun resolveLocationLabel(
        session: BuyerSession,
        locationRepository: LocationRepository,
    ): String {
        val pricingCountry = resolveCountry(session, locationRepository)
        val addressRepo = AddressRepository()
        val addresses = addressRepo.fetchAddresses(session)
        val defaultAddress = addresses.firstOrNull { it.isDefault } ?: addresses.firstOrNull()
        if (defaultAddress != null) {
            val label = listOfNotNull(
                defaultAddress.city.takeIf { it.isNotBlank() },
                defaultAddress.state.takeIf { it.isNotBlank() },
                defaultAddress.country.takeIf { it.isNotBlank() },
            ).joinToString(", ")
            if (label.isNotBlank()) return label
        }

        locationRepository.cachedLocation()?.label()?.takeIf { it.isNotBlank() }?.let { return it }

        return pricingCountry
    }

    /** Signed-in user's saved profile country (id + display name), or null. */
    suspend fun fetchProfileCountry(session: BuyerSession): ProfileCountry? {
        if (!SupabaseConfig.isConfigured()) return null
        val countryId = ProfileRepository().fetchProfile(session)?.countryId?.trim().orEmpty()
        if (countryId.isBlank()) return null
        val name = fetchCountryName(countryId)?.trim().orEmpty()
        if (name.isBlank()) return null
        return ProfileCountry(countryId, name)
    }

    /**
     * Resolve a detected location (ISO2 code preferred, name fallback) to a countries
     * row so it can be compared against / written to the profile. Null if unknown.
     */
    suspend fun lookupCountryByLocation(country: String, iso2: String): DetectedCountry? {
        if (!SupabaseConfig.isConfigured()) return null

        val codeToken = iso2.trim().uppercase()
        val nameToken = country.trim()
        if (codeToken.isBlank() && nameToken.isBlank()) return null

        val filter = if (codeToken.isNotBlank()) {
            "iso2=eq.$codeToken"
        } else {
            "country_name=ilike.${java.net.URLEncoder.encode(nameToken, "UTF-8")}"
        }

        val response = SupabaseHttp.client.get(
            "${SupabaseConfig.url}/rest/v1/countries" +
                "?$filter" +
                "&select=id,country_name,currency_code" +
                "&limit=1",
        ) { anonHeaders() }
        if (!response.status.isSuccess()) return null
        val row = response.body<List<CountryLookupRow>>().firstOrNull() ?: return null
        val id = row.id?.trim().orEmpty()
        if (id.isBlank()) return null
        return DetectedCountry(
            id = id,
            name = row.countryName?.trim().orEmpty(),
            currencyCode = row.currencyCode?.trim()?.uppercase().orEmpty(),
        )
    }

    private suspend fun fetchCountryName(countryId: String): String? {
        val response = SupabaseHttp.client.get(
            "${SupabaseConfig.url}/rest/v1/countries" +
                "?id=eq.$countryId" +
                "&select=country_name,short_code,country_code,iso2" +
                "&limit=1",
        ) { anonHeaders() }
        if (!response.status.isSuccess()) return null
        val row = response.body<List<CountryNameRow>>().firstOrNull() ?: return null
        return row.countryName ?: row.shortCode ?: row.countryCode ?: row.iso2
    }

    data class ProfileCountry(val id: String, val name: String)

    data class DetectedCountry(val id: String, val name: String, val currencyCode: String)

    @Serializable
    private data class CountryLookupRow(
        val id: String? = null,
        @SerialName("country_name") val countryName: String? = null,
        @SerialName("currency_code") val currencyCode: String? = null,
    )

    @Serializable
    private data class CountryNameRow(
        @SerialName("country_name") val countryName: String? = null,
        @SerialName("short_code") val shortCode: String? = null,
        @SerialName("country_code") val countryCode: String? = null,
        val iso2: String? = null,
    )
}
