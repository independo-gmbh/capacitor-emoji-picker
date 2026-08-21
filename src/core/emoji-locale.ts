/** Every locale `emoji-picker-element-data` ships a dataset for. */
export const EMOJI_PICKER_LOCALES = [
    'en',
    'bn',
    'da',
    'de',
    'en-gb',
    'es-mx',
    'es',
    'et',
    'fi',
    'fr',
    'hi',
    'hu',
    'it',
    'ja',
    'ko',
    'lt',
    'ms',
    'nb',
    'nl',
    'pl',
    'pt',
    'ru',
    'sv',
    'th',
    'uk',
    'vi',
    'zh',
    'zh-hant',
] as const;

/** One of the locale codes `emoji-picker-element-data` ships a dataset for. */
export type EmojiPickerLocaleCode = (typeof EMOJI_PICKER_LOCALES)[number];
