package app.independo.capacitoremojipicker.core;

/**
 * Close-button configuration for a single {@code present()} call. Only consulted by presenters
 * that render their own close affordance (currently the web-fallback presenter); ignored
 * elsewhere, mirroring the iOS `EmojiCloseButtonOptions` struct.
 */
public final class EmojiCloseButtonOptions {
    public final String size;
    public final String position;
    public final boolean hidden;

    public EmojiCloseButtonOptions(String size, String position, boolean hidden) {
        this.size = size;
        this.position = position;
        this.hidden = hidden;
    }
}
