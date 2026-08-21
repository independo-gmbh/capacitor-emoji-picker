import type { getEmojiDataSourceUrl as GetEmojiDataSourceUrl, registerEmojiLocale as RegisterEmojiLocale } from '../../../src/platform/web/emoji-data-source';

describe('getEmojiDataSourceUrl', () => {
    let getEmojiDataSourceUrl: typeof GetEmojiDataSourceUrl;
    let registerEmojiLocale: typeof RegisterEmojiLocale;
    let objectUrlCounter: number;

    beforeEach(async () => {
        jest.resetModules();
        ({ getEmojiDataSourceUrl, registerEmojiLocale } = await import('../../../src/platform/web/emoji-data-source'));

        objectUrlCounter = 0;
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => `blob:mock-url-${++objectUrlCounter}`);
        (global.fetch as unknown) = jest.fn();
    });

    it('creates and caches a blob URL per locale for the default (bundled) locale', async () => {
        const first = await getEmojiDataSourceUrl();
        const second = await getEmojiDataSourceUrl('en');

        expect(first).toBe('blob:mock-url-1');
        expect(second).toBe('blob:mock-url-1');
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('resolves other bundled locales from their own lazy-loaded dataset', async () => {
        const en = await getEmojiDataSourceUrl('en');
        const de = await getEmojiDataSourceUrl('de');

        expect(en).not.toBe(de);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('prefers a registered locale over the bundled/CDN fallback', async () => {
        registerEmojiLocale('xx', [{ fake: true }]);

        const url = await getEmojiDataSourceUrl('xx');

        expect(url).toBe('blob:mock-url-1');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches an unregistered, non-bundled locale from the CDN', async () => {
        (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve([{ from: 'cdn' }]) });

        const url = await getEmojiDataSourceUrl('pt');

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pt/emojibase/data.json'));
        expect(url).toBe('blob:mock-url-1');
    });

    it('falls back to the default locale when the CDN fetch fails', async () => {
        (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

        const url = await getEmojiDataSourceUrl('zz');
        const en = await getEmojiDataSourceUrl('en');

        expect(url).toBe(en);
    });
});
