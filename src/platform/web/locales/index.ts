/**
 * Every locale loader available for opt-in use with `registerEmojiLocale`, keyed by name.
 *
 * Only `en`/`de`/`es`/`fr`/`ja` are wired up as the default bundled set (see `emoji-data-source.ts`);
 * every other export here is inert until a caller imports it. Import only the loaders you need
 * (e.g. `import { ptLocale } from 'capacitor-emoji-picker'`) so your own bundler tree-shakes the
 * rest away instead of ever reaching them.
 */
export { default as enLocale } from './en';
export { default as bnLocale } from './bn';
export { default as daLocale } from './da';
export { default as deLocale } from './de';
export { default as enGbLocale } from './en-gb';
export { default as esMxLocale } from './es-mx';
export { default as esLocale } from './es';
export { default as etLocale } from './et';
export { default as fiLocale } from './fi';
export { default as frLocale } from './fr';
export { default as hiLocale } from './hi';
export { default as huLocale } from './hu';
export { default as itLocale } from './it';
export { default as jaLocale } from './ja';
export { default as koLocale } from './ko';
export { default as ltLocale } from './lt';
export { default as msLocale } from './ms';
export { default as nbLocale } from './nb';
export { default as nlLocale } from './nl';
export { default as plLocale } from './pl';
export { default as ptLocale } from './pt';
export { default as ruLocale } from './ru';
export { default as svLocale } from './sv';
export { default as thLocale } from './th';
export { default as ukLocale } from './uk';
export { default as viLocale } from './vi';
export { default as zhLocale } from './zh';
export { default as zhHantLocale } from './zh-hant';
