import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

/** Every database the fake `<emoji-picker>` created, with the data source it was created for. */
const databases: { locale: string; dataSource: string }[] = [];

/**
 * Stands in for `emoji-picker-element`, keeping the one behaviour this test is about: the
 * constructor queues the creation of the database in a microtask, with the CDN default unless
 * `locale` and `dataSource` are set before it runs.
 */
jest.mock('emoji-picker-element', () => {
    class FakeEmojiPicker extends HTMLElement {
        public locale = 'en';
        public dataSource = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json';

        public constructor() {
            super();
            queueMicrotask(() => databases.push({ locale: this.locale, dataSource: this.dataSource }));
        }
    }
    if (!customElements.get('emoji-picker')) {
        customElements.define('emoji-picker', FakeEmojiPicker);
    }
    return {};
});

const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
    }
};

describe('WebEmojiPickerPresenter with the real element factory', () => {
    afterEach(() => {
        databases.length = 0;
        document.body.innerHTML = '';
    });

    it('creates the picker database from the resolved data source only, never from the CDN default', async () => {
        const presenter = new WebEmojiPickerPresenter({
            // A real resolution yields at least once before the URL is known.
            getDataSourceUrl: async (locale) => {
                await Promise.resolve();
                return `blob:${locale}`;
            },
        });

        void presenter.present({ locale: 'de' });
        await flush();

        expect(databases).toEqual([{ locale: 'de', dataSource: 'blob:de' }]);
    });
});
