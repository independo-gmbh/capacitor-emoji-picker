package app.independo.capacitoremojipicker;

import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import app.independo.capacitoremojipicker.presenter.WebFallbackEmojiPickerPresenter;

/**
 * JS-callable object registered on the Capacitor webview
 * (`webView.addJavascriptInterface(this, "CapacitorEmojiPickerAndroidBridge")`) so the web
 * bottom sheet can report its outcome back to {@link WebFallbackEmojiPickerPresenter} once it
 * settles. `@JavascriptInterface` methods run on a background thread, so this hops back to the
 * main thread before touching the presenter (which touches `Lifecycle`, a main-thread-only API).
 */
public class EmojiPickerWebBridgeInterface {

    private final WebFallbackEmojiPickerPresenter presenter;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    EmojiPickerWebBridgeInterface(WebFallbackEmojiPickerPresenter presenter) {
        this.presenter = presenter;
    }

    @JavascriptInterface
    public void onWebResult(String requestId, String emoji, String errorCode) {
        mainHandler.post(() -> presenter.onWebResult(requestId, emoji, errorCode));
    }
}
