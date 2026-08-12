package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import android.view.ViewGroup;
import androidx.emoji2.emojipicker.EmojiPickerView;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/** Shows {@link EmojiPickerView} inside a Material bottom sheet dialog. */
public class DefaultEmojiPickerDialogFactory implements EmojiPickerDialogFactory {

    @Override
    public EmojiPickerDialogHandle create(Activity activity, boolean dismissOnBackdropTap, Listener listener) {
        BottomSheetDialog dialog = new BottomSheetDialog(
            activity,
            com.google.android.material.R.style.Theme_MaterialComponents_DayNight_BottomSheetDialog
        );

        EmojiPickerView pickerView = new EmojiPickerView(activity);
        pickerView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        pickerView.setOnEmojiPickedListener(emojiViewItem -> {
            listener.onEmojiSelected(emojiViewItem.getEmoji());
            dialog.dismiss();
        });

        dialog.setContentView(pickerView);
        dialog.setCanceledOnTouchOutside(dismissOnBackdropTap);
        dialog.setOnDismissListener(d -> listener.onDismissed());
        dialog.show();

        return dialog::dismiss;
    }
}
