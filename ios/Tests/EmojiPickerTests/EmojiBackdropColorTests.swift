import UIKit
import XCTest
@testable import EmojiPicker

final class EmojiBackdropColorTests: XCTestCase {
    func testExpandsShorthandRgbToOpaqueColor() {
        let color = UIColor(emojiPickerBackdropHex: "#F00")
        XCTAssertEqual(color, UIColor(red: 1, green: 0, blue: 0, alpha: 1))
    }

    func testTreatsSixDigitHexAsOpaque() {
        let color = UIColor(emojiPickerBackdropHex: "#112233")
        XCTAssertEqual(color, UIColor(red: CGFloat(0x11) / 255, green: CGFloat(0x22) / 255, blue: CGFloat(0x33) / 255, alpha: 1))
    }

    func testEightDigitHexUsesTrailingAlphaChannel() {
        let color = UIColor(emojiPickerBackdropHex: "#112233aa")
        XCTAssertEqual(
            color,
            UIColor(red: CGFloat(0x11) / 255, green: CGFloat(0x22) / 255, blue: CGFloat(0x33) / 255, alpha: CGFloat(0xaa) / 255)
        )
    }
}
