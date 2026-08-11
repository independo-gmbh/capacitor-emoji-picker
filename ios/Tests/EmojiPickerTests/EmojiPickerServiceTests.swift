import XCTest
@testable import EmojiPicker

/// A presenter that never calls back, simulating a picker that is still active.
private final class PendingPresenter: EmojiPickerPresenter {
    var capturedCompletion: ((Result<EmojiPickerResult, EmojiPickerError>) -> Void)?

    func present(presentation: String, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        capturedCompletion = completion
    }
}

final class EmojiPickerServiceTests: XCTestCase {
    func testSecondConcurrentPresentIsRejected() {
        let presenter = PendingPresenter()
        let service = EmojiPickerService(presenter: presenter)

        service.present(presentation: "auto") { _ in }

        let expectation = expectation(description: "second present rejected")
        service.present(presentation: "auto") { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error.code, ErrorCodes.alreadyPresenting)
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 1)
    }

    func testPresentAfterCompletionIsAllowedAgain() {
        let presenter = PendingPresenter()
        let service = EmojiPickerService(presenter: presenter)

        var firstEmoji: String?
        service.present(presentation: "auto") { result in
            if case .success(let pickerResult) = result {
                firstEmoji = pickerResult.emoji
            }
        }
        presenter.capturedCompletion?(.success(EmojiPickerResult(emoji: "😀")))
        XCTAssertEqual(firstEmoji, "😀")

        let expectation = expectation(description: "second present accepted")
        service.present(presentation: "auto") { result in
            if case .failure(let error) = result {
                XCTFail("expected no synchronous rejection, got \(error.code)")
            }
            expectation.fulfill()
        }

        presenter.capturedCompletion?(.success(EmojiPickerResult(emoji: nil)))
        wait(for: [expectation], timeout: 1)
    }
}
