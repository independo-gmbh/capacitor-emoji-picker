import UIKit
import XCTest
@testable import EmojiPicker

private let defaultCloseButton = EmojiCloseButtonOptions(size: "large", position: "right", hidden: false)
private let autoOptions = EmojiPickerPresentOptions(presentation: "auto", closeButton: defaultCloseButton, dismissOnBackdropTap: true)
private let webOptions = EmojiPickerPresentOptions(presentation: "web", closeButton: defaultCloseButton, dismissOnBackdropTap: true)

/// A factory that captures the listener/handle/options passed to it so tests can drive them manually.
private final class FakeEmojiKeyboardPresentationFactory: EmojiKeyboardPresentationFactory {
    weak var capturedListener: EmojiKeyboardPresentationListener?
    var lastHandle: FakeEmojiKeyboardPresentationHandle?
    var lastCloseButtonOptions: EmojiCloseButtonOptions?
    var lastDismissOnBackdropTap: Bool?
    var createCount = 0

    func create(
        hostViewController: UIViewController,
        closeButtonOptions: EmojiCloseButtonOptions,
        dismissOnBackdropTap: Bool,
        listener: EmojiKeyboardPresentationListener
    ) -> EmojiKeyboardPresentationHandle {
        createCount += 1
        capturedListener = listener
        lastCloseButtonOptions = closeButtonOptions
        lastDismissOnBackdropTap = dismissOnBackdropTap
        let handle = FakeEmojiKeyboardPresentationHandle()
        lastHandle = handle
        return handle
    }
}

/// Mirrors real presentation semantics: dismiss() does NOT synchronously invoke the listener -
/// tests that need to exercise async-dismiss-after-reentry fire the captured listener manually.
private final class FakeEmojiKeyboardPresentationHandle: EmojiKeyboardPresentationHandle {
    var dismissed = false

    func dismiss() {
        dismissed = true
    }
}

final class NativeEmojiPickerPresenterTests: XCTestCase {

    /// `NativeEmojiPickerPresenter.present` unconditionally hops to the main thread via
    /// `DispatchQueue.main.async` before touching the factory. Since tests run on the main thread
    /// without an actively-spinning run loop, that queued block never executes on its own -
    /// briefly running the run loop drains it, exactly like Android's `runOnUiThread` handoff
    /// completing synchronously enough for its tests to proceed without any pumping.
    private func pumpMainQueue() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    }

    func testUnavailableHostReportsNativeUnavailableAndNeverCreatesPresentation() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { nil },
            factory: factory,
            availabilityChecker: { _ in false }
        )

        var callCount = 0
        var capturedError: EmojiPickerError?
        presenter.present(options: autoOptions) { result in
            callCount += 1
            if case .failure(let error) = result { capturedError = error }
        }
        pumpMainQueue()

        XCTAssertEqual(callCount, 1)
        XCTAssertEqual(capturedError?.code, ErrorCodes.nativeUnavailable)
        XCTAssertEqual(factory.createCount, 0)
    }

    func testSelectionSettlesOnceEvenIfDismissalFollows() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var callCount = 0
        var lastEmoji: String??
        presenter.present(options: autoOptions) { result in
            callCount += 1
            if case .success(let pickerResult) = result { lastEmoji = pickerResult.emoji }
        }
        pumpMainQueue()

        factory.capturedListener?.onEmojiSelected("😀")
        factory.capturedListener?.onDismissed()

        XCTAssertEqual(callCount, 1)
        XCTAssertEqual(lastEmoji, "😀")
    }

    func testDismissalWithoutSelectionResultsInNullEmoji() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var callCount = 0
        var lastEmoji: String??
        presenter.present(options: autoOptions) { result in
            callCount += 1
            if case .success(let pickerResult) = result { lastEmoji = pickerResult.emoji }
        }
        pumpMainQueue()

        factory.capturedListener?.onDismissed()

        XCTAssertEqual(callCount, 1)
        XCTAssertEqual(lastEmoji as? String, nil)
    }

    func testDoubleDismissSettlesOnce() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var callCount = 0
        presenter.present(options: autoOptions) { _ in callCount += 1 }
        pumpMainQueue()

        factory.capturedListener?.onDismissed()
        factory.capturedListener?.onDismissed()

        XCTAssertEqual(callCount, 1)
    }

    func testReentrantPresentDismissesPriorPresentationHandle() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var firstCallCount = 0
        var firstEmoji: String??
        presenter.present(options: autoOptions) { result in
            firstCallCount += 1
            if case .success(let pickerResult) = result { firstEmoji = pickerResult.emoji }
        }
        pumpMainQueue()
        let firstHandle = factory.lastHandle
        let firstListener = factory.capturedListener
        XCTAssertEqual(firstHandle?.dismissed, false)

        var secondCallCount = 0
        var secondEmoji: String??
        presenter.present(options: autoOptions) { result in
            secondCallCount += 1
            if case .success(let pickerResult) = result { secondEmoji = pickerResult.emoji }
        }
        pumpMainQueue()
        let secondHandle = factory.lastHandle

        XCTAssertEqual(firstHandle?.dismissed, true)
        XCTAssertEqual(factory.createCount, 2)
        XCTAssertEqual(firstCallCount, 0)
        XCTAssertEqual(secondCallCount, 0)

        // A real dismissal completion can arrive AFTER the second present() call already took
        // over. It must settle the first completion but never touch the second (now current)
        // presentation's state.
        firstListener?.onDismissed()

        XCTAssertEqual(firstCallCount, 1)
        XCTAssertEqual(firstEmoji as? String, nil)
        XCTAssertEqual(secondCallCount, 0)
        XCTAssertEqual(secondHandle?.dismissed, false)

        // The second presentation must still be fully functional afterward.
        factory.capturedListener?.onEmojiSelected("🎉")
        XCTAssertEqual(secondCallCount, 1)
        XCTAssertEqual(secondEmoji, "🎉")
    }

    func testWebPresentationReportsNotImplementedAndNeverTouchesHostOrFactory() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        var hostProviderCalled = false
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: {
                hostProviderCalled = true
                return nil
            },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var callCount = 0
        var capturedError: EmojiPickerError?
        presenter.present(options: webOptions) { result in
            callCount += 1
            if case .failure(let error) = result { capturedError = error }
        }

        // 'web' is rejected synchronously, before any main-thread hop.
        XCTAssertEqual(capturedError?.code, ErrorCodes.notImplemented)
        XCTAssertEqual(callCount, 1)
        XCTAssertFalse(hostProviderCalled)
        XCTAssertEqual(factory.createCount, 0)
    }

    func testFactoryUnavailableCallbackResultsInNativeUnavailableAndPresenterRemainsUsable() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        var capturedError: EmojiPickerError?
        var callCount = 0
        presenter.present(options: autoOptions) { result in
            callCount += 1
            if case .failure(let error) = result { capturedError = error }
        }
        pumpMainQueue()
        factory.capturedListener?.onUnavailable()

        XCTAssertEqual(capturedError?.code, ErrorCodes.nativeUnavailable)
        XCTAssertEqual(callCount, 1)

        // A subsequent present() call must not be permanently blocked by leftover state.
        var secondEmoji: String??
        presenter.present(options: autoOptions) { result in
            if case .success(let pickerResult) = result { secondEmoji = pickerResult.emoji }
        }
        pumpMainQueue()
        factory.capturedListener?.onEmojiSelected("😀")

        XCTAssertEqual(secondEmoji, "😀")
    }

    func testMultiScalarEmojiSelectionReturnsFullString() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        for emoji in ["👨‍👩‍👧‍👦", "👍🏽", "🇩🇪"] {
            var received: String??
            presenter.present(options: autoOptions) { result in
                if case .success(let pickerResult) = result { received = pickerResult.emoji }
            }
            pumpMainQueue()
            factory.capturedListener?.onEmojiSelected(emoji)
            XCTAssertEqual(received, emoji)
        }
    }

    func testCloseButtonOptionsAndDismissOnBackdropTapAreForwardedToFactory() {
        let factory = FakeEmojiKeyboardPresentationFactory()
        let presenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { UIViewController() },
            factory: factory,
            availabilityChecker: { _ in true }
        )

        let closeButton = EmojiCloseButtonOptions(size: "small", position: "left", hidden: true)
        presenter.present(
            options: EmojiPickerPresentOptions(presentation: "auto", closeButton: closeButton, dismissOnBackdropTap: false)
        ) { _ in }
        pumpMainQueue()

        XCTAssertEqual(factory.lastCloseButtonOptions?.size, "small")
        XCTAssertEqual(factory.lastCloseButtonOptions?.position, "left")
        XCTAssertEqual(factory.lastCloseButtonOptions?.hidden, true)
        XCTAssertEqual(factory.lastDismissOnBackdropTap, false)
    }
}
