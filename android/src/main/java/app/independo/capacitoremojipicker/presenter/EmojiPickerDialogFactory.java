package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;

/**
 * Builds the native picker UI.
 *
 * Isolates dialog construction from {@link NativeEmojiPickerPresenter} so the presenter's
 * settle-once/reentry logic can be unit-tested with a fake, without a real {@code BottomSheetDialog}.
 */
public interface EmojiPickerDialogFactory {

    /** Creates and shows the dialog for the given activity, reporting outcomes via {@code listener}. */
    EmojiPickerDialogHandle create(Activity activity, boolean dismissOnBackdropTap, String theme, Listener listener);

    /** Callback used by the factory's dialog implementation to report selection/dismissal. */
    interface Listener {
        void onEmojiSelected(String emoji);
        void onDismissed();
    }

    /** Handle allowing the presenter to dismiss a previously-shown dialog defensively. */
    interface EmojiPickerDialogHandle {
        void dismiss();
    }
}
