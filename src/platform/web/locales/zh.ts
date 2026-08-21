import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the Chinese emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('zh', async () => (await import('emoji-picker-element-data/zh/emojibase/data.json')).default);
