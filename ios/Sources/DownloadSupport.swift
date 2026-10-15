import UIKit
import WebKit

final class GameDownloadContext {
    let directoryURL: URL
    var fileURL: URL?

    init(directoryURL: URL) {
        self.directoryURL = directoryURL
    }
}

extension GameViewController {
    func startDownload(_ download: WKDownload) {
        hideLoading()
        let directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("OneSixtyTwo-\(UUID().uuidString)", isDirectory: true)

        do {
            try FileManager.default.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true
            )
            let context = GameDownloadContext(directoryURL: directoryURL)
            downloadContexts[ObjectIdentifier(download)] = context
            download.delegate = self
        } catch {
            download.cancel()
            showFailure("The download could not be started.")
        }
    }

    fileprivate func finishDownload(_ download: WKDownload) {
        guard let context = downloadContexts.removeValue(forKey: ObjectIdentifier(download)) else {
            showFailure("The download could not be completed.")
            return
        }
        guard let fileURL = context.fileURL,
              FileManager.default.fileExists(atPath: fileURL.path) else {
            cleanupDownload(context)
            showFailure("The download could not be completed.")
            return
        }

        guard presentedViewController == nil, viewIfLoaded?.window != nil else {
            cleanupDownload(context)
            showFailure("The download is ready, but sharing is unavailable right now.")
            return
        }

        let activityViewController = UIActivityViewController(
            activityItems: [fileURL],
            applicationActivities: nil
        )
        activityViewController.completionWithItemsHandler = { [weak self] _, _, _, _ in
            self?.cleanupDownload(context)
        }
        if let popover = activityViewController.popoverPresentationController {
            popover.sourceView = gameWebView
            popover.sourceRect = CGRect(
                x: gameWebView.bounds.midX,
                y: gameWebView.bounds.midY,
                width: 1,
                height: 1
            )
            popover.permittedArrowDirections = []
        }
        present(activityViewController, animated: true)
    }

    fileprivate func cleanupDownload(_ context: GameDownloadContext) {
        // Temporary export cleanup is best effort; a failed removal cannot affect game state.
        try? FileManager.default.removeItem(at: context.directoryURL)
    }

    fileprivate static func sanitizedFilename(_ suggestedFilename: String) -> String {
        let filename = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " ._-"))
        var sanitized = String()
        for scalar in filename.unicodeScalars {
            if allowed.contains(scalar) {
                sanitized.unicodeScalars.append(scalar)
            } else {
                sanitized.append("_")
            }
        }
        sanitized = sanitized.trimmingCharacters(in: .whitespacesAndNewlines)
        if sanitized.isEmpty || sanitized == "." || sanitized == ".." {
            return "download"
        }
        return String(sanitized.prefix(120))
    }
}

extension GameViewController: WKDownloadDelegate {
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping @MainActor @Sendable (URL?) -> Void
    ) {
        guard let context = downloadContexts[ObjectIdentifier(download)] else {
            completionHandler(nil)
            return
        }

        let destination = context.directoryURL.appendingPathComponent(
            Self.sanitizedFilename(suggestedFilename),
            isDirectory: false
        )
        context.fileURL = destination
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        finishDownload(download)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let context = downloadContexts.removeValue(forKey: ObjectIdentifier(download)) else {
            showFailure("The download failed.")
            return
        }
        cleanupDownload(context)
        showFailure("The download failed.")
    }
}
