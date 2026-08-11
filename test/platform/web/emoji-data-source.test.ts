import { getBundledEmojiDataSourceUrl } from '../../../src/platform/web/emoji-data-source';

describe('getBundledEmojiDataSourceUrl', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    it('creates and caches a blob URL for the bundled dataset', () => {
        const first = getBundledEmojiDataSourceUrl();
        const second = getBundledEmojiDataSourceUrl();

        expect(first).toBe('blob:mock-url');
        expect(second).toBe('blob:mock-url');
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });
});
