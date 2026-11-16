import loadEnLocale from './locales/en';

const DEFAULT_LOCALE = 'en';
const EMOJI_PICKER_ELEMENT_DATA_VERSION = '^1';

/** Locales registered at runtime by the host app via `registerEmojiLocale`. */
const registeredLocales = new Map<string, unknown>();

/** Dataset URLs already resolved for a given locale, so `present()` never re-fetches/re-encodes. */
const cachedDataSources = new Map<string, EmojiDataSource>();

/**
 * Registers emoji data for a locale other than `'en'` (the only one bundled by default), so it's
 * used instead of falling back to a CDN fetch.
 *
 * Pass a loader from a per-locale entry, e.g.
 * `import ptLocale from '@independo/capacitor-emoji-picker/dist/esm/platform/web/locales/pt'` and
 * `registerEmojiLocale(ptLocale.locale, await ptLocale())`, or supply the dataset yourself. Either way, the
 * host app decides what to import, which lets its own bundler include it statically or split it
 * into a lazy chunk as it sees fit, and unused locales stay out of the build.
 */
export function registerEmojiLocale(locale: string, data: unknown): void {
    registeredLocales.set(locale, data);
    cachedDataSources.delete(locale);
}

/**
 * Encodes the dataset as a base64 `data:` URL.
 *
 * Not a `blob:` object URL: once a locale's data is cached in IndexedDB, `emoji-picker-element`
 * checks it for freshness with a `fetch(dataSource, { method: 'HEAD' })` it never awaits, and the
 * Fetch standard answers only `GET` for `blob:` URLs, so every such check rejected as an unhandled
 * `TypeError` - and the cached copy was never replaced when the dataset changed. A `data:` URL
 * answers `HEAD` too, and is the same on every page load for the same dataset, so the check keeps
 * the cached copy until the dataset itself changes.
 */
function toDataUrl(data: unknown): Promise<string> {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Whether the page may fetch `data:` URLs, i.e. whether its CSP `connect-src` (or `default-src`)
 * allows `data:`. Probed once per session with the same `HEAD` request `emoji-picker-element`
 * later makes against the dataset; Chromium and WebKit reject a `data:` fetch the policy blocks
 * for `HEAD` and `GET` alike.
 */
let dataUrlsFetchable: Promise<boolean> | undefined;
function canFetchDataUrls(): Promise<boolean> {
    dataUrlsFetchable ??= fetch('data:application/json,{}', { method: 'HEAD' }).then(
        () => true,
        () => false
    );
    return dataUrlsFetchable;
}

/**
 * Serves the dataset as a `blob:` object URL: the legacy form, for pages whose CSP allows `blob:`
 * but not `data:` in `connect-src`. Its random per-load URL means the dataset is re-stored in
 * IndexedDB on every session, and the freshness check on a cached locale (a `HEAD`, which `blob:`
 * URLs reject) raises an unhandled `TypeError` again; see `toDataUrl`.
 */
function toBlobUrl(data: unknown): string {
    return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
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
    if (locale === DEFAULT_LOCALE) {
        return loadEnLocale();
    }
    return fetchLocaleFromCdn(locale);
}

/** A dataset URL together with the locale whose data it actually serves. */
export interface EmojiDataSource {
    /** The locale the data belongs to: the requested one, or `'en'` after a fallback. */
    locale: string;
    url: string;
}

/**
 * Returns a URL serving the emoji dataset for `locale`, so the web picker
 * doesn't depend on a CDN at runtime for registered/bundled locales. A `data:` URL when the page's
 * CSP allows fetching one, else a `blob:` URL (see `canFetchDataUrls`). Falls back to `'en'` on any
 * resolution failure (unknown locale with no network access, malformed code, etc); the result's
 * `locale` is then `'en'`, so the caller never files English data under the requested locale's
 * IndexedDB database.
 */
export async function getEmojiDataSourceUrl(locale: string = DEFAULT_LOCALE): Promise<EmojiDataSource> {
    const cached = cachedDataSources.get(locale);
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

    const url = (await canFetchDataUrls()) ? await toDataUrl(data) : toBlobUrl(data);
    const source: EmojiDataSource = { locale, url };
    cachedDataSources.set(locale, source);
    return source;
}
