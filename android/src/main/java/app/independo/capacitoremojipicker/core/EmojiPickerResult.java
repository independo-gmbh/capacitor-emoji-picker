package app.independo.capacitoremojipicker.core;

/** Result of presenting the emoji picker. */
public final class EmojiPickerResult {

    private final String emoji;

    public EmojiPickerResult(String emoji) {
        this.emoji = emoji;
    }

    /** The selected emoji, or {@code null} when the picker was dismissed without a selection. */
    public String getEmoji() {
        return emoji;
    }
}
