import StoreKit
import WebKit

/// StoreKit 2 behind the game's `store` script message handler (`src/lib/cosmetics/support.ts`).
/// The web ledger decides coin quantities and credits each transaction once by its id; this bridge
/// only reports StoreKit-verified transactions and finishes the ones the page says it has saved.
/// `SKIncludeConsumableInAppPurchaseHistory` keeps finished consumables in `Transaction.all`, so a
/// reinstall or another device credits past purchases again.
@MainActor
final class StoreBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let handlerName = "store"
    static let updateEvent = "162-store-transactions"

    private weak var webView: WKWebView?
    private let isAllowedOrigin: @MainActor (URL) -> Bool
    private var updates: Task<Void, Never>?
    private var products: [String: Product] = [:]

    init(isAllowedOrigin: @escaping @MainActor (URL) -> Bool) {
        self.isAllowedOrigin = isAllowedOrigin
        super.init()
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        updates?.cancel()
        // Ask to Buy approvals, refunds, and purchases made elsewhere arrive here; the page pulls them.
        updates = Task { [weak self] in
            for await _ in Transaction.updates {
                self?.notifyPage()
            }
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url,
              isAllowedOrigin(url),
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return (nil, "Purchases are not available on this page.")
        }
        do {
            switch action {
            case "products":
                return (try await loadProducts(ids: body["ids"] as? [String] ?? []), nil)
            case "purchase":
                guard let id = body["id"] as? String else { return (nil, "Choose a token pack.") }
                return (try await purchase(id: id), nil)
            case "transactions":
                return (await verifiedTransactions().map(Self.payload), nil)
            case "finish":
                await finish(ids: Set(body["ids"] as? [String] ?? []))
                return (true, nil)
            default:
                return (nil, "Unknown store request.")
            }
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    private func loadProducts(ids: [String]) async throws -> [[String: String]] {
        let loaded = try await Product.products(for: ids)
        for product in loaded { products[product.id] = product }
        return ids.compactMap { id in
            products[id].map { ["id": $0.id, "displayPrice": $0.displayPrice] }
        }
    }

    private func purchase(id: String) async throws -> String {
        if products[id] == nil { _ = try await loadProducts(ids: [id]) }
        guard let product = products[id] else { throw StoreBridgeError.unknownProduct }
        guard let scene = webView?.window?.windowScene else { throw StoreBridgeError.noScene }
        // The transaction stays unfinished until the page reports it saved (see `finish`).
        switch try await product.purchase(confirmIn: scene) {
        case .success(let verification):
            guard case .verified = verification else { throw StoreBridgeError.unverified }
            return "purchased"
        case .pending:
            return "pending"
        case .userCancelled:
            return "cancelled"
        @unknown default:
            return "cancelled"
        }
    }

    /// Every verified consumable transaction, finished or not, once each.
    func verifiedTransactions() async -> [Transaction] {
        var seen = Set<UInt64>()
        var transactions: [Transaction] = []
        for sequence in [Transaction.unfinished, Transaction.all] {
            for await result in sequence {
                guard case .verified(let transaction) = result,
                      transaction.productType == .consumable,
                      seen.insert(transaction.id).inserted else { continue }
                transactions.append(transaction)
            }
        }
        return transactions
    }

    private func finish(ids: Set<String>) async {
        for await result in Transaction.unfinished {
            guard case .verified(let transaction) = result, ids.contains(String(transaction.id)) else { continue }
            await transaction.finish()
        }
    }

    private func notifyPage() {
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(Self.updateEvent)'))")
    }

    static func payload(_ transaction: Transaction) -> [String: Any] {
        let formatter = ISO8601DateFormatter()
        return [
            "id": String(transaction.id),
            "productId": transaction.productID,
            "purchasedAt": formatter.string(from: transaction.purchaseDate),
            "revokedAt": transaction.revocationDate.map { formatter.string(from: $0) } ?? NSNull()
        ]
    }
}

enum StoreBridgeError: LocalizedError {
    case unknownProduct, unverified, noScene

    var errorDescription: String? {
        switch self {
        case .unknownProduct: "That token pack is not available."
        case .unverified: "The App Store could not verify this purchase."
        case .noScene: "The purchase sheet could not open. Please retry."
        }
    }
}
