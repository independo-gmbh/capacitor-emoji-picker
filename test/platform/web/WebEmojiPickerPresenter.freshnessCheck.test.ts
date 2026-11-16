import type { EmojiPickerOptions } from '../../../src/definitions';
import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

const CDN_DATA_SOURCE = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json';

/**
 * Rejections of promises nothing awaits, delivered the way a browser delivers `unhandledrejection`
 * to a listener the host app registered at bootstrap, before any picker existed. jsdom doesn't
 * dispatch `unhandledrejection` itself, so the fake database below reports its fire-and-forget
 * update promise here instead.
 */
const hostRejections: unknown[] = [];
function trackFireAndForget(promise: Promise<unknown>): void {
    promise.catch((reason) => hostRejections.push(reason));
}

/** Locales whose IndexedDB already holds emoji data, shared by every fake database (as IndexedDB is). */
const populatedLocales = new Set<string>();
/** Every data source a fake database was created with. */
const databaseDataSources: string[] = [];

/**
 * Mirrors `emoji-picker-element`'s `Database#_init`: with no cached data it awaits a full `GET`;
 * with cached data it starts `checkForUpdates` - a `HEAD` request to the data source - and never
 * awaits it (`this._lazyUpdate = checkForUpdates(db, dataSource)`).
 */
class FakeDatabase {
    private readonly readyPromise: Promise<void>;

    public constructor({ locale = 'en', dataSource = CDN_DATA_SOURCE }: { locale?: string; dataSource?: string } = {}) {
        databaseDataSources.push(dataSource);
        this.readyPromise = this.init(locale, dataSource);
    }

    private async init(locale: string, dataSource: string): Promise<void> {
        if (populatedLocales.has(locale)) {
            trackFireAndForget(fetch(dataSource, { method: 'HEAD' }));
            return;
        }
        const response = await fetch(dataSource);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${dataSource}`);
        }
        populatedLocales.add(locale);
    }

    public ready(): Promise<void> {
        return this.readyPromise;
    }

    public async setPreferredSkinTone(_skinTone: number): Promise<void> {
        await this.ready();
    }
}

jest.mock('emoji-picker-element/database', () => ({ __esModule: true, default: FakeDatabase }));

/** Stands in for `<emoji-picker>`: creates its database in a microtask, as the real element does. */
jest.mock('emoji-picker-element', () => {
    class FakeEmojiPicker extends HTMLElement {
        public locale = 'en';
        public dataSource = CDN_DATA_SOURCE;

        public constructor() {
            super();
            queueMicrotask(() => new FakeDatabase({ locale: this.locale, dataSource: this.dataSource }));
        }
    }
    if (!customElements.get('emoji-picker')) {
        customElements.define('emoji-picker', FakeEmojiPicker);
    }
    return {};
});

/**
 * `fetch` per the Fetch standard's scheme rules, with no network: a `blob:` URL answers only `GET`
 * (any other method is a network error, a `TypeError`), a `data:` URL answers every method, and
 * anything over HTTP fails as it does offline.
 */
function offlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const ok = { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
    if (url.startsWith('data:') || (url.startsWith('blob:') && method === 'GET')) {
        return Promise.resolve(ok);
    }
    return Promise.reject(new TypeError('Failed to fetch'));
}

async function openAndPick(presenter: WebEmojiPickerPresenter, options: EmojiPickerOptions = {}): Promise<void> {
    const databasesBefore = databaseDataSources.length;
    const result = presenter.present(options);
    // Waits for the data source to resolve (the bundled dataset loads lazily) and the picker's
    // database to start before the user picks.
    for (let i = 0; i < 500 && databaseDataSources.length === databasesBefore; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    document.querySelector('emoji-picker')?.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
    await expect(result).resolves.toEqual({ emoji: '😀' });
}

/** Gives the fire-and-forget freshness check time to settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('WebEmojiPickerPresenter dataset freshness check', () => {
    beforeEach(() => {
        hostRejections.length = 0;
        databaseDataSources.length = 0;
        populatedLocales.clear();
        (global.fetch as unknown) = jest.fn(offlineFetch);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('raises no unhandled rejection when the picker reopens on cached data', async () => {
        const presenter = new WebEmojiPickerPresenter();

        await openAndPick(presenter);
        await openAndPick(presenter);
        await settle();

        expect(fetch).toHaveBeenCalledWith(expect.any(String), { method: 'HEAD' });
        expect(hostRejections).toEqual([]);
    });

    it('seeds the skin tone against the bundled dataset, offline and without an unhandled rejection', async () => {
        const presenter = new WebEmojiPickerPresenter();

        await openAndPick(presenter, { skinTone: 2 });
        await openAndPick(presenter, { skinTone: 2 });
        await settle();

        expect(databaseDataSources).not.toContain(CDN_DATA_SOURCE);
        expect(hostRejections).toEqual([]);
    });

    it('detects a rejection when the data source is a blob: URL (negative control)', async () => {
        const presenter = new WebEmojiPickerPresenter({ getDataSourceUrl: async (locale) => ({ locale, url: 'blob:x' }) });

        await openAndPick(presenter);
        await openAndPick(presenter);
        await settle();

        expect(hostRejections).toHaveLength(1);
    });
});
