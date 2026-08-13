import XCTest
@testable import EmojiPicker

private let closeButton = EmojiCloseButtonOptions(size: "medium", position: "right", hidden: false)

private final class RecordingPresenter: EmojiPickerPresenter {
    var lastPresentation: String?
    var callCount = 0

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        lastPresentation = options.presentation
        callCount += 1
        completion(.success(EmojiPickerResult(emoji: nil)))
    }
}

final class DispatchingEmojiPickerPresenterTests: XCTestCase {
    func testRoutesAutoToTheNativePresenter() {
        let nativePresenter = RecordingPresenter()
        let webFallbackPresenter = RecordingPresenter()
        let dispatcher = DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)

        let options = EmojiPickerPresentOptions(presentation: "auto", closeButton: closeButton, dismissOnBackdropTap: true)
        dispatcher.present(options: options) { _ in }

        XCTAssertEqual(nativePresenter.callCount, 1)
        XCTAssertEqual(webFallbackPresenter.callCount, 0)
    }

    func testRoutesWebToTheWebFallbackPresenter() {
        let nativePresenter = RecordingPresenter()
        let webFallbackPresenter = RecordingPresenter()
        let dispatcher = DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)

        let options = EmojiPickerPresentOptions(presentation: "web", closeButton: closeButton, dismissOnBackdropTap: true)
        dispatcher.present(options: options) { _ in }

        XCTAssertEqual(nativePresenter.callCount, 0)
        XCTAssertEqual(webFallbackPresenter.callCount, 1)
    }
}
