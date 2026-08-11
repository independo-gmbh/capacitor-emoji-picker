import { WebPlugin } from '@capacitor/core';

import { EmojiPickerWebAdapter } from './platform/web/EmojiPickerWebAdapter';
import type { EmojiPickerOptions, EmojiPickerPlugin, EmojiPickerResult } from './definitions';
import { EmojiPickerService } from './service/EmojiPickerService';

/** Web implementation of the EmojiPicker Capacitor plugin. */
export class EmojiPickerWeb extends WebPlugin implements EmojiPickerPlugin {
    /** Service layer that guards against overlapping presentations. */
    private readonly service = new EmojiPickerService(new EmojiPickerWebAdapter());

    /** Presents the web picker. */
    public present(options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        return this.service.present(options);
    }
}
