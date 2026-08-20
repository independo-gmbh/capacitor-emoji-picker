package app.independo.capacitoremojipicker.core;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class EmojiBackdropOptionsTest {

    @Test
    public void expandsShorthandRgbToOpaqueColor() {
        assertEquals(0xFFFF0000, EmojiBackdropOptions.toColorInt("#F00"));
    }

    @Test
    public void treatsSixDigitHexAsOpaque() {
        assertEquals(0xFF112233, EmojiBackdropOptions.toColorInt("#112233"));
    }

    @Test
    public void reordersEightDigitHexAlphaToAndroidArgb() {
        // #RRGGBBAA -> Android's 0xAARRGGBB.
        assertEquals(0xAA112233, EmojiBackdropOptions.toColorInt("#112233AA"));
    }
}
