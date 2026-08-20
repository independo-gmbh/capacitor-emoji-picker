import UIKit

/// Presents the web bottom sheet inside the app's own Capacitor webview by evaluating JS there
/// (registered by `registerNativeWebBridge()` in the JS layer), and resolves once that JS
/// reports back via `handleBridgeMessage`. Kept independent of any real `WKWebView` type so it
/// stays unit-testable: production wiring in `EmojiPicker.load()` supplies a JS evaluator backed
/// by `WKWebView.evaluateJavaScript`, tests supply a fake one.
final class WebFallbackEmojiPickerPresenter: EmojiPickerPresenter {
    /// How long to wait for the JS side to report back before giving up.
    static let timeoutSeconds: TimeInterval = 3

    /// Evaluates JS in the app's webview. The completion callback fires once the script has at
    /// least started executing (i.e. the bridge/webview is alive) - it is a liveness signal, not
    /// a signal that the picker has settled.
    private let jsEvaluator: (String, @escaping () -> Void) -> Void
    private let scheduler: (TimeInterval, @escaping () -> Void) -> Void
    private var pending: [String: PendingRequest] = [:]

    convenience init(jsEvaluator: @escaping (String, @escaping () -> Void) -> Void) {
        self.init(jsEvaluator: jsEvaluator) { delay, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        }
    }

    /// Internal: lets tests inject a fake scheduler instead of waiting real time.
    init(
        jsEvaluator: @escaping (String, @escaping () -> Void) -> Void,
        scheduler: @escaping (TimeInterval, @escaping () -> Void) -> Void
    ) {
        self.jsEvaluator = jsEvaluator
        self.scheduler = scheduler
    }

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        // Capacitor plugin calls arrive on a background "bridge" queue, but `jsEvaluator` ends up
        // calling `WKWebView.evaluateJavaScript`, a main-thread-only UI API (mirrors the
        // unconditional hop `NativeEmojiPickerPresenter` already does for its own UIKit calls).
        DispatchQueue.main.async { [weak self] in
            self?.presentOnMainThread(options: options, completion: completion)
        }
    }

    private func presentOnMainThread(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        let requestId = UUID().uuidString

        // Genuine timeout - i.e. the eval-completion callback below never fired at all (extremely
        // rare: webview torn down mid-call, etc). Defensively tell the JS side to close (in case
        // the bridge partially works) and settle via the same path as a normal dismiss. If the
        // eval completion DID fire by the time this runs, it's a no-op: the request just stays
        // pending for its real result.
        scheduler(Self.timeoutSeconds) { [weak self] in
            self?.handleTimeout(requestId: requestId)
        }

        // Belt-and-suspenders, mirroring `NativeEmojiPickerPresenter`'s own backgrounding safety
        // net: force-dismiss (and tell the JS sheet to close) if the app backgrounds mid-presentation,
        // since there's no guarantee the JS side's own bridge call ever lands in that case.
        let resignActiveObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.dismiss(requestId: requestId)
        }

        pending[requestId] = PendingRequest(completion: completion, resignActiveObserver: resignActiveObserver)

        let json = Self.encodeOptionsJson(
            dismissOnBackdropTap: options.dismissOnBackdropTap,
            closeButton: options.closeButton,
            backdrop: options.backdrop,
            theme: options.theme
        )
        // The eval "completion" here only means the script at least started executing (i.e. the
        // bridge/webview is alive) - it cancels the timeout WITHOUT settling the request, which
        // stays pending for the real result reported later via handleBridgeMessage.
        jsEvaluator("window.__CapacitorEmojiPickerPresentWeb('\(requestId)', '\(json)')") { [weak self] in
            self?.pending[requestId]?.evalAcknowledged = true
        }
    }

    /// Called by the `WKScriptMessageHandler` once the JS sheet settles.
    func handleBridgeMessage(requestId: String, emoji: String?, errorCode: String?) {
        settle(requestId: requestId, emoji: emoji, errorCode: errorCode)
    }

    /// Force-dismisses a still-pending presentation (e.g. on app backgrounding).
    func dismiss(requestId: String) {
        jsEvaluator("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('\(requestId)')") {}
        settle(requestId: requestId, emoji: nil, errorCode: nil)
    }

    /// Handles the timeout firing: a no-op if the eval-completion callback already acknowledged
    /// the bridge is alive (the request stays pending for its real result); otherwise this is a
    /// genuine bridge-liveness failure (the JS side never even started processing the request),
    /// so defensively evaluate the JS dismiss call and settle as an error rather than reusing
    /// `dismiss(requestId:)`'s success/null semantics (that's reserved for genuine user/app
    /// dismissal, e.g. backgrounding).
    private func handleTimeout(requestId: String) {
        guard let request = pending[requestId], !request.evalAcknowledged else { return }
        jsEvaluator("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('\(requestId)')") {}
        settle(requestId: requestId, emoji: nil, errorCode: ErrorCodes.notImplemented)
    }

    private func settle(requestId: String, emoji: String?, errorCode: String?) {
        guard let request = pending.removeValue(forKey: requestId) else { return }
        NotificationCenter.default.removeObserver(request.resignActiveObserver)
        if let errorCode = errorCode {
            request.completion(.failure(EmojiPickerError(code: errorCode)))
        } else {
            request.completion(.success(EmojiPickerResult(emoji: emoji)))
        }
    }

    /// Hand-rolled instead of `JSONSerialization`: `size`/`position`/`theme` are always one of a
    /// small fixed set of ASCII enum values, and `backdrop.color` is a hex string matched against
    /// a strict pattern, all validated/defaulted when the plugin call is parsed, never arbitrary
    /// user text, so plain string interpolation is safe here.
    private static func encodeOptionsJson(
        dismissOnBackdropTap: Bool,
        closeButton: EmojiCloseButtonOptions,
        backdrop: EmojiBackdropOptions,
        theme: String
    ) -> String {
        "{\"dismissOnBackdropTap\":\(dismissOnBackdropTap),"
            + "\"closeButton\":{\"size\":\"\(closeButton.size)\",\"position\":\"\(closeButton.position)\",\"hidden\":\(closeButton.hidden)},"
            + "\"backdrop\":{\"color\":\"\(backdrop.color)\",\"blur\":\(backdrop.blur)},"
            + "\"theme\":\"\(theme)\"}"
    }

    private struct PendingRequest {
        let completion: (Result<EmojiPickerResult, EmojiPickerError>) -> Void
        let resignActiveObserver: NSObjectProtocol
        var evalAcknowledged = false
    }
}
