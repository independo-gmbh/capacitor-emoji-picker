package app.independo.capacitoremojipicker.presenter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class WebFallbackEmojiPickerPresenterTest {

    /** Captures every script evaluated instead of touching a real WebView. */
    private static class FakeJsEvaluator implements WebFallbackEmojiPickerPresenter.JsEvaluator {
        final List<String> evaluated = new ArrayList<>();
        final List<Runnable> onEvaluatedCallbacks = new ArrayList<>();

        @Override
        public void eval(String js, Runnable onEvaluated) {
            evaluated.add(js);
            onEvaluatedCallbacks.add(onEvaluated);
        }

        /** Simulates the script at the given index having started executing in the webview. */
        void fireEvalCompleted(int index) {
            onEvaluatedCallbacks.get(index).run();
        }
    }

    /** Runs/cancels "delayed" work synchronously on demand instead of touching a real Handler. */
    private static class FakeScheduler implements WebFallbackEmojiPickerPresenter.Scheduler {
        Runnable scheduled;
        boolean cancelled;

        @Override
        public void postDelayed(Runnable runnable, long delayMillis) {
            scheduled = runnable;
        }

        @Override
        public void cancel(Runnable runnable) {
            if (runnable == scheduled) {
                cancelled = true;
            }
        }

        /** Mirrors real {@code Handler} semantics: a cancelled runnable never fires. */
        void fireTimeout() {
            if (!cancelled) {
                scheduled.run();
            }
        }
    }

    /** A minimal {@link Lifecycle} that just captures the observer instead of touching a real one. */
    private static class FakeLifecycle extends Lifecycle {
        LifecycleObserver observer;

        @Override
        public void addObserver(LifecycleObserver observer) {
            this.observer = observer;
        }

        @Override
        public void removeObserver(LifecycleObserver observer) {
            if (observer == this.observer) {
                this.observer = null;
            }
        }

        @Override
        public State getCurrentState() {
            return State.RESUMED;
        }

        void firePause(LifecycleOwner owner) {
            ((DefaultLifecycleObserver) observer).onPause(owner);
        }

        void fireDestroy(LifecycleOwner owner) {
            ((DefaultLifecycleObserver) observer).onDestroy(owner);
        }
    }

    /** A fake {@code Activity} that is also a {@link LifecycleOwner}, driven manually by tests. */
    private static class FakeLifecycleOwnerActivity extends Activity implements LifecycleOwner {
        private final FakeLifecycle lifecycle = new FakeLifecycle();

        @Override
        public Lifecycle getLifecycle() {
            return lifecycle;
        }
    }

    private static class CapturingCallback implements EmojiPickerCallback {
        EmojiPickerResult result;
        String errorCode;
        int callCount;

        @Override
        public void onResult(EmojiPickerResult result) {
            this.result = result;
            callCount++;
        }

        @Override
        public void onError(String code) {
            this.errorCode = code;
            callCount++;
        }
    }

    private static final EmojiCloseButtonOptions CLOSE_BUTTON = new EmojiCloseButtonOptions("medium", "right", false);

    @Test
    public void evaluatesJsWithEncodedOptions() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());

        presenter.present("web", true, CLOSE_BUTTON, new CapturingCallback());

        assertEquals(1, evaluator.evaluated.size());
        String js = evaluator.evaluated.get(0);
        assertTrue(js.contains("window.__CapacitorEmojiPickerPresentWeb("));
        assertTrue(js.contains("\"dismissOnBackdropTap\":true"));
        assertTrue(js.contains("\"size\":\"medium\""));
        assertTrue(js.contains("\"position\":\"right\""));
        assertTrue(js.contains("\"hidden\":false"));
    }

    @Test
    public void onWebResultResolvesTheMatchingPendingCallback() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, "😀", null);

        assertEquals(1, callback.callCount);
        assertEquals("😀", callback.result.getEmoji());
    }

    @Test
    public void onWebResultWithErrorCodeReportsError() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, null, ErrorCodes.NOT_IMPLEMENTED);

        assertEquals(ErrorCodes.NOT_IMPLEMENTED, callback.errorCode);
    }

    @Test
    public void unmatchedRequestIdIsIgnored() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        presenter.onWebResult("some-other-request-id", "😀", null);

        assertEquals(0, callback.callCount);
    }

    @Test
    public void resultAfterTimeoutIsIgnored() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        // A genuine timeout (eval-completion callback never fired) is a bridge-liveness failure:
        // it defensively evaluates the JS dismiss call but settles as an error, not a success.
        scheduler.fireTimeout();
        assertEquals(1, callback.callCount);
        assertEquals(ErrorCodes.NOT_IMPLEMENTED, callback.errorCode);
        assertTrue(evaluator.evaluated.get(1).contains("__CapacitorEmojiPickerDismissWeb"));

        callback.callCount = 0;
        presenter.onWebResult(requestId, "😀", null);
        assertEquals(0, callback.callCount);
    }

    @Test
    public void evalCompletionCancelsTheTimeoutWithoutSettling() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);

        evaluator.fireEvalCompleted(0);

        assertTrue(scheduler.cancelled);
        assertEquals(0, callback.callCount);

        // Even though the timeout would have fired by now in the old behavior, it must not -
        // simulating "the user took longer than the timeout to pick".
        scheduler.fireTimeout();
        assertEquals(0, callback.callCount);
    }

    @Test
    public void resultStillResolvesAfterEvalCompletionCancelsTheTimeout() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        evaluator.fireEvalCompleted(0);
        scheduler.fireTimeout();
        assertEquals(0, callback.callCount);

        presenter.onWebResult(requestId, "😀", null);

        assertEquals(1, callback.callCount);
        assertEquals("😀", callback.result.getEmoji());
    }

    @Test
    public void successfulResultCancelsTheTimeout() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, "😀", null);

        assertTrue(scheduler.cancelled);
    }

    @Test
    public void dismissEvaluatesDismissJsAndSettlesNull() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.dismiss(requestId);

        assertTrue(evaluator.evaluated.get(1).contains("__CapacitorEmojiPickerDismissWeb"));
        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
    }

    @Test
    public void onPauseDismissesAPendingRequest() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeLifecycleOwnerActivity activity = new FakeLifecycleOwnerActivity();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> activity, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        ((FakeLifecycle) activity.getLifecycle()).firePause(activity);

        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
        assertTrue(evaluator.evaluated.get(1).contains("__CapacitorEmojiPickerDismissWeb"));
    }

    @Test
    public void onDestroyDismissesAPendingRequest() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeLifecycleOwnerActivity activity = new FakeLifecycleOwnerActivity();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> activity, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        ((FakeLifecycle) activity.getLifecycle()).fireDestroy(activity);

        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
        assertTrue(evaluator.evaluated.get(1).contains("__CapacitorEmojiPickerDismissWeb"));
    }
}
