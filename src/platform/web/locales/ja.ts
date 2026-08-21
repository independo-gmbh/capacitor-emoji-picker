/**
 * Lazily loads the Japanese emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadJaLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/ja/emojibase/data.json')).default;
}
