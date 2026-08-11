import Foundation

/// Canonical error codes surfaced by the EmojiPicker plugin.
enum ErrorCodes {
    /// A `present()` call was made while a picker was already active.
    static let alreadyPresenting = "ALREADY_PRESENTING"
    /// The requested presentation is not implemented on this platform yet.
    static let notImplemented = "NOT_IMPLEMENTED"
}
