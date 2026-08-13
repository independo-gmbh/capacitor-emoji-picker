import type { EmojiPickerResult } from '../../../src/definitions';
import { EmojiPickerWebAdapter } from '../../../src/platform/web/EmojiPickerWebAdapter';
import type { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

describe('EmojiPickerWebAdapter', () => {
    it('delegates present() to the web presenter, forwarding options', async () => {
        const result: EmojiPickerResult = { emoji: '😀' };
        const presenter = { present: jest.fn().mockResolvedValue(result) } as unknown as WebEmojiPickerPresenter;
        const adapter = new EmojiPickerWebAdapter(presenter);

        const options = { presentation: 'web' as const, dismissOnBackdropTap: false };
        await expect(adapter.present(options)).resolves.toEqual(result);
        expect(presenter.present).toHaveBeenCalledTimes(1);
        expect(presenter.present).toHaveBeenCalledWith(options);
    });
});
