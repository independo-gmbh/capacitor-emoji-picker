package app.independo.capacitoremojipicker.core;

/**
 * Backdrop configuration for a single {@code present()} call, mirroring the iOS
 * `EmojiBackdropOptions` struct. {@code color} is a validated `#RGB`/`#RRGGBB`/`#RRGGBBAA` hex
 * string; {@code blur} is accepted for plumbing parity with web/iOS but has no visual effect on
 * Android (see `DefaultEmojiPickerDialogFactory`).
 */
public final class EmojiBackdropOptions {
    public final String color;
    public final int blur;

    public EmojiBackdropOptions(String color, int blur) {
        this.color = color;
        this.blur = blur;
    }

    /**
     * Converts a validated `#RGB`/`#RRGGBB`/`#RRGGBBAA` hex string into an ARGB color int.
     * Assumes the input already matches that shape (validated by the caller,
     * {@code EmojiPicker#present}) - not defensive against arbitrary input.
     *
     * Parses the hex digits directly with {@link Long#parseLong} rather than
     * {@code android.graphics.Color#parseColor} so this class stays plain Java, testable with a
     * bare JUnit runner instead of needing Robolectric/instrumentation for a stubbed android.jar.
     */
    public static int toColorInt(String hex) {
        // Leading '#' is guaranteed by the regex validating this string before it reaches here
        // (see EmojiPicker#present), so this is a plain substring, not a defensive check.
        String h = hex.substring(1);
        if (h.length() == 3) {
            StringBuilder expanded = new StringBuilder();
            for (int i = 0; i < 3; i++) {
                char c = h.charAt(i);
                expanded.append(c).append(c);
            }
            h = expanded.toString();
        }
        if (h.length() == 6) {
            // Opaque: no alpha channel supplied.
            h = "FF" + h;
        } else {
            // #RRGGBBAA -> Android's #AARRGGBB. The regex guarantees h.length() is 6 or 8 here.
            h = h.substring(6, 8) + h.substring(0, 6);
        }
        return (int) Long.parseLong(h, 16);
    }
}
