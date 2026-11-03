import UIKit
import XCTest
@testable import OneSixtyTwo

/// Geometry measured on the iPhone Duo outer display: a 466x678 view whose 84pt right inset is a
/// status column, with the time and Wi-Fi block reported as a 84x174 occlusion and the camera inside it.
final class ReservedRegionBridgeTests: XCTestCase {
    private let bounds = CGRect(x: 0, y: 0, width: 466, height: 678)
    private let insets = UIEdgeInsets(top: 0, left: 0, bottom: 34, right: 84)
    private let statusBlock = CGRect(x: 382, y: 0, width: 84, height: 174)
    private let camera = CGRect(x: 399.67, y: 29.33, width: 37, height: 37)

    func testStatusColumnOpensItsSide() {
        let sides = ReservedRegionBridge.openSides(bounds: bounds, insets: insets, occlusions: [camera, statusBlock])
        XCTAssertEqual(sides, OpenSides(left: false, right: true))
    }

    func testCameraAloneKeepsTheSafeArea() {
        // An occlusion clear of the edge does not account for the inset.
        XCTAssertEqual(ReservedRegionBridge.openSides(bounds: bounds, insets: insets, occlusions: [camera]), OpenSides())
    }

    func testNarrowerOcclusionKeepsTheSafeArea() {
        let narrow = CGRect(x: 426, y: 0, width: 40, height: 174)
        XCTAssertEqual(ReservedRegionBridge.openSides(bounds: bounds, insets: insets, occlusions: [narrow]), OpenSides())
    }

    func testFullHeightOcclusionKeepsTheSafeArea() {
        // Nothing to reclaim when the occlusion fills the whole column.
        let column = CGRect(x: 382, y: 0, width: 84, height: 678)
        XCTAssertEqual(ReservedRegionBridge.openSides(bounds: bounds, insets: insets, occlusions: [column]), OpenSides())
    }

    func testLeftColumnOpensTheLeftSide() {
        let rotated = UIEdgeInsets(top: 0, left: 84, bottom: 34, right: 0)
        let block = CGRect(x: 0, y: 504, width: 84, height: 174)
        XCTAssertEqual(ReservedRegionBridge.openSides(bounds: bounds, insets: rotated, occlusions: [block]), OpenSides(left: true, right: false))
    }

    func testNoInsetNoOpenSide() {
        XCTAssertEqual(ReservedRegionBridge.openSides(bounds: bounds, insets: .zero, occlusions: [statusBlock]), OpenSides())
    }
}
