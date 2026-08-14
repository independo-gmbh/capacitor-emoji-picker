import UIKit
import XCTest
@testable import EmojiPicker

// NOTE: Whether the real system emoji keyboard actually appears when `EmojiTextField` overrides
// `textInputMode` is undocumented UIKit behavior and is not verifiable by XCTest - these tests
// only prove the Swift-level contract of `EmojiKeyboardContainerViewController`'s delegate method
// (full-string forwarding, not single-scalar truncation, and rejecting non-emoji input typed
// after the user manually switches off the forced emoji keyboard). The undocumented behavior
// itself must be confirmed manually on a real device/simulator per iOS version.

private let defaultCloseButtonOptions = EmojiCloseButtonOptions(size: "large", position: "right", hidden: false)

private final class CapturingListener: EmojiKeyboardPresentationListener {
    var selectedEmojis: [String] = []
    var dismissedCount = 0
    var unavailableCount = 0

    func onEmojiSelected(_ emoji: String) {
        selectedEmojis.append(emoji)
    }

    func onDismissed() {
        dismissedCount += 1
    }

    func onUnavailable() {
        unavailableCount += 1
    }
}

final class EmojiTextFieldDelegateTests: XCTestCase {
    func testNonEmptyReplacementStringsAreForwardedUnchanged() {
        for emoji in ["😀", "👍🏽", "👨‍👩‍👧‍👦", "🇩🇪"] {
            let listener = CapturingListener()
            let container = EmojiKeyboardContainerViewController(
                listener: listener,
                closeButtonOptions: defaultCloseButtonOptions,
                dismissOnBackdropTap: true,
                theme: "system"
            )

            let handled = container.textField(UITextField(), shouldChangeCharactersIn: NSRange(), replacementString: emoji)

            XCTAssertFalse(handled)
            XCTAssertEqual(listener.selectedEmojis, [emoji])
            XCTAssertEqual(listener.dismissedCount, 0)
            XCTAssertEqual(listener.unavailableCount, 0)
        }
    }

    func testEmptyReplacementStringIsANoOp() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )

        let handled = container.textField(UITextField(), shouldChangeCharactersIn: NSRange(), replacementString: "")

        XCTAssertFalse(handled)
        XCTAssertTrue(listener.selectedEmojis.isEmpty)
        XCTAssertEqual(listener.dismissedCount, 0)
        XCTAssertEqual(listener.unavailableCount, 0)
    }

    func testOnlyFirstNonEmptyReplacementIsReported() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )

        _ = container.textField(UITextField(), shouldChangeCharactersIn: NSRange(), replacementString: "😀")
        _ = container.textField(UITextField(), shouldChangeCharactersIn: NSRange(), replacementString: "🎉")

        XCTAssertEqual(listener.selectedEmojis, ["😀"])
    }

    func testPlainTextTypedAfterSwitchingToABCKeyboardIsIgnored() {
        // The system's "ABC" input-mode-switch key can't be disabled (no documented API for it),
        // so plain letters/digits/punctuation typed after the user manually switches off the
        // forced emoji keyboard must be filtered out rather than reported as a picked emoji.
        for text in ["a", "Z", "5", " ", "!", "hello"] {
            let listener = CapturingListener()
            let container = EmojiKeyboardContainerViewController(
                listener: listener,
                closeButtonOptions: defaultCloseButtonOptions,
                dismissOnBackdropTap: true,
                theme: "system"
            )

            let handled = container.textField(UITextField(), shouldChangeCharactersIn: NSRange(), replacementString: text)

            XCTAssertFalse(handled)
            XCTAssertTrue(listener.selectedEmojis.isEmpty, "expected \"\(text)\" to be filtered out")
        }
    }

    func testKeyboardAppearanceMatchesForcedDarkTheme() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "dark"
        )

        _ = container.view // force viewDidLoad

        XCTAssertEqual(container.emojiField.keyboardAppearance, .dark)
    }

    func testKeyboardAppearanceMatchesForcedLightTheme() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "light"
        )

        _ = container.view // force viewDidLoad

        XCTAssertEqual(container.emojiField.keyboardAppearance, .light)
    }

    func testKeyboardAppearanceFollowsSystemByDefault() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )

        _ = container.view // force viewDidLoad

        XCTAssertEqual(container.emojiField.keyboardAppearance, .default)
    }

    func testCloseButtonHiddenIsNotAddedToViewHierarchy() {
        let listener = CapturingListener()
        let options = EmojiCloseButtonOptions(size: "large", position: "right", hidden: true)
        let container = EmojiKeyboardContainerViewController(listener: listener, closeButtonOptions: options, dismissOnBackdropTap: true, theme: "system")

        _ = container.view // force viewDidLoad

        XCTAssertNil(container.view.subviews.first { $0 is UIButton })
    }

    func testCloseButtonVisibleIsAddedToViewHierarchy() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )

        _ = container.view // force viewDidLoad

        XCTAssertNotNil(container.view.subviews.first { $0 is UIButton })
    }

    func testBackdropTapGestureAddedWhenDismissOnBackdropTapEnabled() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )

        _ = container.view // force viewDidLoad

        XCTAssertTrue(container.view.gestureRecognizers?.isEmpty == false)
    }

    func testBackdropTapGestureNotAddedWhenDisabledAndButtonVisible() {
        let listener = CapturingListener()
        let options = EmojiCloseButtonOptions(size: "large", position: "right", hidden: false)
        let container = EmojiKeyboardContainerViewController(listener: listener, closeButtonOptions: options, dismissOnBackdropTap: false, theme: "system")

        _ = container.view // force viewDidLoad

        XCTAssertTrue(container.view.gestureRecognizers?.isEmpty ?? true)
    }

    func testHiddenCloseButtonForcesBackdropDismissEvenWhenDisabled() {
        // Safety net: a developer can't accidentally trap the user with no way to dismiss the
        // keyboard by combining `hidden: true` with `dismissOnBackdropTap: false`.
        let listener = CapturingListener()
        let options = EmojiCloseButtonOptions(size: "large", position: "right", hidden: true)
        let container = EmojiKeyboardContainerViewController(listener: listener, closeButtonOptions: options, dismissOnBackdropTap: false, theme: "system")

        _ = container.view // force viewDidLoad

        XCTAssertTrue(container.view.gestureRecognizers?.isEmpty == false)
    }

    func testBackdropTapReportsDismissedExactlyOnce() {
        let listener = CapturingListener()
        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: defaultCloseButtonOptions,
            dismissOnBackdropTap: true,
            theme: "system"
        )
        _ = container.view // force viewDidLoad

        container.handleBackdropTap()
        container.handleBackdropTap()

        XCTAssertEqual(listener.dismissedCount, 1)
    }
}
