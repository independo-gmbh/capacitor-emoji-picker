import Foundation

/// Result of presenting the emoji picker.
struct EmojiPickerResult {
    /// The selected emoji, or `nil` when the picker was dismissed without a selection.
    let emoji: String?
}

/// A canonical error surfaced by the service/presenter layers.
struct EmojiPickerError: Error {
    let code: String
}
