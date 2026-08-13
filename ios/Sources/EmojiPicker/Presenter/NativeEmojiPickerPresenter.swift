import UIKit

/// Presents the system emoji keyboard via an injected `EmojiKeyboardPresentationFactory`.
final class NativeEmojiPickerPresenter: EmojiPickerPresenter {

    /// Supplies the current host view controller to present atop; nil if none is available.
    typealias HostViewControllerProvider = () -> UIViewController?

    /// Decides whether a host view controller can currently present UI.
    ///
    /// Isolated from `present` for symmetry with Android's `ActivityAvailabilityChecker` seam and
    /// to keep the check fakeable in tests. UIKit has no throwing-outside-instrumented-tests trap
    /// the way `Activity#isFinishing()` does under Android's mockable jar, so this isn't
    /// load-bearing for crash-avoidance the way Android's is - it exists for seam consistency.
    typealias HostAvailabilityChecker = (UIViewController?) -> Bool

    private static let defaultAvailabilityChecker: HostAvailabilityChecker = { host in
        guard let host = host else { return false }
        return host.isViewLoaded && host.view.window != nil
    }

    private let hostViewControllerProvider: HostViewControllerProvider
    private let factory: EmojiKeyboardPresentationFactory
    private let availabilityChecker: HostAvailabilityChecker

    /// The presentation currently owning the UI/handle, if any. Only the `Presentation` instance
    /// that is still `current` may settle and clear this field; a stale presentation whose async
    /// callback fires after a newer one has taken over must not be able to touch it.
    private var current: Presentation?

    convenience init(hostViewControllerProvider: @escaping HostViewControllerProvider, factory: EmojiKeyboardPresentationFactory) {
        self.init(
            hostViewControllerProvider: hostViewControllerProvider,
            factory: factory,
            availabilityChecker: Self.defaultAvailabilityChecker
        )
    }

    /// Internal: lets tests inject a fake `HostAvailabilityChecker`.
    init(
        hostViewControllerProvider: @escaping HostViewControllerProvider,
        factory: EmojiKeyboardPresentationFactory,
        availabilityChecker: @escaping HostAvailabilityChecker
    ) {
        self.hostViewControllerProvider = hostViewControllerProvider
        self.factory = factory
        self.availabilityChecker = availabilityChecker
    }

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        guard options.presentation == "auto" else {
            // 'web' (and any future non-native presentation) isn't implemented on iOS yet;
            // honestly reject rather than silently showing the native picker instead.
            completion(.failure(EmojiPickerError(code: ErrorCodes.notImplemented)))
            return
        }

        // Capacitor iOS plugin calls are not guaranteed to arrive on the main thread, but
        // UIViewController/UITextField/UIWindow are main-thread-only APIs. Unconditionally hop -
        // unlike Android's Activity-based branch, the provider closure here is always safe to call
        // from any thread, so there's no "no UI to touch" case to special-case around.
        DispatchQueue.main.async { [weak self] in
            self?.presentOnMainThread(
                closeButton: options.closeButton,
                dismissOnBackdropTap: options.dismissOnBackdropTap,
                completion: completion
            )
        }
    }

    private func presentOnMainThread(
        closeButton: EmojiCloseButtonOptions,
        dismissOnBackdropTap: Bool,
        completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void
    ) {
        let host = hostViewControllerProvider()
        guard availabilityChecker(host), let host = host else {
            completion(.failure(EmojiPickerError(code: ErrorCodes.nativeUnavailable)))
            return
        }

        // Dismiss the prior presentation's UI, but do NOT clear `current` here: dismissal may
        // complete asynchronously (e.g. dismiss(animated:) completion, or the emoji-mode
        // verification path still in flight). The old Presentation's own settle() - triggered
        // whenever its callback eventually fires - clears `current` itself, and only if it's
        // still the active one, so it can never clobber the new Presentation created below.
        current?.dismissPresentation()

        let presentation = Presentation(completion: completion)
        current = presentation
        presentation.owner = self
        presentation.start(host: host, closeButton: closeButton, dismissOnBackdropTap: dismissOnBackdropTap, factory: factory)
    }

    /// Owns everything about ONE presentation attempt: its handle, its cleanup, and whether it
    /// has already settled. Identity - not a shared field - determines whether a (possibly
    /// late-arriving, async) callback is allowed to mutate `current`.
    private final class Presentation: EmojiKeyboardPresentationListener {
        private let completion: (Result<EmojiPickerResult, EmojiPickerError>) -> Void
        weak var owner: NativeEmojiPickerPresenter?
        private var handle: EmojiKeyboardPresentationHandle?
        private var settled = false
        private var resignActiveObserver: NSObjectProtocol?

        init(completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
            self.completion = completion
        }

        func start(
            host: UIViewController,
            closeButton: EmojiCloseButtonOptions,
            dismissOnBackdropTap: Bool,
            factory: EmojiKeyboardPresentationFactory
        ) {
            let createdHandle = factory.create(
                hostViewController: host,
                closeButtonOptions: closeButton,
                dismissOnBackdropTap: dismissOnBackdropTap,
                listener: self
            )

            if settled {
                // Defensive: if create() somehow synchronously settled us (e.g. immediate
                // onUnavailable/onDismissed), don't leak the handle - dismiss it right away.
                createdHandle.dismiss()
                return
            }

            handle = createdHandle

            // Belt-and-suspenders: settle {emoji: nil} if the app backgrounds mid-presentation.
            // There's no exact iOS analog to Android's Lifecycle.ON_DESTROY hook here, but this
            // closes the same class of "never settles" risk if the keyboard/first-responder chain
            // gets torn down by the system while backgrounded.
            resignActiveObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.dismissPresentationAndSettleNil()
            }
        }

        /// Dismisses this presentation's handle, if any. Does not settle synchronously.
        func dismissPresentation() {
            handle?.dismiss()
        }

        private func dismissPresentationAndSettleNil() {
            handle?.dismiss()
            settle(.success(EmojiPickerResult(emoji: nil)))
        }

        // MARK: EmojiKeyboardPresentationListener

        func onEmojiSelected(_ emoji: String) {
            settle(.success(EmojiPickerResult(emoji: emoji)))
        }

        func onDismissed() {
            settle(.success(EmojiPickerResult(emoji: nil)))
        }

        func onUnavailable() {
            settle(.failure(EmojiPickerError(code: ErrorCodes.nativeUnavailable)))
        }

        private func settle(_ result: Result<EmojiPickerResult, EmojiPickerError>) {
            guard !settled else { return }
            settled = true
            closeOut()
            completion(result)
        }

        /// Removes the notification observer and, if still current, clears `current`. Never
        /// touches another Presentation instance's state.
        private func closeOut() {
            if let observer = resignActiveObserver {
                NotificationCenter.default.removeObserver(observer)
            }
            if owner?.current === self {
                owner?.current = nil
            }
        }
    }
}
