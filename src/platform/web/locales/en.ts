import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the English emoji dataset, so it code-splits into its own chunk. `en` is the
 * default, but it is only needed once the picker is presented, so the package root must not
 * carry its ~400 KB into an importer's initial chunk.
 */
export default createLocaleLoader('en', async () => (await import('emoji-picker-element-data/en/emojibase/data.json')).default);
