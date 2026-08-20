package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import app.independo.capacitoremojipicker.core.EmojiBackdropOptions;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Presents the web bottom sheet inside the app's own Capacitor webview by evaluating JS there
 * (registered by {@code registerNativeWebBridge()} in the JS layer), and resolves once that JS
 * reports back via {@link #onWebResult}. Kept independent of any real {@code Bridge}/{@code
 * WebView} type so it stays unit-testable without the Android Gradle Plugin's mockable
 * {@code android.jar}: production wiring in {@code EmojiPicker#load()} supplies a {@link
 * JsEvaluator} backed by {@code Bridge#eval} and an {@link ActivityProvider}; tests supply fakes.
 */
public class WebFallbackEmojiPickerPresenter implements EmojiPickerPresenter {

    /**
     * Evaluates JS in the app's webview. Abstracts away the real Capacitor {@code Bridge}.
     * {@code onEvaluated} fires once the script has at least started executing (i.e. the
     * bridge/webview is alive) - it is a liveness signal, not a signal that the picker has
     * settled.
     */
    public interface JsEvaluator {
        void eval(String js, Runnable onEvaluated);
    }

    /** Supplies the current hosting Activity; returns null if none is available. */
    public interface ActivityProvider {
        Activity get();
    }

    /** Posts/cancels delayed work. Abstracts away {@code Handler} for tests. */
    interface Scheduler {
        void postDelayed(Runnable runnable, long delayMillis);
        void cancel(Runnable runnable);
    }

    /**
     * Hops onto the UI thread to run {@code work}. Abstracts away {@code Activity#runOnUiThread}
     * (a {@code final} method, so it can't be overridden by a test fake {@code Activity} subclass)
     * for tests.
     */
    interface UiThreadDispatcher {
        void runOnUiThread(Activity activity, Runnable work);
    }

    /** How long to wait for the JS side to report back before giving up. */
    static final long TIMEOUT_MILLIS = 3000;

    private final JsEvaluator jsEvaluator;
    private final ActivityProvider activityProvider;
    private final Scheduler scheduler;
    private final UiThreadDispatcher uiThreadDispatcher;
    private final Map<String, PendingRequest> pending = new HashMap<>();

    public WebFallbackEmojiPickerPresenter(JsEvaluator jsEvaluator, ActivityProvider activityProvider) {
        this(jsEvaluator, activityProvider, defaultScheduler(), defaultUiThreadDispatcher());
    }

    /** Package-private: lets tests inject a fake {@link Scheduler} and {@link UiThreadDispatcher}. */
    WebFallbackEmojiPickerPresenter(
        JsEvaluator jsEvaluator,
        ActivityProvider activityProvider,
        Scheduler scheduler,
        UiThreadDispatcher uiThreadDispatcher
    ) {
        this.jsEvaluator = jsEvaluator;
        this.activityProvider = activityProvider;
        this.scheduler = scheduler;
        this.uiThreadDispatcher = uiThreadDispatcher;
    }

    private static Scheduler defaultScheduler() {
        Handler handler = new Handler(Looper.getMainLooper());
        return new Scheduler() {
            @Override
            public void postDelayed(Runnable runnable, long delayMillis) {
                handler.postDelayed(runnable, delayMillis);
            }

            @Override
            public void cancel(Runnable runnable) {
                handler.removeCallbacks(runnable);
            }
        };
    }

    // Capacitor invokes @PluginMethod handlers on a background "CapacitorPlugins" thread, but
    // Lifecycle#addObserver() is a UI-thread-only API (mirrors the same hop
    // NativeEmojiPickerPresenter already does for its own UI-thread-only calls). Hop onto the UI
    // thread whenever we have a real Activity to hop through; a null Activity means there's no UI
    // to touch, so run synchronously (no Lifecycle to register against either way).
    private static UiThreadDispatcher defaultUiThreadDispatcher() {
        return (activity, work) -> {
            if (activity != null) {
                activity.runOnUiThread(work);
            } else {
                work.run();
            }
        };
    }

    @Override
    public void present(
        String presentation,
        boolean dismissOnBackdropTap,
        EmojiCloseButtonOptions closeButton,
        EmojiBackdropOptions backdrop,
        String theme,
        EmojiPickerCallback callback
    ) {
        Activity activity = activityProvider.get();
        uiThreadDispatcher.runOnUiThread(
            activity,
            () -> presentOnUiThread(activity, dismissOnBackdropTap, closeButton, backdrop, theme, callback)
        );
    }

    private void presentOnUiThread(
        Activity activity,
        boolean dismissOnBackdropTap,
        EmojiCloseButtonOptions closeButton,
        EmojiBackdropOptions backdrop,
        String theme,
        EmojiPickerCallback callback
    ) {
        String requestId = UUID.randomUUID().toString();

        // Genuine timeout - i.e. the eval-completion callback below never fired at all (extremely
        // rare: webview torn down mid-call, etc). This means the JS side never even started
        // processing the request, so it's a bridge-liveness failure, not a user dismissal:
        // defensively tell the JS side to close (in case the bridge partially works), but settle
        // as an error rather than reusing dismiss()'s success/null semantics.
        Runnable timeoutRunnable = () -> {
            jsEvaluator.eval("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('" + requestId + "')", () -> {});
            settle(requestId, null, ErrorCodes.NOT_IMPLEMENTED);
        };

        DefaultLifecycleObserver lifecycleObserver = null;
        LifecycleOwner lifecycleOwner = null;
        if (activity instanceof LifecycleOwner) {
            lifecycleOwner = (LifecycleOwner) activity;
            lifecycleObserver = new DefaultLifecycleObserver() {
                @Override
                public void onPause(LifecycleOwner owner) {
                    dismiss(requestId);
                }

                @Override
                public void onDestroy(LifecycleOwner owner) {
                    dismiss(requestId);
                }
            };
            lifecycleOwner.getLifecycle().addObserver(lifecycleObserver);
        }

        pending.put(requestId, new PendingRequest(callback, timeoutRunnable, lifecycleObserver, lifecycleOwner));
        scheduler.postDelayed(timeoutRunnable, TIMEOUT_MILLIS);

        // The eval "completion" here only means the script at least started executing (i.e. the
        // bridge/webview is alive) - it cancels the timeout WITHOUT settling the request, which
        // stays pending for the real result reported later via onWebResult.
        jsEvaluator.eval(
            "window.__CapacitorEmojiPickerPresentWeb('" + requestId + "', '"
                + encodeOptionsBase64Free(dismissOnBackdropTap, closeButton, backdrop, theme) + "')",
            () -> scheduler.cancel(timeoutRunnable)
        );
    }

    /** Called by the JS-interface bridge object once the JS sheet settles. */
    public void onWebResult(String requestId, String emoji, String errorCode) {
        settle(requestId, emoji, errorCode);
    }

    /** Force-dismisses a still-pending presentation (e.g. on Activity destruction/backgrounding). */
    public void dismiss(String requestId) {
        jsEvaluator.eval("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('" + requestId + "')", () -> {});
        settle(requestId, null, null);
    }

    private void settle(String requestId, String emoji, String errorCode) {
        PendingRequest request = pending.remove(requestId);
        if (request == null) {
            return;
        }
        scheduler.cancel(request.timeoutRunnable);
        if (request.lifecycleObserver != null && request.lifecycleOwner != null) {
            request.lifecycleOwner.getLifecycle().removeObserver(request.lifecycleObserver);
        }
        if (errorCode != null) {
            request.callback.onError(errorCode);
        } else {
            request.callback.onResult(new EmojiPickerResult(emoji));
        }
    }

    /**
     * Hand-rolled instead of a JSON library: `size`/`position`/`theme` are always one of a small
     * fixed set of ASCII enum values, and `backdrop.color` is a hex string matched against a
     * strict pattern, all validated/defaulted in {@code EmojiPicker#present}, never arbitrary
     * user text, so plain string interpolation is safe here. This also sidesteps
     * `org.json`/`android.util.Base64` throwing under the mockable `android.jar` in plain JUnit
     * unit tests (see the plan's Global Constraints).
     */
    private static String encodeOptionsBase64Free(
        boolean dismissOnBackdropTap,
        EmojiCloseButtonOptions closeButton,
        EmojiBackdropOptions backdrop,
        String theme
    ) {
        return "{"
            + "\"dismissOnBackdropTap\":" + dismissOnBackdropTap + ","
            + "\"closeButton\":{"
            + "\"size\":\"" + closeButton.size + "\","
            + "\"position\":\"" + closeButton.position + "\","
            + "\"hidden\":" + closeButton.hidden
            + "},"
            + "\"backdrop\":{"
            + "\"color\":\"" + backdrop.color + "\","
            + "\"blur\":" + backdrop.blur
            + "},"
            + "\"theme\":\"" + theme + "\""
            + "}";
    }

    private static final class PendingRequest {
        final EmojiPickerCallback callback;
        final Runnable timeoutRunnable;
        final DefaultLifecycleObserver lifecycleObserver;
        final LifecycleOwner lifecycleOwner;

        PendingRequest(
            EmojiPickerCallback callback,
            Runnable timeoutRunnable,
            DefaultLifecycleObserver lifecycleObserver,
            LifecycleOwner lifecycleOwner
        ) {
            this.callback = callback;
            this.timeoutRunnable = timeoutRunnable;
            this.lifecycleObserver = lifecycleObserver;
            this.lifecycleOwner = lifecycleOwner;
        }
    }
}
