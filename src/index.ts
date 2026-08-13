import { registerPlugin } from '@capacitor/core';

import type { EmojiPickerPlugin } from './definitions';
import { registerNativeWebBridge } from './platform/web/nativeWebBridge';

const EmojiPicker = registerPlugin<EmojiPickerPlugin>('EmojiPicker', {
    web: () => import('./web').then((m) => new m.EmojiPickerWeb()),
});

registerNativeWebBridge();

export * from './definitions';
export { EmojiPicker };
