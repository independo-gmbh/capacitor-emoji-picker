import { ErrorCodes } from '../../../src/core/error-codes';
import { EmojiPickerWebAdapter } from '../../../src/platform/web/EmojiPickerWebAdapter';

describe('EmojiPickerWebAdapter', () => {
    it('rejects with NOT_IMPLEMENTED until the web picker is implemented', async () => {
        const adapter = new EmojiPickerWebAdapter();
        await expect(adapter.present()).rejects.toThrow(ErrorCodes.NOT_IMPLEMENTED);
    });
});
