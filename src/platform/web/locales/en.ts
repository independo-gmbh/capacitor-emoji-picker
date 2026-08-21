import data from 'emoji-picker-element-data/en/emojibase/data.json';

// Statically imported, unlike the other bundled locales: `en` is the default, used on every
// `present()` call that doesn't set `locale`, so lazy-loading it would only add latency to the
// common case without any code-splitting upside.
export default async function loadEnLocale(): Promise<unknown> {
    return data;
}
