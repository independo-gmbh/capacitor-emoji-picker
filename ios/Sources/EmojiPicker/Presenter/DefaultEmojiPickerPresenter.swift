import Foundation

/// Placeholder presenter until the system emoji keyboard presentation is implemented (issue #5).
final class DefaultEmojiPickerPresenter: EmojiPickerPresenter {
    func present(presentation: String, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        completion(.failure(EmojiPickerError(code: ErrorCodes.notImplemented)))
    }
}
