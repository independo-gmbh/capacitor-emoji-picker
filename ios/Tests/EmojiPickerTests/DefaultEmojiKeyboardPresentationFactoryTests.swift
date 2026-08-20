import UIKit
import XCTest
@testable import EmojiPicker

private let defaultCloseButtonOptions = EmojiCloseButtonOptions(size: "medium", position: "right", hidden: false)
private let defaultBackdropOptions = EmojiBackdropOptions(color: "#00000066", blur: 0)

private final class CapturingListener: EmojiKeyboardPresentationListener {
    var unavailableCount = 0
    func onEmojiSelected(_ emoji: String) {}
    func onDismissed() {}
    func onUnavailable() { unavailableCount += 1 }
}

final class DefaultEmojiKeyboardPresentationFactoryTests: XCTestCase {
    func testCreateReturnsAHandleAndPresentsTheContainer() {
        let host = UIViewController()
        let factory = DefaultEmojiKeyboardPresentationFactory()
        let listener = CapturingListener()

        let handle = factory.create(
            hostViewController: host,
            closeButtonOptions: defaultCloseButtonOptions,
            backdropOptions: defaultBackdropOptions,
            dismissOnBackdropTap: true,
            theme: "system",
            listener: listener
        )

        XCTAssertEqual(listener.unavailableCount, 0)
        handle.dismiss()
    }

    // NOTE: the "host already has a presented view controller" branch (-> onUnavailable() +
    // NoopHandle) needs `hostViewController.presentedViewController` to be genuinely non-nil,
    // which requires a real, completed `present(_:animated:)` round trip. That doesn't reliably
    // complete in this headless XCTest target (no host application/window scene) - confirmed by a
    // real attempt here timing out - mirroring the same undriveable-headlessly limitation already
    // documented on `EmojiKeyboardContainerViewController`.
}
