import Foundation
import Capacitor

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

    /// Initializes dependencies after the plugin loads.
    public override func load() {
        super.load()
        service = EmojiPickerService(presenter: DefaultEmojiPickerPresenter())
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

        let presentation = call.getString("presentation") ?? "auto"
        service.present(presentation: presentation) { result in
            switch result {
            case .success(let pickerResult):
                call.resolve(["emoji": pickerResult.emoji as Any])
            case .failure(let error):
                call.reject(error.code, error.code)
            }
        }
    }
}
