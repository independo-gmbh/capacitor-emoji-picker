import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the Hungarian emoji dataset, so it code-splits into its own chunk.
 *
 * `emoji-picker-element-data` doesn't ship an `emojibase`-sourced dataset for `hu` (only `en`,
 * `en-gb`, `fr`, `ja`, `ru`, `sv`, `zh` have one); `cldr` produces the same normalized schema
 * from a different upstream annotation source, so it's used here instead.
 */
export default createLocaleLoader('hu', async () => (await import('emoji-picker-element-data/hu/cldr/data.json')).default);
