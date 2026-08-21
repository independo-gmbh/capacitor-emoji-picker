/**
 * Lazily loads the Russian emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadRuLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/ru/emojibase/data.json')).default;
}
