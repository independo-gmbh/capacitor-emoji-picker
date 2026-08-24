import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the Japanese emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('ja', async () => (await import('emoji-picker-element-data/ja/emojibase/data.json')).default);
