package app.independo.capacitoremojipicker.core;

/** Callback used by the service/presenter layers to report a presentation outcome. */
public interface EmojiPickerCallback {

    /** Called with the selected emoji, or a result carrying a {@code null} emoji on dismissal. */
    void onResult(EmojiPickerResult result);

    /** Called with a canonical error code when the presentation could not complete. */
    void onError(String code);
}
