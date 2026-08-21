import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the Russian emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('ru', async () => (await import('emoji-picker-element-data/ru/emojibase/data.json')).default);
