/**
 * Lazily loads the French emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadFrLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/fr/emojibase/data.json')).default;
}
