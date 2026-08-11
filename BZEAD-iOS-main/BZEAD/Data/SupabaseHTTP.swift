import Foundation

enum SupabaseHTTPError: LocalizedError {
    case invalidURL
    case httpStatus(Int, String)
    case decodingFailed(Error)
    case emptyBody

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .httpStatus(let code, let body): return "HTTP \(code): \(body)"
        case .decodingFailed(let error): return error.localizedDescription
        case .emptyBody: return "Empty response body"
        }
    }
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

struct SupabaseHTTP {
    static let shared = SupabaseHTTP()

    let session: URLSession
    let decoder: JSONDecoder
    let encoder: JSONEncoder

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 45
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    func anonHeaders() -> [String: String] {
        [
            "apikey": SupabaseConfig.anonKey,
            "Authorization": "Bearer \(SupabaseConfig.anonKey)",
            "Accept": "application/json",
        ]
    }

    func authHeaders(session buyerSession: BuyerSession) -> [String: String] {
        [
            "apikey": SupabaseConfig.anonKey,
            "Authorization": "Bearer \(buyerSession.accessToken)",
            "Accept": "application/json",
        ]
    }

    func mergeHeaders(_ base: [String: String], extra: [String: String]) -> [String: String] {
        var merged = base
        for (key, value) in extra { merged[key] = value }
        return merged
    }

    func data(
        method: HTTPMethod,
        urlString: String,
        headers: [String: String] = [:],
        body: Data? = nil,
        contentType: String? = "application/json"
    ) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: urlString) else { throw SupabaseHTTPError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.httpBody = body
        if let contentType, body != nil {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseHTTPError.invalidURL
        }
        guard (200...299).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw SupabaseHTTPError.httpStatus(http.statusCode, text)
        }
        return (data, http)
    }

    func dataAllowingErrorStatus(
        method: HTTPMethod,
        urlString: String,
        headers: [String: String] = [:],
        body: Data? = nil,
        contentType: String? = "application/json"
    ) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: urlString) else { throw SupabaseHTTPError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.httpBody = body
        if let contentType, body != nil {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseHTTPError.invalidURL
        }
        return (data, http)
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw SupabaseHTTPError.decodingFailed(error)
        }
    }

    func encodeBody<E: Encodable>(_ value: E) throws -> Data {
        try encoder.encode(value)
    }

    func encodeJSONObject(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object)
    }

    func get<T: Decodable>(
        _ urlString: String,
        headers: [String: String] = [:]
    ) async throws -> T {
        let (data, _) = try await data(method: .get, urlString: urlString, headers: headers)
        return try decode(T.self, from: data)
    }

    func getAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:]
    ) async throws -> (Data, HTTPURLResponse) {
        try await dataAllowingErrorStatus(method: .get, urlString: urlString, headers: headers)
    }

    func post<T: Decodable, E: Encodable>(
        _ urlString: String,
        headers: [String: String] = [:],
        body: E
    ) async throws -> T {
        let bodyData = try encodeBody(body)
        let (data, _) = try await data(method: .post, urlString: urlString, headers: headers, body: bodyData)
        return try decode(T.self, from: data)
    }

    func postAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:],
        body: Data? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        try await dataAllowingErrorStatus(method: .post, urlString: urlString, headers: headers, body: body)
    }

    func postJSONObjectAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:],
        body: [String: Any]
    ) async throws -> (Data, HTTPURLResponse) {
        let bodyData = try encodeJSONObject(body)
        return try await dataAllowingErrorStatus(method: .post, urlString: urlString, headers: headers, body: bodyData)
    }

    func patchAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:],
        body: Data
    ) async throws -> (Data, HTTPURLResponse) {
        try await dataAllowingErrorStatus(method: .patch, urlString: urlString, headers: headers, body: body)
    }

    func putAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:],
        body: Data
    ) async throws -> (Data, HTTPURLResponse) {
        try await dataAllowingErrorStatus(method: .put, urlString: urlString, headers: headers, body: body)
    }

    func deleteAllowingErrorStatus(
        _ urlString: String,
        headers: [String: String] = [:]
    ) async throws -> (Data, HTTPURLResponse) {
        try await dataAllowingErrorStatus(method: .delete, urlString: urlString, headers: headers)
    }

    func isSuccess(_ response: HTTPURLResponse) -> Bool {
        (200...299).contains(response.statusCode)
    }

    func bodyAsText(_ data: Data) -> String {
        String(data: data, encoding: .utf8) ?? ""
    }
}
