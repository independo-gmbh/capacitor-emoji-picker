import Foundation

/// Result of presenting the emoji picker.
struct EmojiPickerResult {
    /// The selected emoji, or `nil` when the picker was dismissed without a selection.
    let emoji: String?

    /// The payload resolved to JS. A `nil` emoji must be `NSNull`: a boxed `Optional.none` is not a valid
    /// JSON object value, so Capacitor's `JSONSerialization.isValidJSONObject` check would reject the result.
    var bridgePayload: [String: Any] {
        ["emoji": emoji.map { $0 as Any } ?? NSNull()]
    }
}

/// A canonical error surfaced by the service/presenter layers.
struct EmojiPickerError: Error {
    let code: String
}
