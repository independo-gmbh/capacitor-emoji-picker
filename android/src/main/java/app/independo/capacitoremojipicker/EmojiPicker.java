package app.independo.capacitoremojipicker;

import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.presenter.DefaultEmojiPickerPresenter;
import app.independo.capacitoremojipicker.presenter.EmojiPickerPresenter;
import app.independo.capacitoremojipicker.service.EmojiPickerService;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Capacitor bridge for the EmojiPicker plugin. */
@CapacitorPlugin(name = "EmojiPicker")
public class EmojiPicker extends Plugin {

    /** Service layer that owns presentation flow and concurrency guarding. */
    private EmojiPickerService service;

    @Override
    public void load() {
        super.load();
        EmojiPickerPresenter presenter = new DefaultEmojiPickerPresenter();
        service = new EmojiPickerService(presenter);
    }

    /** Presents the emoji picker. */
    @PluginMethod
    public void present(PluginCall call) {
        String presentation = call.getString("presentation", "auto");
        service.present(
            presentation,
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
