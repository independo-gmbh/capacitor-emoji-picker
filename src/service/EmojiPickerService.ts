import { ErrorCodes } from '../core/error-codes';
import type { EmojiPickerOptions, EmojiPickerResult } from '../definitions';

/** Platform abstraction used by the service layer. */
export interface EmojiPickerPlatform {
    /** Presents the platform-specific picker and resolves with the selected emoji. */
    present(options?: EmojiPickerOptions): Promise<EmojiPickerResult>;
}

/** Orchestrates platform calls and guards against overlapping presentations. */
export class EmojiPickerService {
    /** Platform adapter that performs the actual presentation. */
    private readonly platform: EmojiPickerPlatform;
    /** Whether a picker is currently being presented. */
    private isPresenting = false;

    public constructor(platform: EmojiPickerPlatform) {
        this.platform = platform;
    }

    /** Presents the picker, rejecting a second concurrent call instead of overlapping pickers. */
    public async present(options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        if (this.isPresenting) {
            throw new Error(ErrorCodes.ALREADY_PRESENTING);
        }

        this.isPresenting = true;
        try {
            return await this.platform.present(options);
        } finally {
            this.isPresenting = false;
        }
    }
}
