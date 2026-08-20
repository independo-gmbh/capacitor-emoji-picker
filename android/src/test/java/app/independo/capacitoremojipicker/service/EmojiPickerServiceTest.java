package app.independo.capacitoremojipicker.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import app.independo.capacitoremojipicker.core.EmojiBackdropOptions;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import app.independo.capacitoremojipicker.presenter.EmojiPickerPresenter;
import org.junit.Test;

public class EmojiPickerServiceTest {

    /** A presenter that never calls back, simulating a picker that is still active. */
    private static class PendingPresenter implements EmojiPickerPresenter {
        EmojiPickerCallback capturedCallback;
        EmojiBackdropOptions capturedBackdrop;

        @Override
        public void present(
            String presentation,
            boolean dismissOnBackdropTap,
            EmojiCloseButtonOptions closeButton,
            EmojiBackdropOptions backdrop,
            String theme,
            EmojiPickerCallback callback
        ) {
            this.capturedCallback = callback;
            this.capturedBackdrop = backdrop;
        }
    }

    @Test
    public void secondConcurrentPresentIsRejected() {
        PendingPresenter presenter = new PendingPresenter();
        EmojiPickerService service = new EmojiPickerService(presenter);

        service.present("auto", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        String[] secondCallErrorCode = new String[1];
        service.present("auto", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {
                secondCallErrorCode[0] = code;
            }
        });

        assertEquals(ErrorCodes.ALREADY_PRESENTING, secondCallErrorCode[0]);
    }

    @Test
    public void presentAfterCompletionIsAllowedAgain() {
        PendingPresenter presenter = new PendingPresenter();
        EmojiPickerService service = new EmojiPickerService(presenter);

        String[] firstResultEmoji = new String[1];
        service.present("auto", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {
                firstResultEmoji[0] = result.getEmoji();
            }

            @Override
            public void onError(String code) {}
        });

        presenter.capturedCallback.onResult(new EmojiPickerResult("😀"));
        assertEquals("😀", firstResultEmoji[0]);

        String[] secondErrorCode = new String[1];
        service.present("auto", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {
                secondErrorCode[0] = code;
            }
        });

        assertNull(secondErrorCode[0]);
    }

    @Test
    public void forwardsBackdropOptionsToThePresenter() {
        PendingPresenter presenter = new PendingPresenter();
        EmojiPickerService service = new EmojiPickerService(presenter);
        EmojiBackdropOptions backdrop = new EmojiBackdropOptions("#112233aa", 8);

        service.present("auto", true, null, backdrop, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        assertEquals(backdrop, presenter.capturedBackdrop);
    }
}
