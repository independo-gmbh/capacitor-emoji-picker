import Foundation

/// Picks between the native and web-fallback presenters by `options.presentation`, so
/// `EmojiPickerService`'s single concurrency guard covers both paths uniformly - from its point
/// of view this is just another `EmojiPickerPresenter`.
final class DispatchingEmojiPickerPresenter: EmojiPickerPresenter {
    private let nativePresenter: EmojiPickerPresenter
    private let webFallbackPresenter: EmojiPickerPresenter

    init(nativePresenter: EmojiPickerPresenter, webFallbackPresenter: EmojiPickerPresenter) {
        self.nativePresenter = nativePresenter
        self.webFallbackPresenter = webFallbackPresenter
    }

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        let target = options.presentation == "web" ? webFallbackPresenter : nativePresenter
        target.present(options: options, completion: completion)
    }
}
