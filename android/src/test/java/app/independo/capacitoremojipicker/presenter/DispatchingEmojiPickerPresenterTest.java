package app.independo.capacitoremojipicker.presenter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

import app.independo.capacitoremojipicker.core.EmojiBackdropOptions;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import org.junit.Test;

public class DispatchingEmojiPickerPresenterTest {

    private static class RecordingPresenter implements EmojiPickerPresenter {
        String lastPresentation;
        int callCount;

        @Override
        public void present(
            String presentation,
            boolean dismissOnBackdropTap,
            EmojiCloseButtonOptions closeButton,
            EmojiBackdropOptions backdrop,
            String theme,
            EmojiPickerCallback callback
        ) {
            lastPresentation = presentation;
            callCount++;
            callback.onResult(new EmojiPickerResult(null));
        }
    }

    @Test
    public void routesAutoToTheNativePresenter() {
        RecordingPresenter nativePresenter = new RecordingPresenter();
        RecordingPresenter webFallbackPresenter = new RecordingPresenter();
        DispatchingEmojiPickerPresenter dispatcher = new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter);

        dispatcher.present("auto", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        assertEquals(1, nativePresenter.callCount);
        assertEquals(0, webFallbackPresenter.callCount);
    }

    @Test
    public void routesWebToTheWebFallbackPresenter() {
        RecordingPresenter nativePresenter = new RecordingPresenter();
        RecordingPresenter webFallbackPresenter = new RecordingPresenter();
        DispatchingEmojiPickerPresenter dispatcher = new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter);

        dispatcher.present("web", true, null, null, "system", new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        assertEquals(0, nativePresenter.callCount);
        assertEquals(1, webFallbackPresenter.callCount);
    }
}
