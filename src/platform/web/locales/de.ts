/**
 * Lazily loads the German emoji dataset, so it code-splits into its own chunk.
 *
 * `emoji-picker-element-data` doesn't ship an `emojibase`-sourced dataset for `de` (only `en`,
 * `en-gb`, `fr`, `ja`, `ru`, `sv`, `zh` have one); `cldr` produces the same normalized schema
 * from a different upstream annotation source, so it's used here instead.
 */
export default async function loadDeLocale(): Promise<unknown> {
    return (await import('emoji-picker-element-data/de/cldr/data.json')).default;
}
