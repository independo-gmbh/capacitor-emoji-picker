package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import androidx.emoji2.emojipicker.EmojiPickerView;
import app.independo.capacitoremojipicker.core.EmojiBackdropOptions;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/** Shows {@link EmojiPickerView} inside a Material bottom sheet dialog. */
public class DefaultEmojiPickerDialogFactory implements EmojiPickerDialogFactory {

    @Override
    public EmojiPickerDialogHandle create(
        Activity activity,
        boolean dismissOnBackdropTap,
        EmojiBackdropOptions backdrop,
        String theme,
        Listener listener
    ) {
        BottomSheetDialog dialog = new BottomSheetDialog(activity, resolveThemeResId(theme));

        // Built from the dialog's own themed context (not `activity`) so it resolves colors
        // against whichever theme variant `resolveThemeResId` picked, rather than the host app's
        // own (potentially unrelated) theme.
        EmojiPickerView pickerView = new EmojiPickerView(dialog.getContext());
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

        // Replace the theme's default black-only dim with an arbitrary-color scrim view: `Window`
        // only exposes `setDimAmount` (alpha over black), with no color hook. `backdrop.blur` is
        // accepted for plumbing parity with web/iOS but not applied here - `RenderEffect` blurs a
        // view's own subtree, not the separate host-Activity window beneath this dialog's window,
        // so there's no API to blur what's behind it.
        dialog.getWindow().setDimAmount(0f);
        ViewGroup content = dialog.findViewById(android.R.id.content);
        if (content != null) {
            View scrim = new View(dialog.getContext());
            scrim.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            scrim.setBackgroundColor(EmojiBackdropOptions.toColorInt(backdrop.color));
            content.addView(scrim, 0);
        }

        dialog.show();

        return dialog::dismiss;
    }

    /**
     * `"light"`/`"dark"` pick Material's fixed (non-DayNight) theme variants directly, bypassing
     * {@code Configuration.uiMode} entirely - an earlier attempt forced the night-mode bit via a
     * wrapped/config-overridden {@code Context} instead, but that either broke the dialog's window
     * token (when using {@code createConfigurationContext}, causing a `BadTokenException` on
     * `show()`) or silently had no visible effect (when using a plain
     * {@code ContextThemeWrapper#applyOverrideConfiguration}). Selecting the fixed theme resource
     * directly has neither problem: `activity` is passed to `BottomSheetDialog` unmodified, and the
     * chosen theme's colors don't depend on any night-qualifier resolution at all.
     */
    private static int resolveThemeResId(String theme) {
        if ("light".equals(theme)) {
            return com.google.android.material.R.style.Theme_MaterialComponents_Light_BottomSheetDialog;
        }
        if ("dark".equals(theme)) {
            return com.google.android.material.R.style.Theme_MaterialComponents_BottomSheetDialog;
        }
        return com.google.android.material.R.style.Theme_MaterialComponents_DayNight_BottomSheetDialog;
    }
}
