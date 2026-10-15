import Foundation

struct GameURLPolicy {
    static let productionURL = URL(string: "https://162-0.dev")!

    private let appOrigin: Origin

    init(appURL: URL) {
        self.appOrigin = Origin(url: appURL)
    }

    static func launchURL(
        environment: [String: String],
        isDebug: Bool
    ) -> Result<URL, GameURLPolicyError> {
        if isDebug, let override = environment["GAME_URL"] {
            guard let url = URL(string: override), isAllowedLaunchURL(url) else {
                return .failure(.invalidOverride)
            }
            return .success(url)
        }

        return .success(productionURL)
    }

    static func isAllowedLaunchURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(),
              url.user == nil,
              url.password == nil,
              let host = url.host, !host.isEmpty else {
            return false
        }

        if scheme == "https" {
            return true
        }

        return scheme == "http" && isLoopbackHost(url.host)
    }

    func isAppURL(_ url: URL) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        return appOrigin == Origin(url: url)
    }
    func isTrustedDownloadURL(_ url: URL) -> Bool {
        if isAppURL(url) {
            return true
        }
        guard url.scheme?.lowercased() == "blob" else { return false }
        let prefix = "blob:"
        guard url.absoluteString.lowercased().hasPrefix(prefix) else { return false }
        let embeddedOrigin = String(url.absoluteString.dropFirst(prefix.count))
        guard let embeddedURL = URL(string: embeddedOrigin) else { return false }
        return isAppURL(embeddedURL)
    }

    static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        let normalizedHost = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        return normalizedHost == "localhost"
            || normalizedHost == "127.0.0.1"
            || normalizedHost == "::1"
    }

    static func isExternalHandlerURL(_ url: URL) -> Bool {
        switch url.scheme?.lowercased() {
        case "http", "https", "mailto":
            return true
        default:
            return false
        }
    }

    private struct Origin: Equatable {
        let scheme: String?
        let host: String?
        let port: Int?

        init(url: URL) {
            let scheme = url.scheme?.lowercased()
            self.scheme = scheme
            self.host = url.host?.lowercased()
            switch (scheme, url.port) {
            case ("https", nil):
                self.port = 443
            case ("http", nil):
                self.port = 80
            default:
                self.port = url.port
            }
        }
    }
}

enum GameURLPolicyError: Error, Equatable {
    case invalidOverride

    var message: String {
        switch self {
        case .invalidOverride:
            return "GAME_URL is invalid. Use an HTTPS URL or loopback HTTP URL."
        }
    }
}
