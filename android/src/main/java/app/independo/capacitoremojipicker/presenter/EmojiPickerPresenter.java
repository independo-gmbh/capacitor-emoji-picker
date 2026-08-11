package app.independo.capacitoremojipicker.presenter;

import app.independo.capacitoremojipicker.core.EmojiPickerCallback;

/**
 * Performs the platform-specific presentation.
 *
 * Kept separate from the Capacitor bridge and service so the native picker UI (issue #4) can be
 * implemented without touching plugin wiring or the concurrency-guard logic.
 */
public interface EmojiPickerPresenter {

    /** Presents the picker for the given presentation mode and reports the outcome. */
    void present(String presentation, EmojiPickerCallback callback);
}
