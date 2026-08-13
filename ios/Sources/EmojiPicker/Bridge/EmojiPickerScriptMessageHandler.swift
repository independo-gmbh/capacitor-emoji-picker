import WebKit

/// Registered on the Capacitor webview's `WKUserContentController`
/// (`userContentController.add(self, name: "capacitorEmojiPickerBridge")`) so the web bottom
/// sheet can report its outcome back to a `WebFallbackEmojiPickerPresenter` once it settles.
final class EmojiPickerScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private let presenter: WebFallbackEmojiPickerPresenter

    init(presenter: WebFallbackEmojiPickerPresenter) {
        self.presenter = presenter
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let requestId = body["requestId"] as? String else {
            return
        }
        presenter.handleBridgeMessage(requestId: requestId, emoji: body["emoji"] as? String, errorCode: body["error"] as? String)
    }
}
