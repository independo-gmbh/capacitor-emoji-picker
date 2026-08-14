import UIKit
import XCTest
@testable import EmojiPicker

private let closeButton = EmojiCloseButtonOptions(size: "medium", position: "right", hidden: false)
private let webOptions = EmojiPickerPresentOptions(presentation: "web", closeButton: closeButton, dismissOnBackdropTap: true, theme: "system")

/// Captures every script evaluated instead of touching a real `WKWebView`.
private final class FakeJsEvaluator {
    var evaluated: [String] = []
    var completions: [() -> Void] = []

    func eval(_ js: String, _ completion: @escaping () -> Void) {
        evaluated.append(js)
        completions.append(completion)
    }

    /// Simulates the script at the given index having started executing in the webview.
    func fireEvalCompleted(_ index: Int) {
        completions[index]()
    }
}

/// Captures scheduled work so tests can fire it (or not) on demand instead of waiting real time.
private final class FakeScheduler {
    var scheduledWork: (() -> Void)?

    func schedule(_ delay: TimeInterval, _ work: @escaping () -> Void) {
        scheduledWork = work
    }

    func fire() {
        scheduledWork?()
    }
}

/// Extracts the `requestId` this presenter generated from the evaluated JS string, e.g.
/// `"window.__CapacitorEmojiPickerPresentWeb('<id>', '...')"`.
private func requestId(from js: String) -> String {
    let afterOpenParen = js.components(separatedBy: "('")[1]
    return String(afterOpenParen.prefix(while: { $0 != "'" }))
}

private extension XCTestCase {
    /// `WebFallbackEmojiPickerPresenter.present` hops to the main thread via `DispatchQueue.main.async`
    /// before doing any work (evaluating JS, scheduling the timeout, registering observers) - tests
    /// run on the main thread already, so that hop defers to the next run-loop turn. This flushes it.
    func flushMainQueue() {
        let expectation = expectation(description: "main queue flush")
        DispatchQueue.main.async { expectation.fulfill() }
        wait(for: [expectation], timeout: 1)
    }
}

final class WebFallbackEmojiPickerPresenterTests: XCTestCase {
    func testEvaluatesJsWithEncodedOptions() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        presenter.present(options: webOptions) { _ in }
        flushMainQueue()

        XCTAssertEqual(evaluator.evaluated.count, 1)
        let js = evaluator.evaluated[0]
        XCTAssertTrue(js.contains("window.__CapacitorEmojiPickerPresentWeb("))
        XCTAssertTrue(js.contains("\"dismissOnBackdropTap\":true"))
        XCTAssertTrue(js.contains("\"size\":\"medium\""))
        XCTAssertTrue(js.contains("\"position\":\"right\""))
        XCTAssertTrue(js.contains("\"hidden\":false"))
        XCTAssertTrue(js.contains("\"theme\":\"system\""))
    }

    func testEvaluatesJsWithTheForcedTheme() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)
        let darkOptions = EmojiPickerPresentOptions(presentation: "web", closeButton: closeButton, dismissOnBackdropTap: true, theme: "dark")

        presenter.present(options: darkOptions) { _ in }
        flushMainQueue()

        XCTAssertTrue(evaluator.evaluated[0].contains("\"theme\":\"dark\""))
    }

    func testHandleBridgeMessageResolvesTheMatchingPendingCompletion() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "resolved")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertEqual(pickerResult.emoji, "😀")
                expectation.fulfill()
            }
        }
        flushMainQueue()

        let id = requestId(from: evaluator.evaluated[0])
        presenter.handleBridgeMessage(requestId: id, emoji: "😀", errorCode: nil)

        wait(for: [expectation], timeout: 1)
    }

    func testHandleBridgeMessageWithErrorCodeReportsError() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "rejected")
        presenter.present(options: webOptions) { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error.code, ErrorCodes.notImplemented)
                expectation.fulfill()
            }
        }
        flushMainQueue()

        let id = requestId(from: evaluator.evaluated[0])
        presenter.handleBridgeMessage(requestId: id, emoji: nil, errorCode: ErrorCodes.notImplemented)

        wait(for: [expectation], timeout: 1)
    }

    func testUnmatchedRequestIdIsIgnored() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        presenter.present(options: webOptions) { _ in
            XCTFail("should not be called for an unrelated request id")
        }
        flushMainQueue()

        presenter.handleBridgeMessage(requestId: "some-other-request-id", emoji: "😀", errorCode: nil)
    }

    func testGenuineTimeoutDefensivelyDismisses() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "timed out")
        presenter.present(options: webOptions) { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error.code, ErrorCodes.notImplemented)
                expectation.fulfill()
            }
        }
        flushMainQueue()

        // The eval-completion callback never fires - simulating a genuine bridge-liveness failure
        // (e.g. webview torn down mid-call). This must defensively evaluate the JS dismiss call,
        // then settle as an error rather than a success/null dismiss.
        scheduler.fire()

        XCTAssertTrue(evaluator.evaluated[1].contains("__CapacitorEmojiPickerDismissWeb"))
        wait(for: [expectation], timeout: 1)
    }

    func testEvalCompletionCancelsTheTimeoutWithoutSettling() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        presenter.present(options: webOptions) { _ in
            XCTFail("should not settle just because eval completed or the timeout later fires")
        }
        flushMainQueue()

        evaluator.fireEvalCompleted(0)

        // Even though the timeout would have fired by now in the old behavior, it must not -
        // simulating "the user took longer than the timeout to pick".
        scheduler.fire()
    }

    func testResultStillResolvesAfterEvalCompletionCancelsTheTimeout() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "resolved after timeout would have fired")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertEqual(pickerResult.emoji, "😀")
                expectation.fulfill()
            }
        }
        flushMainQueue()

        let id = requestId(from: evaluator.evaluated[0])
        evaluator.fireEvalCompleted(0)
        scheduler.fire()

        presenter.handleBridgeMessage(requestId: id, emoji: "😀", errorCode: nil)

        wait(for: [expectation], timeout: 1)
    }

    func testDismissEvaluatesDismissJsAndSettlesNil() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "dismissed")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertNil(pickerResult.emoji)
                expectation.fulfill()
            }
        }
        flushMainQueue()

        let id = requestId(from: evaluator.evaluated[0])
        presenter.dismiss(requestId: id)

        XCTAssertTrue(evaluator.evaluated[1].contains("__CapacitorEmojiPickerDismissWeb"))
        wait(for: [expectation], timeout: 1)
    }

    func testAppBackgroundingDismissesAPendingPresentation() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "dismissed on backgrounding")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertNil(pickerResult.emoji)
                expectation.fulfill()
            }
        }
        flushMainQueue()

        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)

        wait(for: [expectation], timeout: 1)
        XCTAssertTrue(evaluator.evaluated[1].contains("__CapacitorEmojiPickerDismissWeb"))
    }
}
