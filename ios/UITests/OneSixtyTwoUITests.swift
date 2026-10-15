import XCTest

final class OneSixtyTwoUITests: XCTestCase {
    private let fixtureURL = "http://127.0.0.1:18762/index.html"
    private let unreachableURL = "http://127.0.0.1:18763/index.html"
    private let timeout: TimeInterval = 12

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testMotionAccessIsGrantedOnFirstInteractionAndAfterRestart() {
        let (app, webView) = launch(gameURL: fixtureURL + "?motion=1")
        tapFixture("reset-fixture", label: "Reset fixture", in: webView)
        let granted = "Motion access: orientation=granted; motion=granted"
        XCTAssertTrue(
            waitForText(granted, in: webView),
            "The first game interaction must grant motion access without a separate permission prompt"
        )
        app.terminate()
        app.launch()
        tapFixture("reset-fixture", label: "Reset fixture", in: app.webViews["game-webview"])
        XCTAssertTrue(waitForText(granted, in: app.webViews["game-webview"]))
        addScreenshot(named: "default-motion-permission")
    }

    @MainActor
    func testPersistentWebStorageSurvivesRestartAndLocalNavigation() {
        let (app, webView) = launch(gameURL: fixtureURL)
        tapFixture("reset-fixture", label: "Reset fixture", in: webView)
        XCTAssertTrue(waitForText("Fixture reset", in: webView), "The fixture must explicitly reset its isolated state")

        tapFixture("record-state", label: "Record persistent state", in: webView)
        XCTAssertTrue(
            waitForText("Saved: local-storage=local-value-162; opfs=opfs-value-162", in: webView),
            "The page must report both storage mechanisms after the OPFS worker flushes"
        )

        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(
            waitForText("Saved: local-storage=local-value-162; opfs=opfs-value-162", in: webView),
            "Returning from the background must retain the current document, not reload it"
        )

        tapFixture("internal-link", label: "Open internal route", in: webView)
        XCTAssertTrue(waitForText("Internal route", in: webView), "A same-origin navigation must stay in the app")

        tapFixture("blank-link", label: "Open internal new-window route", in: webView)
        XCTAssertTrue(waitForText("New-window route", in: webView), "An internal target=_blank navigation must stay in the app")

        tapFixture("blocked-scheme-link", label: "Try blocked file route", in: webView)
        XCTAssertTrue(waitForText("New-window route", in: webView), "A file URL must not replace the game document")

        addScreenshot(named: "navigation-policy")
        app.terminate()
        app.launch()

        let relaunchedWebView = app.webViews["game-webview"]
        XCTAssertTrue(relaunchedWebView.waitForExistence(timeout: timeout))
        XCTAssertTrue(
            waitForText("Restored: local-storage=local-value-162; opfs=opfs-value-162", in: relaunchedWebView),
            "Default WKWebView storage must survive an app restart, including OPFS data written by a worker"
        )
        addScreenshot(named: "persisted-state-after-restart")
    }

    @MainActor
    func testBlobPngDownloadPresentsNativeShareSheet() {
        let (app, webView) = launch(gameURL: fixtureURL)
        tapFixture("reset-fixture", label: "Reset fixture", in: webView)
        XCTAssertTrue(waitForText("Fixture reset", in: webView))

        tapFixture("download-png", label: "Download PNG", in: webView)

        let activityList = app.otherElements["ActivityListView"]
        let sheet = app.sheets.firstMatch
        XCTAssertTrue(
            activityList.waitForExistence(timeout: timeout) || sheet.waitForExistence(timeout: timeout),
            "A blob PNG download must present the native share sheet"
        )
        addScreenshot(named: "png-share-sheet")
    }

    @MainActor
    func testNetworkFailureShowsRetryControl() {
        let app = XCUIApplication()
        app.launchEnvironment["GAME_URL"] = unreachableURL
        app.launch()

        let loadError = appElement("load-error", in: app)
        XCTAssertTrue(loadError.waitForExistence(timeout: timeout), "Network failure must be visible rather than a blank web view")
        let retry = appElement("retry-load", in: app)
        XCTAssertTrue(retry.waitForExistence(timeout: 2), "The visible load failure must offer retry")
        addScreenshot(named: "network-load-error")
    }

    @MainActor
    @discardableResult
    private func launch(gameURL: String) -> (XCUIApplication, XCUIElement) {
        let app = XCUIApplication()
        app.launchEnvironment["GAME_URL"] = gameURL
        app.launch()
        let webView = app.webViews["game-webview"]
        XCTAssertTrue(webView.waitForExistence(timeout: timeout), "The game WKWebView did not load")
        return (app, webView)
    }

    @MainActor
    private func tapFixture(_ identifier: String, label: String, in webView: XCUIElement) {
        let byIdentifier = webView.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", identifier))
            .firstMatch
        if byIdentifier.waitForExistence(timeout: 2) {
            byIdentifier.tap()
            return
        }

        let byLabel = webView.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
        XCTAssertTrue(byLabel.waitForExistence(timeout: timeout), "Fixture control \(identifier) was not visible")
        byLabel.tap()
    }

    @MainActor
    private func waitForText(_ text: String, in root: XCUIElement) -> Bool {
        root.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", text))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }

    @MainActor
    private func appElement(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", identifier))
            .firstMatch
    }

    @MainActor
    private func addScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
