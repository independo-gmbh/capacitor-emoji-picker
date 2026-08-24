import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the Swedish emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('sv', async () => (await import('emoji-picker-element-data/sv/emojibase/data.json')).default);
