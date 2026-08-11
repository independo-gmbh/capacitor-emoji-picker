import type { EmojiPickerOptions, EmojiPickerResult } from '../../definitions';
import type { EmojiPickerPlatform } from '../../service/EmojiPickerService';
import { WebEmojiPickerPresenter } from './WebEmojiPickerPresenter';

/** Web adapter that presents `emoji-picker-element` in a backdrop. */
export class EmojiPickerWebAdapter implements EmojiPickerPlatform {
    private readonly presenter: WebEmojiPickerPresenter;

    public constructor(presenter: WebEmojiPickerPresenter = new WebEmojiPickerPresenter()) {
        this.presenter = presenter;
    }

    /** Presents the web picker. `options` is unused: web has no separate native/web mode. */
    public present(_options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        return this.presenter.present();
    }
}
