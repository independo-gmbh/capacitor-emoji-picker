/**
 * Lazily loads the British English emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadEnGbLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/en-gb/emojibase/data.json')).default;
}
