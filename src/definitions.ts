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
    /**
     * Configures the close button the iOS native presentation renders above its keyboard (there's
     * no system-provided one). Ignored on Android and web.
     */
    closeButton?: EmojiPickerCloseButtonOptions;
    /**
     * Dismiss the picker when the user taps the transparent area outside the keyboard/button.
     *
     * Only consulted by the iOS native presentation. If `closeButton.hidden` is `true`, this is
     * treated as `true` regardless of the value passed here, so the user always has a way to
     * dismiss the keyboard.
     * @default true
     */
    dismissOnBackdropTap?: boolean;
}

/**
 * Configures the close button rendered above the iOS native emoji keyboard.
 */
export interface EmojiPickerCloseButtonOptions {
    /**
     * `xSmall`: 24pt, `small`: 32pt, `medium`: 48pt, `large`: 64pt.
     * @default 'medium'
     */
    size?: 'xSmall' | 'small' | 'medium' | 'large';
    /**
     * Which side of the keyboard the button docks to.
     * @default 'right'
     */
    position?: 'left' | 'center' | 'right';
    /**
     * Hides the built-in close button. See `EmojiPickerOptions.dismissOnBackdropTap` for the
     * safety net this triggers.
     * @default false
     */
    hidden?: boolean;
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
