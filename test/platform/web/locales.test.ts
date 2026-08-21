import * as locales from '../../../src/platform/web/locales';

describe('locales barrel', () => {
    it('exports a loader for every locale shipped in emoji-picker-element-data', () => {
        // A representative sample across bundled-by-default, emojibase-sourced, and cldr-sourced
        // locales, rather than every one of the 28 exports.
        expect(typeof locales.enLocale).toBe('function');
        expect(typeof locales.deLocale).toBe('function');
        expect(typeof locales.frLocale).toBe('function');
        expect(typeof locales.ptLocale).toBe('function');
        expect(typeof locales.zhHantLocale).toBe('function');
        expect(typeof locales.enGbLocale).toBe('function');
    });

    it('resolves a non-default locale to its emoji dataset', async () => {
        const data = (await locales.ptLocale()) as unknown[];

        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it('carries its own locale code as a typed .locale property', () => {
        expect(locales.ptLocale.locale).toBe('pt');
        expect(locales.zhHantLocale.locale).toBe('zh-hant');
        expect(locales.enLocale.locale).toBe('en');
    });
});
