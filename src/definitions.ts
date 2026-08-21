/**
 * How the picker should be presented.
 */
export type EmojiPickerPresentation = 'auto' | 'web';

/**
 * The picker's appearance.
 */
export type EmojiPickerTheme = 'system' | 'light' | 'dark';

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
     * Configures the close button rendered above the iOS keyboard/the web picker sheet (iOS has
     * no system-provided one). Ignored on Android.
     */
    closeButton?: EmojiPickerCloseButtonOptions;
    /**
     * Configures the dimming/blur shown behind the picker.
     */
    backdrop?: EmojiPickerBackdropOptions;
    /**
     * Dismiss the picker when the user taps the transparent area outside the keyboard/button (iOS)
     * or the scrim outside the picker sheet (Android and web).
     *
     * On iOS and web, if `closeButton.hidden` is `true`, this is treated as `true` regardless of
     * the value passed here, so the user always has a way to dismiss the picker.
     * @default true
     */
    dismissOnBackdropTap?: boolean;
    /**
     * `system`: follows the OS/app appearance setting.
     * `light` / `dark`: forces the picker's appearance regardless of the system setting.
     *
     * On iOS native presentation, this also sets `keyboardAppearance` on the underlying text
     * input, which is the mechanism the system emoji keyboard itself honors (separate from the
     * app's own `overrideUserInterfaceStyle`, which only themes the plugin's own overlay/close
     * button).
     * @default 'system'
     */
    theme?: EmojiPickerTheme;
    /**
     * BCP-47-ish locale code for the emoji dataset/UI strings (e.g. `'en'`, `'de'`, `'fr'`).
     *
     * Web only — ignored on iOS/Android, which follow the device locale automatically via the
     * system emoji keyboard/`androidx.emoji2.emojipicker`. `'en'`, `'de'`, `'es'`, `'fr'`, and
     * `'ja'` are bundled and available offline by default; any other locale is fetched from a CDN
     * at present-time unless registered ahead of time via `registerEmojiLocale`.
     *
     * Every locale `emoji-picker-element-data` ships is available as an individually importable
     * loader (e.g. `enGbLocale`, `ptLocale`, `zhHantLocale`, ...) from
     * `capacitor-emoji-picker/dist/esm/platform/web/locales`, so an app can register any of them
     * offline without a CDN dependency by importing only the ones it needs:
     * ```ts
     * import { registerEmojiLocale } from 'capacitor-emoji-picker';
     * import { ptLocale } from 'capacitor-emoji-picker/dist/esm/platform/web/locales';
     * registerEmojiLocale('pt', await ptLocale());
     * ```
     * This is a deep import rather than a root-level export deliberately: the package root is
     * also the standalone `dist/plugin.js` bundle's entry point, which inlines every dynamic
     * import it can reach (there's no code-splitting in that single-file build) — re-exporting
     * all 28 loaders from there would have pulled every locale's dataset into it. A bundler
     * resolving this deep import still tree-shakes away every loader (and its underlying
     * dataset) the app never imports.
     * @default 'en'
     */
    locale?: string;
    /**
     * Seeds the picker's starting skin tone (`0` = none/default, `1`-`5` = light through dark).
     *
     * Web only — iOS/Android use the OS's own last-selected skin tone. On web, the underlying
     * picker persists the user's own choice after this via IndexedDB (keyed by `locale`), so this
     * only affects the very first render for a given locale/origin.
     * @default 0
     */
    skinTone?: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * Configures the close button rendered above the iOS native emoji keyboard/the web picker sheet.
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
 * Configures the dimming/blur shown behind the picker.
 */
export interface EmojiPickerBackdropOptions {
    /**
     * CSS hex color for the backdrop; the alpha channel controls darkness (e.g. `'#000000cc'` is
     * 80% black, `'#00000000'` is no darkening). Supports `#RGB`, `#RRGGBB`, and `#RRGGBBAA`.
     * Falls back to the default on an invalid value.
     * @default '#00000066'
     */
    color?: string;
    /**
     * Backdrop blur radius in px, analogous to CSS `backdrop-filter: blur()`.
     *
     * Web applies this directly. iOS approximates it by mapping the value to the nearest system
     * blur material (there is no continuous-radius blur API). Android has no API to blur content
     * behind a dialog window, so this option is accepted but has no visual effect there.
     * @default 0
     */
    blur?: number;
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
