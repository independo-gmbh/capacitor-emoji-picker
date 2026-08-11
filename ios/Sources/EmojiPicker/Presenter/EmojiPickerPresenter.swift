import Foundation

/// Performs the platform-specific presentation.
///
/// Kept separate from the Capacitor bridge and service so the native/system emoji keyboard
/// presentation (issue #5) can be implemented without touching plugin wiring or the
/// concurrency-guard logic.
protocol EmojiPickerPresenter {
    /// Presents the picker for the given presentation mode and reports the outcome.
    func present(presentation: String, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void)
}
