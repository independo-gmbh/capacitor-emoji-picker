import Foundation

/// Canonical error codes surfaced by the EmojiPicker plugin.
enum ErrorCodes {
    /// A `present()` call was made while a picker was already active.
    static let alreadyPresenting = "ALREADY_PRESENTING"
    /// The requested presentation is not implemented on this platform yet.
    static let notImplemented = "NOT_IMPLEMENTED"
    /// The native picker UI could not be presented (e.g. no active view controller, emoji input
    /// mode unavailable); distinct from user cancellation.
    static let nativeUnavailable = "NATIVE_UNAVAILABLE"
}
