package app.independo.capacitoremojipicker.service;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import app.independo.capacitoremojipicker.presenter.EmojiPickerPresenter;

/** Orchestrates presenter calls and guards against overlapping presentations. */
public class EmojiPickerService {

    private final EmojiPickerPresenter presenter;
    private volatile boolean isPresenting = false;

    public EmojiPickerService(EmojiPickerPresenter presenter) {
        this.presenter = presenter;
    }

    /** Presents the picker, rejecting a second concurrent call instead of overlapping pickers. */
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
        if (isPresenting) {
            callback.onError(ErrorCodes.ALREADY_PRESENTING);
            return;
        }

        isPresenting = true;
        presenter.present(
            presentation,
            dismissOnBackdropTap,
            closeButton,
            new EmojiPickerCallback() {
                @Override
                public void onResult(EmojiPickerResult result) {
                    isPresenting = false;
                    callback.onResult(result);
                }

                @Override
                public void onError(String code) {
                    isPresenting = false;
                    callback.onError(code);
                }
            }
        );
    }
}
