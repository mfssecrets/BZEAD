import Foundation

struct BannerRow: Codable {
    let id: String
    let title: String?
    let imageUrl: String?
    let link: String?
    let adSlot: Int?
}

struct HomeBanner {
    let id: String
    let imageUrl: String
    let title: String
    let link: String?
}

final class HomeRepository {
    private let http = SupabaseHTTP.shared

    func fetchTopCategories() async -> [CategoryRow] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/categories" +
            "?level=eq.1" +
            "&is_active=eq.true" +
            "&select=id,name,slug" +
            "&order=display_order.asc"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            return try http.decode([CategoryRow].self, from: data)
        } catch {
            return []
        }
    }

    func fetchHeroBanners() async -> [HomeBanner] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/banners" +
            "?is_active=eq.true" +
            "&banner_type=eq.hero" +
            "&select=id,title,image_url,link" +
            "&order=position.asc"
        return await fetchBanners(url: url)
    }

    func fetchAdBanners(slot: Int) async -> [HomeBanner] {
        guard SupabaseConfig.isConfigured() else { return [] }
        let url = "\(SupabaseConfig.url)/rest/v1/banners" +
            "?is_active=eq.true" +
            "&banner_type=eq.ad" +
            "&ad_slot=eq.\(slot)" +
            "&select=id,title,image_url,link" +
            "&order=position.asc"
        return await fetchBanners(url: url)
    }

    private func fetchBanners(url: String) async -> [HomeBanner] {
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.anonHeaders())
            guard http.isSuccess(response) else { return [] }
            let rows = try http.decode([BannerRow].self, from: data)
            return rows.compactMap { row in
                let image = row.imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !image.isEmpty else { return nil }
                return HomeBanner(
                    id: row.id,
                    imageUrl: image,
                    title: row.title ?? "",
                    link: row.link
                )
            }
        } catch {
            return []
        }
    }
}
