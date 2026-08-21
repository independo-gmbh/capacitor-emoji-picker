/**
 * Lazily loads the Chinese emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadZhLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/zh/emojibase/data.json')).default;
}
