import StoreKit
import StoreKitTest
import XCTest
@testable import OneSixtyTwo

/// Runs against `ios/StoreKit/Products.storekit`, the local mirror of the App Store Connect token packs.
@MainActor
final class StoreBridgeTests: XCTestCase {
    private var session: SKTestSession!
    private let bridge = StoreBridge { _ in true }

    override func setUp() async throws {
        session = try SKTestSession(configurationFileNamed: "Products")
        session.disableDialogs = true
        session.clearTransactions()
        // StoreKit Testing on the Xcode 26.6 simulators loads no products and refuses purchases as
        // notEntitled (developer.apple.com/forums/thread/836842); these tests then run on a device only.
        if try await Product.products(for: ["coins.4"]).isEmpty {
            throw XCTSkip("StoreKit Testing loads no products in this simulator; run on a device.")
        }
    }

    override func tearDown() async throws {
        session.clearTransactions()
    }

    func testReportsAPurchaseUntilFinishedAndOnlyOnce() async throws {
        try await session.buyProduct(identifier: "coins.20")
        let reported = await bridge.verifiedTransactions()
        XCTAssertEqual(reported.map(\.productID), ["coins.20"])

        let payload = StoreBridge.payload(try XCTUnwrap(reported.first))
        XCTAssertEqual(payload["productId"] as? String, "coins.20")
        XCTAssertEqual(payload["id"] as? String, String(reported[0].id))
        XCTAssertNotNil(ISO8601DateFormatter().date(from: try XCTUnwrap(payload["purchasedAt"] as? String)))
        XCTAssertTrue(payload["revokedAt"] is NSNull)
        let unfinished = try await unfinishedCount()
        XCTAssertEqual(unfinished, 1)
    }

    func testRefundsReportTheirRevocationDate() async throws {
        let transaction = try await session.buyProduct(identifier: "coins.4")
        try session.refundTransaction(identifier: UInt(transaction.id))
        let reported = await bridge.verifiedTransactions()
        let payload = StoreBridge.payload(try XCTUnwrap(reported.first { $0.id == transaction.id }))
        XCTAssertNotNil(ISO8601DateFormatter().date(from: try XCTUnwrap(payload["revokedAt"] as? String)))
    }

    func testThePackPricesMatchTheFourTokensPerDollarRate() async throws {
        let products = try await Product.products(for: ["coins.4", "coins.20", "coins.40"])
        let prices = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.price) })
        XCTAssertEqual(prices, ["coins.4": 1, "coins.20": 5, "coins.40": 10])
    }

    private func unfinishedCount() async throws -> Int {
        var count = 0
        for await _ in Transaction.unfinished { count += 1 }
        return count
    }
}
