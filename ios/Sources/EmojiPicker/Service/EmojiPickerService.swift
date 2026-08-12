import Foundation

/// Orchestrates presenter calls and guards against overlapping presentations.
final class EmojiPickerService {
    private let presenter: EmojiPickerPresenter
    private var isPresenting = false

    init(presenter: EmojiPickerPresenter) {
        self.presenter = presenter
    }

    /// Presents the picker, rejecting a second concurrent call instead of overlapping pickers.
    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        if isPresenting {
            completion(.failure(EmojiPickerError(code: ErrorCodes.alreadyPresenting)))
            return
        }

        isPresenting = true
        presenter.present(options: options) { [weak self] result in
            self?.isPresenting = false
            completion(result)
        }
    }
}
