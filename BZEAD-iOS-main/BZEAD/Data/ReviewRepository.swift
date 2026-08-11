import Foundation

final class ReviewRepository {
    private let http = SupabaseHTTP.shared

    func hasExistingReview(session: BuyerSession, productId: String) async -> Bool {
        guard SupabaseConfig.isConfigured() else { return false }
        let url = "\(SupabaseConfig.url)/rest/v1/reviews" +
            "?user_id=eq.\(session.userId)" +
            "&product_id=eq.\(productId)" +
            "&select=id" +
            "&limit=1"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return false }
            let rows = try http.decode([ReviewIdRow].self, from: data)
            return !rows.isEmpty
        } catch {
            return false
        }
    }

    func submitReview(
        session: BuyerSession,
        productId: String,
        rating: Int,
        heading: String,
        comment: String
    ) async -> Result<Void, Error> {
        guard SupabaseConfig.isConfigured() else {
            return .failure(NSError(domain: "ReviewRepository", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Supabase not configured",
            ]))
        }

        let body: [String: Any] = [
            "user_id": session.userId,
            "product_id": productId,
            "rating": rating,
            "heading": heading.trimmingCharacters(in: .whitespacesAndNewlines),
            "comment": comment.trimmingCharacters(in: .whitespacesAndNewlines),
        ]

        var headers = http.authHeaders(session: session)
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"

        do {
            let (data, response) = try await http.postJSONObjectAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/reviews",
                headers: headers,
                body: body
            )
            guard http.isSuccess(response) else {
                return .failure(NSError(domain: "ReviewRepository", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: http.bodyAsText(data).isEmpty ? "Failed to submit review" : http.bodyAsText(data),
                ]))
            }
            await recalculateProductRating(session: session, productId: productId)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    private func recalculateProductRating(session: BuyerSession, productId: String) async {
        let url = "\(SupabaseConfig.url)/rest/v1/reviews?product_id=eq.\(productId)&select=rating"
        do {
            let (data, response) = try await http.getAllowingErrorStatus(url, headers: http.authHeaders(session: session))
            guard http.isSuccess(response) else { return }
            let ratings = try http.decode([RatingRow].self, from: data).compactMap(\.rating)
            guard !ratings.isEmpty else { return }

            let avg = Double(ratings.reduce(0, +)) / Double(ratings.count)
            let rounded = (avg * 10).rounded() / 10

            var headers = http.authHeaders(session: session)
            headers["Content-Type"] = "application/json"
            _ = try? await http.patchAllowingErrorStatus(
                "\(SupabaseConfig.url)/rest/v1/products?id=eq.\(productId)",
                headers: headers,
                body: try http.encodeJSONObject([
                    "rating": rounded,
                    "review_count": ratings.count,
                ])
            )
        } catch {
            return
        }
    }

    private struct RatingRow: Codable {
        let rating: Int?
    }

    private struct ReviewIdRow: Codable {
        let id: String?
    }
}
