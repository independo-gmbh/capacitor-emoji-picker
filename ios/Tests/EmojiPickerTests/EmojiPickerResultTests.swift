import XCTest
@testable import EmojiPicker

final class EmojiPickerResultTests: XCTestCase {
    func testDismissalPayloadCarriesNSNullAndIsValidJSON() {
        let payload = EmojiPickerResult(emoji: nil).bridgePayload
        XCTAssertTrue(payload["emoji"] is NSNull)
        XCTAssertTrue(JSONSerialization.isValidJSONObject(payload))
    }

    func testSelectionPayloadCarriesTheEmoji() {
        let payload = EmojiPickerResult(emoji: "😀").bridgePayload
        XCTAssertEqual(payload["emoji"] as? String, "😀")
        XCTAssertTrue(JSONSerialization.isValidJSONObject(payload))
    }
}
