import { ErrorCodes } from '../../core/error-codes';
import type { EmojiPickerOptions, EmojiPickerResult } from '../../definitions';
import type { EmojiPickerPlatform } from '../../service/EmojiPickerService';

/**
 * Web adapter that will delegate to `emoji-picker-element`.
 *
 * The actual browser presentation is implemented separately; for now this adapter rejects so the
 * bridge and service wiring can be verified end-to-end.
 */
export class EmojiPickerWebAdapter implements EmojiPickerPlatform {
    /** Presents the web picker. Not implemented yet. */
    public present(_options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        return Promise.reject(new Error(ErrorCodes.NOT_IMPLEMENTED));
    }
}
