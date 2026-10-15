import XCTest

/// Opt-in smoke coverage for the deployed game. The run is local to the simulator's
/// default website data store; it does not publish or mutate anything on the server.
final class LiveGameSmokeTests: XCTestCase {
    private let timeout: TimeInterval = 60

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLiveDraftStartsAndResumesAfterAppRestart() {
        let app = XCUIApplication()
        app.launchEnvironment["GAME_URL"] = "https://162-0.dev/draft"
        app.launch()
        let webView = app.webViews["game-webview"]
        XCTAssertTrue(webView.waitForExistence(timeout: timeout))

        let draftHeading = webView.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Pick 1 of 16"))
            .firstMatch
        if !draftHeading.waitForExistence(timeout: 3) {
            tap(label: "Seattle Mariners", in: webView)
            tap(label: "Start draft", in: webView)
            XCTAssertTrue(draftHeading.waitForExistence(timeout: timeout), "The live draft did not start")
        }

        addScreenshot(named: "live-draft-started")
        app.terminate()
        app.launch()
        let relaunchedWebView = app.webViews["game-webview"]
        XCTAssertTrue(relaunchedWebView.waitForExistence(timeout: timeout))
        XCTAssertTrue(
            relaunchedWebView.descendants(matching: .any)
                .matching(NSPredicate(format: "label == %@", "Pick 1 of 16"))
                .firstMatch
                .waitForExistence(timeout: timeout),
            "The live draft must resume from the default persistent website data store"
        )
        addScreenshot(named: "live-draft-resumed")

        for pick in 1...16 {
            let progress = relaunchedWebView.staticTexts["Pick \(pick) of 16"]
            XCTAssertTrue(progress.waitForExistence(timeout: timeout))
            let choice = relaunchedWebView.buttons["Pick"].firstMatch
            XCTAssertTrue(choice.waitForExistence(timeout: timeout))
            choice.tap()
        }
        tap(label: "Auto-fix", in: relaunchedWebView)
        tap(label: "Submit roster", in: relaunchedWebView)
        for chapter in 1...6 {
            tap(label: "Play chapter \(chapter)", in: relaunchedWebView)
        }
        XCTAssertTrue(relaunchedWebView.staticTexts["Final standings"].waitForExistence(timeout: 120))
        addScreenshot(named: "live-season-complete")
    }

    @MainActor
    private func tap(label: String, in webView: XCUIElement) {
        let element = webView.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Live control \(label) was not visible")
        element.tap()
    }

    @MainActor
    private func addScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
