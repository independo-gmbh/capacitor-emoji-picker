/**
 * How the picker should be presented.
 */
export type EmojiPickerPresentation = 'auto' | 'web';

/**
 * Options for presenting the emoji picker.
 */
export interface EmojiPickerOptions {
    /**
     * `auto`: prefer native/system UI and fall back to the web picker when native presentation
     * is not available or fails.
     * `web`: always use the web picker, including inside Capacitor native apps.
     * @default 'auto'
     */
    presentation?: EmojiPickerPresentation;
}

/**
 * Result of presenting the emoji picker.
 */
export interface EmojiPickerResult {
    /**
     * The selected emoji as a complete Unicode string/grapheme (unchanged), or `null` when the
     * picker was dismissed without a selection.
     */
    emoji: string | null;
}

/**
 * Interface for the EmojiPicker plugin, which presents a native or web emoji picker and
 * resolves with the emoji the user selected.
 */
export interface EmojiPickerPlugin {
    /**
     * Presents the emoji picker.
     *
     * Resolves with `{ emoji: null }` rather than leaving the promise pending when the user
     * dismisses the picker without selecting an emoji.
     *
     * Calling this method again while a picker is already active rejects immediately with the
     * `ALREADY_PRESENTING` error code rather than presenting a second, overlapping picker.
     *
     * @param options The options for the presentation.
     * @returns A promise that resolves to an EmojiPickerResult.
     * @throws Error with code `ALREADY_PRESENTING` if a picker is already active.
     */
    present(options?: EmojiPickerOptions): Promise<EmojiPickerResult>;
}
