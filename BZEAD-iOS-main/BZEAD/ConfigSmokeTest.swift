import SwiftUI

// Full build only: Product → Run in Xcode (simulator or device).
// Entry point: BZEADApp.swift → runConfigSmokeTest = true
// After all rows PASS, set runConfigSmokeTest = false for the buyer app.

enum ConfigSmokeTest {

    struct Row: Identifiable {
        let id = UUID()
        let name: String
        let status: Status
        let detail: String

        enum Status {
            case pass, fail, pending

            var label: String {
                switch self {
                case .pass: return "PASS"
                case .fail: return "FAIL"
                case .pending: return "…"
                }
            }

            var color: Color {
                switch self {
                case .pass: return .green
                case .fail: return .red
                case .pending: return .orange
                }
            }
        }
    }

    static func mask(_ value: String, visiblePrefix: Int = 8, visibleSuffix: Int = 4) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > visiblePrefix + visibleSuffix + 3 else {
            return trimmed.isEmpty ? "(empty)" : "••••"
        }
        let start = trimmed.prefix(visiblePrefix)
        let end = trimmed.suffix(visibleSuffix)
        return "\(start)…\(end)"
    }

    static func keyRows() -> [Row] {
        let checks: [(String, String, (String) -> Bool)] = [
            ("SUPABASE_URL", SupabaseConfig.url, { !$0.isEmpty && $0.hasPrefix("https://") }),
            ("SUPABASE_ANON_KEY", SupabaseConfig.anonKey, { $0.count > 20 }),
            ("PUBLIC_APP_URL", SupabaseConfig.publicAppUrl, { !$0.isEmpty && $0.hasPrefix("https://") }),
            ("STRIPE_PUBLISHABLE_KEY", SupabaseConfig.stripePublishableKey, { $0.hasPrefix("pk_") }),
            ("ONESIGNAL_APP_ID", SupabaseConfig.oneSignalAppId, { !$0.isEmpty && $0.contains("-") }),
        ]

        return checks.map { name, value, valid in
            let ok = valid(value)
            return Row(
                name: name,
                status: ok ? .pass : .fail,
                detail: ok ? mask(value) : (value.isEmpty ? "Missing — add to Secrets.plist" : mask(value))
            )
        }
    }

    static func isConfigured() -> Bool {
        SupabaseConfig.isConfigured()
    }

    /// Live ping: `GET /rest/v1/countries?limit=1`
    static func pingSupabase() async -> Row {
        guard isConfigured() else {
            return Row(
                name: "Supabase REST ping",
                status: .fail,
                detail: "SupabaseConfig.isConfigured() is false"
            )
        }

        let url = "\(SupabaseConfig.url)/rest/v1/countries?select=id&limit=1"
        do {
            let (data, response) = try await SupabaseHTTP.shared.getAllowingErrorStatus(
                url,
                headers: SupabaseHTTP.shared.anonHeaders()
            )
            if SupabaseHTTP.shared.isSuccess(response) {
                let preview = SupabaseHTTP.shared.bodyAsText(data).prefix(80)
                return Row(
                    name: "Supabase REST ping",
                    status: .pass,
                    detail: "HTTP \(response.statusCode) — \(preview)"
                )
            }
            return Row(
                name: "Supabase REST ping",
                status: .fail,
                detail: "HTTP \(response.statusCode) — \(SupabaseHTTP.shared.bodyAsText(data).prefix(120))"
            )
        } catch {
            return Row(
                name: "Supabase REST ping",
                status: .fail,
                detail: error.localizedDescription
            )
        }
    }

    static func runAll() async -> [Row] {
        var rows = keyRows()
        rows.append(await pingSupabase())
        rows.append(
            Row(
                name: "Secrets.plist in bundle",
                status: Bundle.main.url(forResource: "Secrets", withExtension: "plist") != nil ? .pass : .fail,
                detail: Bundle.main.url(forResource: "Secrets", withExtension: "plist") != nil
                    ? "Found Secrets.plist"
                    : "Not bundled — add Secrets.plist to target resources in Xcode"
            )
        )
        return rows
    }
}

struct ConfigSmokeTestView: View {
    @State private var rows: [ConfigSmokeTest.Row] = []
    @State private var running = false
    @State private var finishedAt: Date?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Validates `Secrets.plist` keys and one live Supabase request.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section("Results") {
                    if rows.isEmpty {
                        Text("Tap Run tests below.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(rows) { row in
                            HStack(alignment: .top, spacing: 12) {
                                Text(row.status.label)
                                    .font(.caption.bold())
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(row.status.color)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .frame(width: 52)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(row.name)
                                        .font(.subheadline.weight(.semibold))
                                    Text(row.detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .textSelection(.enabled)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                if let finishedAt {
                    Section {
                        Text("Last run: \(finishedAt.formatted(date: .omitted, time: .standard))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Config smoke test")
            .toolbar {
                ToolbarItem(placement: .bottomBar) {
                    Button(running ? "Running…" : "Run tests") {
                        Task { await run() }
                    }
                    .disabled(running)
                    .font(.headline)
                }
            }
            .task {
                await run()
            }
        }
    }

    private func run() async {
        running = true
        rows = ConfigSmokeTest.keyRows().map {
            ConfigSmokeTest.Row(name: $0.name, status: .pending, detail: "Checking…")
        }
        rows = await ConfigSmokeTest.runAll()
        finishedAt = Date()
        running = false
    }
}
