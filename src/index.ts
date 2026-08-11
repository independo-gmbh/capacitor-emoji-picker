import { registerPlugin } from '@capacitor/core';

import type { EmojiPickerPlugin } from './definitions';

const EmojiPicker = registerPlugin<EmojiPickerPlugin>('EmojiPicker', {
    web: () => import('./web').then((m) => new m.EmojiPickerWeb()),
});

export * from './definitions';
export { EmojiPicker };
