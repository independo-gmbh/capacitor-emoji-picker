import type { getEmojiDataSourceUrl as GetEmojiDataSourceUrl, registerEmojiLocale as RegisterEmojiLocale } from '../../../src/platform/web/emoji-data-source';

/** Decodes the dataset a `data:application/json;base64,...` URL carries. */
function decodeDataUrl(url: string): unknown {
    const [header, payload] = url.split(',', 2);
    expect(header).toBe('data:application/json;base64');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

describe('getEmojiDataSourceUrl', () => {
    let getEmojiDataSourceUrl: typeof GetEmojiDataSourceUrl;
    let registerEmojiLocale: typeof RegisterEmojiLocale;

    beforeEach(async () => {
        jest.resetModules();
        ({ getEmojiDataSourceUrl, registerEmojiLocale } = await import('../../../src/platform/web/emoji-data-source'));

        (global.fetch as unknown) = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    });

    /** Makes the `data:` capability probe succeed and every other request answer `response`. */
    const mockCdn = (response: unknown): void => {
        (fetch as jest.Mock).mockImplementation((url: string) =>
            String(url).startsWith('data:') ? Promise.resolve({ ok: true, status: 200 }) : Promise.resolve(response)
        );
    };

    /** Calls to `fetch` other than the one-time `data:` capability probe. */
    const nonProbeCalls = (): unknown[][] => (fetch as jest.Mock).mock.calls.filter(([url]) => !String(url).startsWith('data:'));

    it('creates and caches a data URL per locale for the default (bundled) locale', async () => {
        const { default: bundled } = await import('emoji-picker-element-data/en/emojibase/data.json');
        const encode = jest.spyOn(FileReader.prototype, 'readAsDataURL');

        const first = (await getEmojiDataSourceUrl()).url;
        const second = (await getEmojiDataSourceUrl('en')).url;

        expect(decodeDataUrl(first)).toEqual(bundled);
        expect(second).toBe(first);
        expect(encode).toHaveBeenCalledTimes(1);
        expect(nonProbeCalls()).toEqual([]);
        encode.mockRestore();
    });

    it('fetches a non-default, unregistered locale from the CDN rather than bundling it', async () => {
        mockCdn({ ok: true, json: () => Promise.resolve([{ from: 'cdn' }]) });

        const de = (await getEmojiDataSourceUrl('de')).url;

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/de/'));
        expect(decodeDataUrl(de)).toEqual([{ from: 'cdn' }]);
    });

    it('prefers a registered locale over the CDN fallback', async () => {
        registerEmojiLocale('xx', [{ fake: true, annotation: 'grinning face', emoji: '😀' }]);

        const url = (await getEmojiDataSourceUrl('xx')).url;

        expect(decodeDataUrl(url)).toEqual([{ fake: true, annotation: 'grinning face', emoji: '😀' }]);
        expect(nonProbeCalls()).toEqual([]);
    });

    it('gives the same dataset the same URL, and a re-registered dataset a new one', async () => {
        registerEmojiLocale('xx', [{ version: 1 }]);
        const first = (await getEmojiDataSourceUrl('xx')).url;
        registerEmojiLocale('xx', [{ version: 1 }]);
        const same = (await getEmojiDataSourceUrl('xx')).url;
        registerEmojiLocale('xx', [{ version: 2 }]);
        const changed = (await getEmojiDataSourceUrl('xx')).url;

        expect(same).toBe(first);
        expect(changed).not.toBe(first);
        expect(decodeDataUrl(changed)).toEqual([{ version: 2 }]);
    });

    it('fetches an unregistered, non-bundled locale from the CDN', async () => {
        mockCdn({ ok: true, json: () => Promise.resolve([{ from: 'cdn' }]) });

        const url = (await getEmojiDataSourceUrl('pt')).url;

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pt/emojibase/data.json'));
        expect(decodeDataUrl(url)).toEqual([{ from: 'cdn' }]);
    });

    it('falls back to the default locale when the CDN fetch fails', async () => {
        mockCdn({ ok: false, status: 404 });

        const url = (await getEmojiDataSourceUrl('zz')).url;
        const en = (await getEmojiDataSourceUrl('en')).url;

        expect(url).toBe(en);
    });

    it('reports the locale it actually serves', async () => {
        registerEmojiLocale('xx', [{ fake: true }]);

        expect((await getEmojiDataSourceUrl('xx')).locale).toBe('xx');
        expect((await getEmojiDataSourceUrl()).locale).toBe('en');
    });

    it('reports the default locale when an unregistered locale falls back because the CDN fails', async () => {
        (fetch as jest.Mock).mockImplementation((url: string) =>
            String(url).startsWith('data:') ? Promise.resolve({ ok: true, status: 200 }) : Promise.reject(new TypeError('Failed to fetch'))
        );

        const resolved = await getEmojiDataSourceUrl('de');
        const en = await getEmojiDataSourceUrl('en');

        expect(resolved.locale).toBe('en');
        expect(resolved.url).toBe(en.url);
    });

    describe('data: URL capability probe', () => {
        const probeCalls = (): unknown[][] => (fetch as jest.Mock).mock.calls.filter(([url]) => String(url).startsWith('data:'));

        it('serves a data: URL when the page may fetch data: URLs', async () => {
            const { url } = await getEmojiDataSourceUrl('en');

            expect(url.startsWith('data:')).toBe(true);
            expect(probeCalls()[0]).toEqual([expect.stringMatching(/^data:/), { method: 'HEAD' }]);
        });

        it('falls back to a blob: object URL when a CSP forbids data: URLs in connect-src', async () => {
            (fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
            const createObjectURL = jest.fn(() => 'blob:http://localhost/dataset');
            (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;

            const { url, locale } = await getEmojiDataSourceUrl('en');

            expect(url).toBe('blob:http://localhost/dataset');
            expect(locale).toBe('en');
            expect(createObjectURL).toHaveBeenCalledTimes(1);
            delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
        });

        it('probes only once per session, however many locales are resolved', async () => {
            registerEmojiLocale('xx', [{ fake: true }]);
            registerEmojiLocale('yy', [{ fake: true }]);

            await getEmojiDataSourceUrl('en');
            await getEmojiDataSourceUrl('xx');
            await getEmojiDataSourceUrl('yy');
            await getEmojiDataSourceUrl('en');

            expect(probeCalls()).toHaveLength(1);
        });

        it('probes once even when locales are resolved concurrently', async () => {
            registerEmojiLocale('xx', [{ fake: true }]);

            await Promise.all([getEmojiDataSourceUrl('en'), getEmojiDataSourceUrl('xx')]);

            expect(probeCalls()).toHaveLength(1);
        });
    });
});

describe('bundled en dataset loading', () => {
    it('is not loaded until the en dataset is resolved', async () => {
        jest.resetModules();
        (global.fetch as unknown) = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        const loaded = jest.fn();
        jest.doMock('emoji-picker-element-data/en/emojibase/data.json', () => {
            loaded();
            return { __esModule: true, default: [{ emoji: '😀' }] };
        });
        const { getEmojiDataSourceUrl, registerEmojiLocale } = await import('../../../src/platform/web/emoji-data-source');
        registerEmojiLocale('xx', [{ fake: true }]);
        await getEmojiDataSourceUrl('xx');
        expect(loaded).not.toHaveBeenCalled();

        await getEmojiDataSourceUrl('en');
        expect(loaded).toHaveBeenCalledTimes(1);
        jest.dontMock('emoji-picker-element-data/en/emojibase/data.json');
    });
});
