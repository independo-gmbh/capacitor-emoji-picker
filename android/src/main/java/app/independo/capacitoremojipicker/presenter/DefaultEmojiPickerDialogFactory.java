package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import androidx.emoji2.emojipicker.EmojiPickerView;
import androidx.recyclerview.widget.RecyclerView;
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

        // `BottomSheetBehavior` coordinates with exactly one nested-scrolling child, the first one it
        // finds depth-first on each layout. `EmojiPickerView` puts its horizontal category header
        // `RecyclerView` before the vertical emoji grid, so without this the behavior binds the header
        // and every vertical drag on the grid moves the sheet instead of scrolling the grid. The
        // picker inflates its children after loading emoji data asynchronously, so this runs on every
        // layout pass rather than once; each header only flips once, and the follow-up
        // `requestLayout` makes the behavior look up its scrolling child again.
        pickerView.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            if (disableHorizontalNestedScrolling(pickerView)) {
                pickerView.requestLayout();
            }
        });
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
     * Turns off nested scrolling on every {@link RecyclerView} under {@code view} that can't scroll
     * vertically, so a vertical list is the one {@code BottomSheetBehavior} binds to. Returns whether
     * any view changed.
     */
    private static boolean disableHorizontalNestedScrolling(View view) {
        boolean changed = false;
        if (view instanceof RecyclerView) {
            RecyclerView recyclerView = (RecyclerView) view;
            RecyclerView.LayoutManager layoutManager = recyclerView.getLayoutManager();
            if (layoutManager != null && !layoutManager.canScrollVertically() && recyclerView.isNestedScrollingEnabled()) {
                recyclerView.setNestedScrollingEnabled(false);
                changed = true;
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                changed |= disableHorizontalNestedScrolling(group.getChildAt(i));
            }
        }
        return changed;
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
