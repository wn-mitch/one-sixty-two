import UIKit
import WebKit

@MainActor
final class GameViewController: UIViewController {

    private let configuredLaunch: Result<URL, GameURLPolicyError>
    private var launchURL: URL?
    private var urlPolicy: GameURLPolicy?
    var gameWebView: WKWebView!
    var downloadContexts: [ObjectIdentifier: GameDownloadContext] = [:]

    private let loadingView = UIView()
    private let loadingIndicator = UIActivityIndicatorView(style: .medium)
    private let failureView = UIView()
    private let failureLabel = UILabel()
    private let retryButton = UIButton(type: .system)

    init() {
#if DEBUG
        let isDebug = true
#else
        let isDebug = false
#endif
        configuredLaunch = GameURLPolicy.launchURL(
            environment: ProcessInfo.processInfo.environment,
            isDebug: isDebug
        )
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("GameViewController does not support storyboard restoration")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.charcoal
        configureWebView()
        configureStatusViews()

        switch configuredLaunch {
        case .success(let url):
            launchURL = url
            urlPolicy = GameURLPolicy(appURL: url)
            load(url: url)
        case .failure(let error):
            showFailure(error.message)
        }
    }

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // The game reads this mark to present the app surface: no external support links.
        configuration.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.host = 'ios-app';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.accessibilityIdentifier = "game-webview"
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = Self.charcoal
        webView.scrollView.backgroundColor = Self.charcoal
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // WKDownload.delegate is assigned when WebKit hands us a download.
        gameWebView = webView

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    private func configureStatusViews() {
        loadingView.translatesAutoresizingMaskIntoConstraints = false
        loadingView.backgroundColor = Self.charcoal
        loadingView.isHidden = true
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false
        loadingIndicator.color = .white
        loadingView.addSubview(loadingIndicator)

        failureView.translatesAutoresizingMaskIntoConstraints = false
        failureView.backgroundColor = Self.charcoal
        failureView.isHidden = true
        failureView.accessibilityIdentifier = "load-error"

        failureLabel.translatesAutoresizingMaskIntoConstraints = false
        failureLabel.textColor = .white
        failureLabel.font = .preferredFont(forTextStyle: .body)
        failureLabel.adjustsFontForContentSizeCategory = true
        failureLabel.numberOfLines = 0
        failureLabel.textAlignment = .center

        retryButton.translatesAutoresizingMaskIntoConstraints = false
        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.titleLabel?.adjustsFontForContentSizeCategory = true
        retryButton.accessibilityIdentifier = "retry-load"
        retryButton.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        failureView.addSubview(failureLabel)
        failureView.addSubview(retryButton)
        view.addSubview(loadingView)
        view.addSubview(failureView)

        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            loadingView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            loadingView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            loadingView.topAnchor.constraint(equalTo: safeArea.topAnchor),
            loadingView.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            loadingIndicator.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor),

            failureView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            failureView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            failureView.centerYAnchor.constraint(equalTo: safeArea.centerYAnchor),
            failureLabel.leadingAnchor.constraint(equalTo: failureView.leadingAnchor, constant: 24),
            failureLabel.trailingAnchor.constraint(equalTo: failureView.trailingAnchor, constant: -24),
            failureLabel.topAnchor.constraint(equalTo: failureView.topAnchor, constant: 24),
            retryButton.topAnchor.constraint(equalTo: failureLabel.bottomAnchor, constant: 18),
            retryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            retryButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            retryButton.centerXAnchor.constraint(equalTo: failureView.centerXAnchor),
            retryButton.bottomAnchor.constraint(equalTo: failureView.bottomAnchor, constant: -24)
        ])
    }

    private func load(url: URL) {
        hideFailure()
        showLoading()
        gameWebView.load(URLRequest(url: url))
    }


    private func showLoading() {
        failureView.isHidden = true
        loadingView.isHidden = false
        loadingIndicator.startAnimating()
    }

    func hideLoading() {
        loadingIndicator.stopAnimating()
        loadingView.isHidden = true
    }

    func showFailure(_ message: String) {
        hideLoading()
        failureLabel.text = message
        failureView.isHidden = false
    }

    private func hideFailure() {
        failureView.isHidden = true
    }

    @objc private func retryLoad() {
        guard let urlPolicy, let launchURL else {
            showFailure("The game URL is invalid. Check GAME_URL and try again.")
            return
        }

        hideFailure()
        showLoading()
        if let currentURL = gameWebView.url, urlPolicy.isAppURL(currentURL) {
            gameWebView.reload()
        } else {
            gameWebView.load(URLRequest(url: launchURL))
        }
    }

    private func openExternal(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard !opened else { return }
            self?.showFailure("The link could not be opened.")
        }
    }

    private func showNavigationFailure() {
        showFailure("The game could not load this page.")
    }


    // Matches WebKit's sRGB rendering of --background (oklch(16% 0.009 255)) in src/routes/layout.css.
    // The safe areas, loading states, and web content share one continuous ground.
    private static let charcoal = UIColor(red: 11 / 255, green: 14 / 255, blue: 16 / 255, alpha: 1)
}

extension GameViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let urlPolicy else {
            decisionHandler(.cancel)
            return
        }

        let isTopLevel = navigationAction.targetFrame?.isMainFrame ?? true
        if navigationAction.shouldPerformDownload {
            guard isTopLevel, urlPolicy.isTrustedDownloadURL(url) else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.download)
            return
        }

        if urlPolicy.isAppURL(url) {
            decisionHandler(.allow)
            return
        }

        guard isTopLevel else {
            decisionHandler(.cancel)
            return
        }

        if navigationAction.navigationType == .linkActivated,
           GameURLPolicy.isExternalHandlerURL(url) {
            openExternal(url)
        }
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
    ) {
        guard navigationResponse.isForMainFrame else {
            decisionHandler(.allow)
            return
        }

        let responseURL = navigationResponse.response.url
        if let response = navigationResponse.response as? HTTPURLResponse,
           !(200..<300).contains(response.statusCode) {
            showFailure("The game returned an HTTP error (\(response.statusCode)).")
            decisionHandler(.cancel)
            return
        }
        if shouldDownload(navigationResponse) {
            guard let responseURL, let urlPolicy, urlPolicy.isTrustedDownloadURL(responseURL) else {
                showNavigationFailure()
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.download)
            return
        }

        if let responseURL,
           let urlPolicy,
           !urlPolicy.isAppURL(responseURL) {
            showNavigationFailure()
            decisionHandler(.cancel)
            return
        }


        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        showLoading()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideLoading()
        hideFailure()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        guard !isNavigationCancellation(error) else { return }
        showNavigationFailure()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        guard !isNavigationCancellation(error) else { return }
        showNavigationFailure()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showFailure("The game stopped unexpectedly. Tap Retry to reload it.")
    }

    func webView(
        _ webView: WKWebView,
        navigationAction: WKNavigationAction,
        didBecome download: WKDownload
    ) {
        startDownload(download)
    }

    func webView(
        _ webView: WKWebView,
        navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        startDownload(download)
    }

    private func shouldDownload(_ navigationResponse: WKNavigationResponse) -> Bool {
        if !navigationResponse.canShowMIMEType {
            return true
        }
        guard let response = navigationResponse.response as? HTTPURLResponse else {
            return false
        }
        return response.allHeaderFields.contains { key, value in
            String(describing: key).lowercased() == "content-disposition"
                && String(describing: value).lowercased().contains("attachment")
        }
    }

    private func isNavigationCancellation(_ error: Error) -> Bool {
        (error as NSError).code == NSURLErrorCancelled
    }
}

extension GameViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
        var components = URLComponents()
        components.scheme = origin.protocol
        components.host = origin.host
        components.port = origin.port == 0 ? nil : origin.port
        guard frame.isMainFrame,
              let url = components.url,
              let urlPolicy,
              urlPolicy.isAppURL(url) else {
            decisionHandler(.deny)
            return
        }
        // The game owns the tilt opt-out and respects the system's Reduce Motion preference.
        decisionHandler(.grant)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url, let urlPolicy else { return nil }
        let isTopLevel = navigationAction.targetFrame?.isMainFrame ?? true
        guard isTopLevel else { return nil }

        if urlPolicy.isAppURL(url) {
            webView.load(navigationAction.request)
        } else if navigationAction.navigationType == .linkActivated,
                  GameURLPolicy.isExternalHandlerURL(url) {
            openExternal(url)
        }
        return nil
    }
}

