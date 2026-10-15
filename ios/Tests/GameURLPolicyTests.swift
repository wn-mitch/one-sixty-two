import XCTest
@testable import OneSixtyTwo

final class GameURLPolicyTests: XCTestCase {
    func testReleaseCannotBeRedirectedByDebugEnvironment() throws {
        let url = try GameURLPolicy.launchURL(
            environment: ["GAME_URL": "https://example.com/"], isDebug: false
        ).get()
        XCTAssertEqual(url, GameURLPolicy.productionURL)
    }

    func testDebugAllowsHTTPSAndLoopbackButRejectsUnsafeDestinations() throws {
        for value in ["https://example.com/game", "http://localhost:18762/", "http://127.0.0.1:18762/", "http://[::1]:18762/"] {
            let url = try GameURLPolicy.launchURL(environment: ["GAME_URL": value], isDebug: true).get()
            XCTAssertEqual(url.absoluteString, value)
        }
        for value in ["http://example.com/", "file:///tmp/game.html", "javascript:alert(1)", "/relative", "https://", "https://user:password@example.com/"] {
            XCTAssertThrowsError(try GameURLPolicy.launchURL(environment: ["GAME_URL": value], isDebug: true).get(), value)
        }
    }

    func testInternalNavigationRequiresTheExactOrigin() throws {
        let policy = GameURLPolicy(appURL: GameURLPolicy.productionURL)
        for value in ["https://162-0.dev/shop", "https://162-0.dev:443/collection#card", "https://162-0.dev/lab?film=foil"] {
            XCTAssertTrue(policy.isAppURL(try XCTUnwrap(URL(string: value))), value)
        }
        for value in ["http://162-0.dev/", "https://162-0.dev:444/", "https://162-0.dev.example.com/", "https://example.com/?next=https://162-0.dev", "https://user@162-0.dev/", "file:///shop"] {
            XCTAssertFalse(policy.isAppURL(try XCTUnwrap(URL(string: value))), value)
        }
    }

    func testDownloadsCannotEscapeTheGameOrigin() throws {
        let policy = GameURLPolicy(appURL: GameURLPolicy.productionURL)
        for value in ["https://162-0.dev/export.png", "blob:https://162-0.dev/fixture"] {
            XCTAssertTrue(policy.isTrustedDownloadURL(try XCTUnwrap(URL(string: value))), value)
        }
        for value in ["blob:https://example.com/fixture", "blob:null/fixture", "file:///tmp/export.png", "https://example.com/export.png"] {
            XCTAssertFalse(policy.isTrustedDownloadURL(try XCTUnwrap(URL(string: value))), value)
        }
    }

    func testExternalLinksCannotLaunchArbitraryNativeSchemes() throws {
        for value in ["https://example.com/", "http://example.com/", "mailto:support@example.com"] {
            XCTAssertTrue(GameURLPolicy.isExternalHandlerURL(try XCTUnwrap(URL(string: value))), value)
        }
        for value in ["file:///tmp/export.png", "javascript:alert(1)", "custom-app://open", "data:text/html,hello"] {
            XCTAssertFalse(GameURLPolicy.isExternalHandlerURL(try XCTUnwrap(URL(string: value))), value)
        }
    }
}
