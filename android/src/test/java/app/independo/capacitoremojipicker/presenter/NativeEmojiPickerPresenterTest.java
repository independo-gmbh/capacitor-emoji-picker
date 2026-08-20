package app.independo.capacitoremojipicker.presenter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import app.independo.capacitoremojipicker.core.EmojiBackdropOptions;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import org.junit.Test;

public class NativeEmojiPickerPresenterTest {

    /** A dialog factory that captures the listener/handle passed to it so tests can drive them manually. */
    private static class FakeDialogFactory implements EmojiPickerDialogFactory {
        EmojiPickerDialogFactory.Listener capturedListener;
        FakeDialogHandle lastHandle;
        int createCount;
        RuntimeException createThrows;
        String lastTheme;

        @Override
        public EmojiPickerDialogHandle create(
            Activity activity,
            boolean dismissOnBackdropTap,
            EmojiBackdropOptions backdrop,
            String theme,
            Listener listener
        ) {
            createCount++;
            lastTheme = theme;
            if (createThrows != null) {
                throw createThrows;
            }
            this.capturedListener = listener;
            lastHandle = new FakeDialogHandle();
            return lastHandle;
        }
    }

    /**
     * Mirrors real {@code BottomSheetDialog} semantics: dismiss() does NOT synchronously invoke
     * the dismiss listener - it's posted to the message queue. Tests that need to exercise
     * async-dismiss-after-reentry fire {@code onDismissed()} manually after the fact.
     */
    private static class FakeDialogHandle implements EmojiPickerDialogFactory.EmojiPickerDialogHandle {
        boolean dismissed;

        @Override
        public void dismiss() {
            dismissed = true;
        }
    }

    /**
     * A checker that returns a fixed answer without ever calling real {@code Activity} methods,
     * so tests don't need a functional {@code Activity} under the mockable android.jar.
     */
    private static class FakeAvailabilityChecker implements NativeEmojiPickerPresenter.ActivityAvailabilityChecker {
        private final boolean available;

        FakeAvailabilityChecker(boolean available) {
            this.available = available;
        }

        @Override
        public boolean isAvailable(Activity activity) {
            return available;
        }
    }

    /** A callback capturing the outcome and how many times it fired. */
    private static class CapturingCallback implements EmojiPickerCallback {
        EmojiPickerResult result;
        String errorCode;
        int callCount;

        @Override
        public void onResult(EmojiPickerResult result) {
            this.result = result;
            callCount++;
        }

        @Override
        public void onError(String code) {
            this.errorCode = code;
            callCount++;
        }
    }

    @Test
    public void nullActivityReportsNativeUnavailableAndNeverCreatesDialog() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(() -> null, factory);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", callback);

        assertEquals(ErrorCodes.NATIVE_UNAVAILABLE, callback.errorCode);
        assertEquals(0, factory.createCount);
    }

    @Test
    public void selectionSettlesOnceEvenIfDismissalFollows() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", callback);
        factory.capturedListener.onEmojiSelected("😀");
        factory.capturedListener.onDismissed();

        assertEquals(1, callback.callCount);
        assertEquals("😀", callback.result.getEmoji());
    }

    @Test
    public void dismissalWithoutSelectionResultsInNullEmoji() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", callback);
        factory.capturedListener.onDismissed();

        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
    }

    @Test
    public void doubleDismissSettlesOnce() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", callback);
        factory.capturedListener.onDismissed();
        factory.capturedListener.onDismissed();

        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
    }

    @Test
    public void reentrantPresentDismissesPriorDialogHandle() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback firstCallback = new CapturingCallback();
        CapturingCallback secondCallback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", firstCallback);
        FakeDialogHandle firstHandle = factory.lastHandle;
        EmojiPickerDialogFactory.Listener firstListener = factory.capturedListener;
        assertFalse(firstHandle.dismissed);

        presenter.present("auto", true, null, null, "system", secondCallback);
        FakeDialogHandle secondHandle = factory.lastHandle;

        assertTrue(firstHandle.dismissed);
        assertEquals(2, factory.createCount);
        assertEquals(0, firstCallback.callCount);
        assertEquals(0, secondCallback.callCount);

        // Real BottomSheetDialog#dismiss() delivers its OnDismissListener asynchronously (posted
        // to the message queue), even from the UI thread - so the first presentation's dismissal
        // callback can arrive AFTER the second present() call has already taken over. It must
        // settle firstCallback but must NOT clobber or interfere with the second (now current)
        // presentation's state.
        firstListener.onDismissed();

        assertEquals(1, firstCallback.callCount);
        assertNull(firstCallback.result.getEmoji());
        assertEquals(0, secondCallback.callCount);
        assertFalse(secondHandle.dismissed);

        // The second presentation must still be fully functional afterward.
        factory.capturedListener.onEmojiSelected("🎉");
        assertEquals(1, secondCallback.callCount);
        assertEquals("🎉", secondCallback.result.getEmoji());
    }

    @Test
    public void forwardsThemeToTheDialogFactory() {
        FakeDialogFactory factory = new FakeDialogFactory();
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "dark", callback);

        assertEquals("dark", factory.lastTheme);
    }

    @Test
    public void webPresentationReportsNotImplementedAndNeverTouchesActivityOrDialog() {
        FakeDialogFactory factory = new FakeDialogFactory();
        boolean[] activityProviderCalled = {false};
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> {
                activityProviderCalled[0] = true;
                return null;
            },
            factory
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, null, null, "system", callback);

        assertEquals(ErrorCodes.NOT_IMPLEMENTED, callback.errorCode);
        assertEquals(1, callback.callCount);
        assertFalse(activityProviderCalled[0]);
        assertEquals(0, factory.createCount);
    }

    @Test
    public void dialogFactoryCreateThrowingResultsInNativeUnavailableAndPresenterRemainsUsable() {
        FakeDialogFactory factory = new FakeDialogFactory();
        factory.createThrows = new RuntimeException("simulated BadTokenException");
        NativeEmojiPickerPresenter presenter = new NativeEmojiPickerPresenter(
            () -> null,
            factory,
            new FakeAvailabilityChecker(true)
        );
        CapturingCallback callback = new CapturingCallback();

        presenter.present("auto", true, null, null, "system", callback);

        assertEquals(ErrorCodes.NATIVE_UNAVAILABLE, callback.errorCode);
        assertEquals(1, callback.callCount);

        // A subsequent present() call must not be permanently blocked by leftover state from the
        // failed attempt.
        factory.createThrows = null;
        CapturingCallback secondCallback = new CapturingCallback();
        presenter.present("auto", true, null, null, "system", secondCallback);
        factory.capturedListener.onEmojiSelected("😀");

        assertEquals(1, secondCallback.callCount);
        assertEquals("😀", secondCallback.result.getEmoji());
    }
}
