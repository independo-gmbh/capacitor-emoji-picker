package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;

/** Presents the native AndroidX emoji picker via an injected {@link EmojiPickerDialogFactory}. */
public class NativeEmojiPickerPresenter implements EmojiPickerPresenter {

    /** Supplies the current hosting Activity; returns null if none is available. */
    public interface ActivityProvider {
        Activity get();
    }

    /**
     * Decides whether an Activity can currently host a dialog.
     *
     * Isolated from {@link #present} so unit tests can inject a fake that never calls real
     * {@code Activity#isFinishing()}/{@code #isDestroyed()} methods, which throw under the
     * Android Gradle Plugin's mockable android.jar outside of Robolectric or instrumented tests.
     */
    interface ActivityAvailabilityChecker {
        boolean isAvailable(Activity activity);
    }

    /** Default checker used in production: mirrors the standard Activity-availability contract. */
    private static final ActivityAvailabilityChecker DEFAULT_AVAILABILITY_CHECKER = (activity) ->
        activity != null && !activity.isFinishing() && !activity.isDestroyed();

    private final ActivityProvider activityProvider;
    private final EmojiPickerDialogFactory dialogFactory;
    private final ActivityAvailabilityChecker availabilityChecker;

    /**
     * The presentation currently owning the dialog/lifecycle-observer, if any. Only the {@link
     * Presentation} instance that is still {@code current} may settle and clear this field; a
     * stale presentation whose async dismissal callback fires after a newer one has taken over
     * must not be able to touch it. See {@link Presentation#settle}.
     */
    private Presentation current;

    public NativeEmojiPickerPresenter(ActivityProvider activityProvider, EmojiPickerDialogFactory dialogFactory) {
        this(activityProvider, dialogFactory, DEFAULT_AVAILABILITY_CHECKER);
    }

    /** Package-private: lets tests inject a fake {@link ActivityAvailabilityChecker}. */
    NativeEmojiPickerPresenter(
        ActivityProvider activityProvider,
        EmojiPickerDialogFactory dialogFactory,
        ActivityAvailabilityChecker availabilityChecker
    ) {
        this.activityProvider = activityProvider;
        this.dialogFactory = dialogFactory;
        this.availabilityChecker = availabilityChecker;
    }

    @Override
    public void present(
        String presentation,
        boolean dismissOnBackdropTap,
        EmojiCloseButtonOptions closeButton,
        String theme,
        EmojiPickerCallback callback
    ) {
        if (!"auto".equals(presentation)) {
            // 'web' (and any future non-native presentation) isn't implemented on Android yet;
            // honestly reject rather than silently showing the native picker instead.
            callback.onError(ErrorCodes.NOT_IMPLEMENTED);
            return;
        }

        Activity activity = activityProvider.get();
        Runnable work = () -> presentOnUiThread(activity, dismissOnBackdropTap, theme, callback);
        // Capacitor invokes @PluginMethod handlers on a background "CapacitorPlugins" thread, but
        // BottomSheetDialog#show() and Lifecycle#addObserver() are UI-thread-only APIs. Hop onto the
        // UI thread whenever we have a real Activity to hop through; a null Activity means there's no
        // UI to touch, so run synchronously and let the availability check below report the error.
        if (activity != null) {
            activity.runOnUiThread(work);
        } else {
            work.run();
        }
    }

    private void presentOnUiThread(Activity activity, boolean dismissOnBackdropTap, String theme, EmojiPickerCallback callback) {
        if (!availabilityChecker.isAvailable(activity)) {
            callback.onError(ErrorCodes.NATIVE_UNAVAILABLE);
            return;
        }

        // Dismiss the prior presentation's dialog, but do NOT clear `current` here: a real
        // BottomSheetDialog#dismiss() delivers its OnDismissListener asynchronously (posted to the
        // message queue), even from the UI thread. The old Presentation's own settle() - triggered
        // whenever that callback eventually fires - will clear `current` itself, and only if it's
        // still the active one, so it can never clobber the new Presentation created below.
        if (current != null) {
            current.dismissDialog();
        }

        Presentation presentation = new Presentation(callback);
        LifecycleOwner lifecycleOwner = (activity instanceof LifecycleOwner) ? (LifecycleOwner) activity : null;
        current = presentation;
        presentation.start(activity, dismissOnBackdropTap, theme, lifecycleOwner);
    }

    /**
     * Owns everything about ONE presentation attempt: its dialog handle, its lifecycle observer,
     * and whether it has already settled. Identity - not a shared field - determines whether a
     * (possibly late-arriving, async) callback is allowed to mutate {@code current}.
     */
    private final class Presentation {

        private final EmojiPickerCallback callback;
        private EmojiPickerDialogFactory.EmojiPickerDialogHandle handle;
        private DefaultLifecycleObserver observer;
        private LifecycleOwner lifecycleOwner;
        private boolean settled;

        Presentation(EmojiPickerCallback callback) {
            this.callback = callback;
        }

        void start(Activity activity, boolean dismissOnBackdropTap, String theme, LifecycleOwner lifecycleOwner) {
            this.lifecycleOwner = lifecycleOwner;

            EmojiPickerDialogFactory.EmojiPickerDialogHandle createdHandle;
            try {
                createdHandle = dialogFactory.create(
                    activity,
                    dismissOnBackdropTap,
                    theme,
                    new EmojiPickerDialogFactory.Listener() {
                        @Override
                        public void onEmojiSelected(String emoji) {
                            settle(new EmojiPickerResult(emoji));
                        }

                        @Override
                        public void onDismissed() {
                            settle(new EmojiPickerResult(null));
                        }
                    }
                );
            } catch (RuntimeException e) {
                // e.g. BadTokenException if the Activity finished in the window between the
                // availability check and dialog creation/show. Settle with NATIVE_UNAVAILABLE
                // instead of letting the exception propagate uncaught out of the UI-thread
                // Runnable, which would crash the app and leave isPresenting stuck forever.
                settleWithError(ErrorCodes.NATIVE_UNAVAILABLE);
                return;
            }

            if (settled) {
                // Defensive: if create() somehow synchronously settled us (e.g. immediate
                // dismissal), don't leak the handle - dismiss it right away.
                try {
                    createdHandle.dismiss();
                } catch (RuntimeException ignored) {
                    // Window may already be gone.
                }
                return;
            }

            this.handle = createdHandle;

            if (lifecycleOwner != null) {
                DefaultLifecycleObserver lifecycleObserver = new DefaultLifecycleObserver() {
                    @Override
                    public void onDestroy(LifecycleOwner owner) {
                        // Dismiss before settling: dismissing a dialog whose window has already
                        // been torn down alongside the Activity can throw (e.g.
                        // IllegalArgumentException: "View not attached to window manager"), which
                        // dismissDialog() guards against.
                        dismissDialog();
                        settle(new EmojiPickerResult(null));
                    }
                };
                this.observer = lifecycleObserver;
                lifecycleOwner.getLifecycle().addObserver(lifecycleObserver);
            }
        }

        /** Dismisses this presentation's dialog handle, if any. Does not settle synchronously. */
        void dismissDialog() {
            if (handle != null) {
                try {
                    handle.dismiss();
                } catch (RuntimeException e) {
                    // Window may already be gone.
                }
            }
        }

        private void settleWithError(String errorCode) {
            if (settled) {
                return;
            }
            settled = true;
            closeOut();
            callback.onError(errorCode);
        }

        private void settle(EmojiPickerResult result) {
            if (settled) {
                return;
            }
            settled = true;
            closeOut();
            callback.onResult(result);
        }

        /** Removes the lifecycle observer and, if still current, clears `current`. Never touches
         * another Presentation instance's state. */
        private void closeOut() {
            if (observer != null && lifecycleOwner != null) {
                lifecycleOwner.getLifecycle().removeObserver(observer);
            }
            if (current == this) {
                current = null;
            }
        }
    }
}
