package app.independo.capacitoremojipicker;

import android.webkit.ValueCallback;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.presenter.DefaultEmojiPickerDialogFactory;
import app.independo.capacitoremojipicker.presenter.DispatchingEmojiPickerPresenter;
import app.independo.capacitoremojipicker.presenter.EmojiPickerPresenter;
import app.independo.capacitoremojipicker.presenter.NativeEmojiPickerPresenter;
import app.independo.capacitoremojipicker.presenter.WebFallbackEmojiPickerPresenter;
import app.independo.capacitoremojipicker.service.EmojiPickerService;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Capacitor bridge for the EmojiPicker plugin. */
@CapacitorPlugin(name = "EmojiPicker")
public class EmojiPicker extends Plugin {

    private static final Set<String> VALID_CLOSE_BUTTON_SIZES =
        new HashSet<>(Arrays.asList("xSmall", "small", "medium", "large"));
    private static final Set<String> VALID_CLOSE_BUTTON_POSITIONS =
        new HashSet<>(Arrays.asList("left", "center", "right"));
    private static final Set<String> VALID_THEMES = new HashSet<>(Arrays.asList("system", "light", "dark"));

    /** Service layer that owns presentation flow and concurrency guarding. */
    private EmojiPickerService service;

    @Override
    public void load() {
        super.load();
        EmojiPickerPresenter nativePresenter =
            new NativeEmojiPickerPresenter(this::getActivity, new DefaultEmojiPickerDialogFactory());
        WebFallbackEmojiPickerPresenter webFallbackPresenter = new WebFallbackEmojiPickerPresenter(
            (js, onEvaluated) -> getBridge().eval(js, (ValueCallback<String>) value -> onEvaluated.run()),
            this::getActivity
        );
        getBridge().getWebView().addJavascriptInterface(
            new EmojiPickerWebBridgeInterface(webFallbackPresenter),
            "CapacitorEmojiPickerAndroidBridge"
        );
        service = new EmojiPickerService(new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter));
    }

    /** Presents the emoji picker. */
    @PluginMethod
    public void present(PluginCall call) {
        String presentation = call.getString("presentation", "auto");
        boolean dismissOnBackdropTap = call.getBoolean("dismissOnBackdropTap", true);
        JSObject closeButtonObject = call.getObject("closeButton");
        String size = closeButtonObject != null ? closeButtonObject.getString("size", "medium") : "medium";
        String position = closeButtonObject != null ? closeButtonObject.getString("position", "right") : "right";
        EmojiCloseButtonOptions closeButton = new EmojiCloseButtonOptions(
            VALID_CLOSE_BUTTON_SIZES.contains(size) ? size : "medium",
            VALID_CLOSE_BUTTON_POSITIONS.contains(position) ? position : "right",
            closeButtonObject != null && closeButtonObject.optBoolean("hidden", false)
        );
        String theme = call.getString("theme", "system");
        service.present(
            presentation,
            dismissOnBackdropTap,
            closeButton,
            VALID_THEMES.contains(theme) ? theme : "system",
            new EmojiPickerCallback() {
                @Override
                public void onResult(EmojiPickerResult result) {
                    JSObject ret = new JSObject();
                    ret.put("emoji", result.getEmoji());
                    call.resolve(ret);
                }

                @Override
                public void onError(String code) {
                    call.reject(code, code);
                }
            }
        );
    }
}
