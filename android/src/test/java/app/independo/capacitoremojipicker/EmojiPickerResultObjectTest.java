package app.independo.capacitoremojipicker;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import org.junit.Test;

public class EmojiPickerResultObjectTest {

    @Test
    public void dismissalKeepsEmojiKeyAsJsonNull() {
        JSObject ret = EmojiPicker.buildResultObject(new EmojiPickerResult(null));
        assertTrue(ret.has("emoji"));
        assertEquals(JSONObject.NULL, ret.opt("emoji"));
    }

    @Test
    public void selectionCarriesTheEmoji() {
        JSObject ret = EmojiPicker.buildResultObject(new EmojiPickerResult("😀"));
        assertEquals("😀", ret.opt("emoji"));
    }
}
