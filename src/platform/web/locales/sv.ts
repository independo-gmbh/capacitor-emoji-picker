/**
 * Lazily loads the Swedish emoji dataset, so it code-splits into its own chunk.
 */
export default async function loadSvLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/sv/emojibase/data.json')).default;
}
