import UIKit
import WebKit

/// Reports the web view's reserved regions (the iPhone Duo fold and camera occlusions) to the page,
/// which lays out around them (`src/lib/app/regions.ts`). Frames are in the web view's coordinate
/// space, which is the page's CSS pixel space because the view is pinned to the safe area with no
/// content insets. Inactive regions are included: the fold stays a layout boundary when fully open.
@MainActor
final class ReservedRegionBridge {
    static let globalName = "__hostRegions"
    static let updateEvent = "162-host-regions"

    private weak var webView: WKWebView?
    private var lastPayload: String?
    private var documentScript: WKUserScript?

    func attach(to webView: WKWebView) {
        self.webView = webView
    }

    /// Re-reads the regions; UIKit has no change notification, so the host calls this on every layout.
    func update() {
        guard let webView, let payload = Self.payload(for: webView), payload != lastPayload else { return }
        lastPayload = payload
        let script = Self.script(payload: payload)
        // Pages loaded later read the current regions before any page script runs.
        let controller = webView.configuration.userContentController
        let others = controller.userScripts.filter { $0 !== documentScript }
        controller.removeAllUserScripts()
        others.forEach(controller.addUserScript)
        let next = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        controller.addUserScript(next)
        documentScript = next
        webView.evaluateJavaScript(script + "window.dispatchEvent(new Event('\(Self.updateEvent)'));", completionHandler: nil)
    }

    /// The JSON the page reads, or nil before iOS 27.1, where no device has reserved regions.
    static func payload(for view: UIView) -> String? {
        guard #available(iOS 27.1, *) else { return nil }
        let regions = view.reservedRegions(kind: .division, options: .includeInactive).map { region(kind: "division", $0) }
            + view.reservedRegions(kind: .occlusion, options: .includeInactive).map { region(kind: "occlusion", $0) }
        return encode(width: view.bounds.width, height: view.bounds.height, regions: regions)
    }

    @available(iOS 27.1, *)
    private static func region(kind: String, _ region: UIView.ReservedRegion) -> HostRegion {
        HostRegion(
            kind: kind,
            active: region.isActive,
            x: region.frame.minX, y: region.frame.minY,
            width: region.frame.width, height: region.frame.height,
            margins: [region.margins.top, region.margins.right, region.margins.bottom, region.margins.left]
        )
    }

    static func encode(width: CGFloat, height: CGFloat, regions: [HostRegion]) -> String {
        let body = HostRegions(width: width, height: height, regions: regions)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let data = try? encoder.encode(body), let json = String(data: data, encoding: .utf8) else { return "null" }
        return json
    }

    static func script(payload: String) -> String {
        "window.\(globalName) = \(payload);"
    }
}

struct HostRegions: Encodable, Equatable {
    let width: CGFloat
    let height: CGFloat
    let regions: [HostRegion]
}

struct HostRegion: Encodable, Equatable {
    let kind: String
    let active: Bool
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
    /// Top, right, bottom, left: the part of the frame kept clear only for interactive content.
    let margins: [CGFloat]
}
