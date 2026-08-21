import loadDeLocale from './locales/de';
import loadEnLocale from './locales/en';
import loadEsLocale from './locales/es';
import loadFrLocale from './locales/fr';
import loadJaLocale from './locales/ja';

const DEFAULT_LOCALE = 'en';
const EMOJI_PICKER_ELEMENT_DATA_VERSION = '^1';

/** Locales bundled with the plugin and always available offline, loaded lazily per locale. */
const DEFAULT_BUNDLED_LOCALES: Record<string, () => Promise<unknown>> = {
    en: loadEnLocale,
    de: loadDeLocale,
    es: loadEsLocale,
    fr: loadFrLocale,
    ja: loadJaLocale,
};

/** Locales registered at runtime by the host app via `registerEmojiLocale`. */
const registeredLocales = new Map<string, unknown>();

/** Object URLs already resolved for a given locale, so `present()` never re-fetches/re-blobs. */
const cachedDataSourceUrls = new Map<string, string>();

/**
 * Registers emoji data for a locale that isn't in the plugin's default bundled set
 * (`en`, `de`, `es`, `fr`, `ja`), so it's used instead of falling back to a CDN fetch.
 *
 * The host app is responsible for importing the dataset itself (typically from
 * `emoji-picker-element-data/<locale>/emojibase/data.json`), which lets its own bundler decide
 * whether to include it statically or split it into a lazy chunk.
 */
export function registerEmojiLocale(locale: string, data: unknown): void {
    registeredLocales.set(locale, data);
    cachedDataSourceUrls.delete(locale);
}

function toObjectUrl(data: unknown): string {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    return URL.createObjectURL(blob);
}

/**
 * Fetches a locale's emoji dataset from jsDelivr, mirroring `emoji-picker-element`'s own default.
 * Not every locale ships an `emojibase`-sourced dataset (only `en`, `en-gb`, `fr`, `ja`, `ru`,
 * `sv`, `zh` do); `cldr` produces the same normalized schema from a different annotation source,
 * so it's tried as a fallback before giving up.
 */
async function fetchLocaleFromCdn(locale: string): Promise<unknown> {
    for (const source of ['emojibase', 'cldr']) {
        const url = `https://cdn.jsdelivr.net/npm/emoji-picker-element-data@${EMOJI_PICKER_ELEMENT_DATA_VERSION}/${locale}/${source}/data.json`;
        const response = await fetch(url);
        if (response.ok) {
            return response.json();
        }
    }
    throw new Error(`Failed to fetch emoji data for locale '${locale}'`);
}

async function resolveLocaleData(locale: string): Promise<unknown> {
    if (registeredLocales.has(locale)) {
        return registeredLocales.get(locale);
    }
    const bundledLoader = DEFAULT_BUNDLED_LOCALES[locale];
    if (bundledLoader) {
        return bundledLoader();
    }
    return fetchLocaleFromCdn(locale);
}

/**
 * Returns a same-origin object URL serving the emoji dataset for `locale`, so the web picker
 * doesn't depend on a CDN at runtime for registered/bundled locales. Falls back to `'en'` on any
 * resolution failure (unknown locale with no network access, malformed code, etc).
 */
export async function getEmojiDataSourceUrl(locale: string = DEFAULT_LOCALE): Promise<string> {
    const cached = cachedDataSourceUrls.get(locale);
    if (cached) {
        return cached;
    }

    let data: unknown;
    try {
        data = await resolveLocaleData(locale);
    } catch {
        if (locale === DEFAULT_LOCALE) {
            throw new Error(`Failed to resolve default emoji locale '${DEFAULT_LOCALE}'`);
        }
        return getEmojiDataSourceUrl(DEFAULT_LOCALE);
    }

    const url = toObjectUrl(data);
    cachedDataSourceUrls.set(locale, url);
    return url;
}
