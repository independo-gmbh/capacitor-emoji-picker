import { registerPlugin } from '@capacitor/core';

import type { EmojiPickerPlugin } from './definitions';
import { registerNativeWebBridge } from './platform/web/nativeWebBridge';

export { registerEmojiLocale } from './platform/web/emoji-data-source';

const EmojiPicker = registerPlugin<EmojiPickerPlugin>('EmojiPicker', {
    web: () => import('./web').then((m) => new m.EmojiPickerWeb()),
});

registerNativeWebBridge();

export * from './definitions';
export { EmojiPicker };
