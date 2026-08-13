package app.independo.capacitoremojipicker.presenter;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;

/**
 * Picks between the native and web-fallback presenters by {@code presentation}, so {@code
 * EmojiPickerService}'s single concurrency guard covers both paths uniformly - from its point of
 * view this is just another {@link EmojiPickerPresenter}.
 */
public class DispatchingEmojiPickerPresenter implements EmojiPickerPresenter {

    private final EmojiPickerPresenter nativePresenter;
    private final EmojiPickerPresenter webFallbackPresenter;

    public DispatchingEmojiPickerPresenter(EmojiPickerPresenter nativePresenter, EmojiPickerPresenter webFallbackPresenter) {
        this.nativePresenter = nativePresenter;
        this.webFallbackPresenter = webFallbackPresenter;
    }

    @Override
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
        EmojiPickerPresenter target = "web".equals(presentation) ? webFallbackPresenter : nativePresenter;
        target.present(presentation, dismissOnBackdropTap, closeButton, callback);
    }
}
