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
        app.launchEnvironment["GAME_URL"] = "https://162-0.dev/draft?developer=on"
        app.launch()
        let webView = app.webViews["game-webview"]
        XCTAssertTrue(webView.waitForExistence(timeout: timeout))

        // An unstarted run shows the seat's sealed packs, before and after a restart.
        let draftHeading = webView.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Open your 2 packs"))
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
                .matching(NSPredicate(format: "label == %@", "Open your 2 packs"))
                .firstMatch
                .waitForExistence(timeout: timeout),
            "The live draft must resume from the default persistent website data store"
        )
        addScreenshot(named: "live-draft-resumed")

        tap(label: "Open your 2 packs", in: relaunchedWebView)
        // Every pick goes to the bench; Auto-fix arranges the roster in the opening window.
        for picked in 0..<16 {
            XCTAssertTrue(element(label: "Open your field, \(picked) of 16 picked", in: relaunchedWebView).waitForExistence(timeout: timeout))
            tap(matching: NSPredicate(format: "label BEGINSWITH %@", "Select "), in: relaunchedWebView)
            tap(label: "Bench. Place on the bench.", in: relaunchedWebView)
            tap(matching: NSPredicate(format: "label BEGINSWITH %@ AND label ENDSWITH %@", "Draft ", " to the bench"), in: relaunchedWebView)
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
    private func element(label: String, in webView: XCUIElement) -> XCUIElement {
        webView.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    @MainActor
    private func tap(label: String, in webView: XCUIElement) {
        tap(matching: NSPredicate(format: "label == %@", label), in: webView)
    }

    @MainActor
    private func tap(matching predicate: NSPredicate, in webView: XCUIElement) {
        let element = webView.descendants(matching: .any).matching(predicate).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Live control \(predicate.predicateFormat) was not visible")
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
