import type { EmojiPickerLocaleCode } from '../../../core/emoji-locale';

/**
 * Loads a locale's emoji dataset, carrying its own locale code as a typed `.locale` property so
 * callers can pass it straight to `EmojiPickerOptions.locale`/`registerEmojiLocale` without
 * re-typing the code by hand (e.g. `registerEmojiLocale(ptLocale.locale, await ptLocale())`).
 */
export interface EmojiLocaleLoader<L extends EmojiPickerLocaleCode = EmojiPickerLocaleCode> {
    (): Promise<unknown>;
    readonly locale: L;
}

export function createLocaleLoader<L extends EmojiPickerLocaleCode>(
    locale: L,
    load: () => Promise<unknown>
): EmojiLocaleLoader<L> {
    return Object.assign(load, { locale });
}
