import { createLocaleLoader } from './create-locale-loader';
import data from 'emoji-picker-element-data/en/emojibase/data.json';

/**
 * Lazily loads the English emoji dataset. Statically imported, unlike the other locales: `en`
 * is the default, used on every `present()` call that doesn't set `locale`, so lazy-loading
 * it would only add latency to the common case without any code-splitting upside.
 */
export default createLocaleLoader('en', async () => data);
