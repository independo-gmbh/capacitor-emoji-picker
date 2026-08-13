import Foundation
import Capacitor
import WebKit

/// Capacitor bridge for the EmojiPicker plugin.
@objc(EmojiPicker)
public class EmojiPicker: CAPPlugin, CAPBridgedPlugin {
    /// Plugin identifier used by Capacitor.
    public let identifier = "EmojiPicker"
    /// JavaScript name used for the plugin proxy.
    public let jsName = "EmojiPicker"
    /// Supported plugin methods exposed to the JS layer.
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    /// Service layer that owns presentation flow and concurrency guarding.
    private var service: EmojiPickerService?
    /// Retained so it isn't deallocated out from under the `WKUserContentController`.
    private var scriptMessageHandler: EmojiPickerScriptMessageHandler?

    private static let validCloseButtonSizes: Set<String> = ["xSmall", "small", "medium", "large"]
    private static let validCloseButtonPositions: Set<String> = ["left", "center", "right"]

    /// Initializes dependencies after the plugin loads.
    public override func load() {
        super.load()
        let nativePresenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { [weak self] in self?.bridge?.viewController },
            factory: DefaultEmojiKeyboardPresentationFactory()
        )
        let webFallbackPresenter = WebFallbackEmojiPickerPresenter(jsEvaluator: { [weak self] js, completion in
            self?.bridge?.webView?.evaluateJavaScript(js) { _, _ in completion() }
        })
        let handler = EmojiPickerScriptMessageHandler(presenter: webFallbackPresenter)
        scriptMessageHandler = handler
        // Safe no-op if none was registered yet; guards against an ObjC exception ("handler with
        // name already exists") if load() ever ran more than once per plugin instance.
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "capacitorEmojiPickerBridge")
        bridge?.webView?.configuration.userContentController.add(handler, name: "capacitorEmojiPickerBridge")

        service = EmojiPickerService(
            presenter: DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)
        )
    }

    func configureForTesting(service: EmojiPickerService?) {
        self.service = service
    }

    /// Presents the emoji picker.
    @objc func present(_ call: CAPPluginCall) {
        guard let service = service else {
            call.reject(ErrorCodes.notImplemented, ErrorCodes.notImplemented)
            return
        }

        let closeButtonObject = call.getObject("closeButton")
        let size = closeButtonObject?["size"] as? String ?? "medium"
        let position = closeButtonObject?["position"] as? String ?? "right"
        let options = EmojiPickerPresentOptions(
            presentation: call.getString("presentation") ?? "auto",
            closeButton: EmojiCloseButtonOptions(
                size: Self.validCloseButtonSizes.contains(size) ? size : "medium",
                position: Self.validCloseButtonPositions.contains(position) ? position : "right",
                hidden: closeButtonObject?["hidden"] as? Bool ?? false
            ),
            dismissOnBackdropTap: call.getBool("dismissOnBackdropTap") ?? true
        )
        service.present(options: options) { result in
            switch result {
            case .success(let pickerResult):
                call.resolve(["emoji": pickerResult.emoji as Any])
            case .failure(let error):
                call.reject(error.code, error.code)
            }
        }
    }
}
