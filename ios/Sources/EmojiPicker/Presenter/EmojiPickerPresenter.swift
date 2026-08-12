import Foundation

/// Close-button configuration for a single `present()` call. Only consulted by presenters that
/// render their own close affordance (currently iOS's native presenter); ignored elsewhere.
struct EmojiCloseButtonOptions {
    /// `"xSmall"`, `"small"`, `"medium"`, or `"large"`.
    let size: String
    /// `"left"`, `"center"`, or `"right"`.
    let position: String
    let hidden: Bool
}

/// Options for a single `present()` call, forwarded from the JS layer down to whichever
/// presenter/factory ends up handling it.
struct EmojiPickerPresentOptions {
    /// `"auto"` or `"web"`.
    let presentation: String
    let closeButton: EmojiCloseButtonOptions
    /// Only consulted by presenters that render a close affordance; ignored elsewhere.
    let dismissOnBackdropTap: Bool
}

/// Performs the platform-specific presentation.
///
/// Kept separate from the Capacitor bridge and service so the native/system emoji keyboard
/// presentation (issue #5) can be implemented without touching plugin wiring or the
/// concurrency-guard logic.
protocol EmojiPickerPresenter {
    /// Presents the picker for the given options and reports the outcome.
    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void)
}
