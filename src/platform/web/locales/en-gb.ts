import { createLocaleLoader } from './create-locale-loader';

/**
 * Lazily loads the British English emoji dataset, so it code-splits into its own chunk.
 */
export default createLocaleLoader('en-gb', async () => (await import('emoji-picker-element-data/en-gb/emojibase/data.json')).default);
