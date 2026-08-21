import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the French emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('fr', async () => (await import('emoji-picker-element-data/fr/emojibase/data.json')).default);
