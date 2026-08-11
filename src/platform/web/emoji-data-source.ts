import data from 'emoji-picker-element-data/en/emojibase/data.json';

// Intentionally never revoked: the object URL must stay valid for the lifetime of the page
// since the same cached dataset is reused across every `present()` call.
let cachedDataSourceUrl: string | undefined;

/**
 * Returns a same-origin object URL serving the bundled emoji dataset, so the web picker
 * never depends on `emoji-picker-element`'s default jsDelivr CDN at runtime.
 */
export function getBundledEmojiDataSourceUrl(): string {
    if (!cachedDataSourceUrl) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        cachedDataSourceUrl = URL.createObjectURL(blob);
    }
    return cachedDataSourceUrl;
}
