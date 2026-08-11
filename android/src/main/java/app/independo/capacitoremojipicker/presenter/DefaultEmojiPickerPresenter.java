package app.independo.capacitoremojipicker.presenter;

import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.ErrorCodes;

/** Placeholder presenter until the native AndroidX emoji picker UI is implemented (issue #4). */
public class DefaultEmojiPickerPresenter implements EmojiPickerPresenter {

    @Override
    public void present(String presentation, EmojiPickerCallback callback) {
        callback.onError(ErrorCodes.NOT_IMPLEMENTED);
    }
}
