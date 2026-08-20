import UIKit

/// Builds the native emoji-keyboard presentation UI.
///
/// Isolates UITextField/UIViewController construction from `NativeEmojiPickerPresenter` so the
/// presenter's settle-once/re-entrancy logic can be unit-tested with a fake, without touching
/// real UIKit responder/keyboard machinery (which XCTest cannot reliably drive headlessly).
protocol EmojiKeyboardPresentationFactory {
    /// Creates and presents the emoji-keyboard UI atop `hostViewController`, reporting outcomes
    /// via `listener`. Must not throw; construction failures are reported via
    /// `listener.onUnavailable()` instead, since on iOS whether the emoji input mode actually
    /// activates can only be confirmed asynchronously after presentation begins.
    func create(
        hostViewController: UIViewController,
        closeButtonOptions: EmojiCloseButtonOptions,
        backdropOptions: EmojiBackdropOptions,
        dismissOnBackdropTap: Bool,
        theme: String,
        listener: EmojiKeyboardPresentationListener
    ) -> EmojiKeyboardPresentationHandle
}

/// Callback used by the factory's implementation to report selection/dismissal/failure.
protocol EmojiKeyboardPresentationListener: AnyObject {
    /// A full replacement string (which may be a multi-scalar grapheme cluster: skin tone
    /// modifier, ZWJ sequence, or flag) was captured from the emoji keyboard.
    func onEmojiSelected(_ emoji: String)
    /// The user dismissed the keyboard/chrome without selecting anything.
    func onDismissed()
    /// The emoji input mode could not be verified active (or another unrecoverable UIKit-level
    /// failure occurred) after presentation was attempted.
    func onUnavailable()
}

/// Handle allowing the presenter to dismiss a previously-shown presentation defensively.
protocol EmojiKeyboardPresentationHandle {
    func dismiss()
}
