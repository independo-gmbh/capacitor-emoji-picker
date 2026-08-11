import { ErrorCodes } from '../../src/core/error-codes';
import type { EmojiPickerOptions, EmojiPickerResult } from '../../src/definitions';
import { EmojiPickerService, type EmojiPickerPlatform } from '../../src/service/EmojiPickerService';

class DeferredPlatform implements EmojiPickerPlatform {
    private resolvers: Array<(result: EmojiPickerResult) => void> = [];
    private rejecters: Array<(error: unknown) => void> = [];

    public present(_options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        return new Promise((resolve, reject) => {
            this.resolvers.push(resolve);
            this.rejecters.push(reject);
        });
    }

    public resolveLatest(result: EmojiPickerResult): void {
        this.resolvers.pop()?.(result);
    }

    public rejectLatest(error: unknown): void {
        this.rejecters.pop()?.(error);
    }
}

describe('EmojiPickerService', () => {
    it('rejects a second concurrent present() call with ALREADY_PRESENTING', async () => {
        const platform = new DeferredPlatform();
        const service = new EmojiPickerService(platform);

        const first = service.present();
        await expect(service.present()).rejects.toThrow(ErrorCodes.ALREADY_PRESENTING);

        platform.resolveLatest({ emoji: '😀' });
        await expect(first).resolves.toEqual({ emoji: '😀' });
    });

    it('allows a new present() call once the previous one resolves', async () => {
        const platform = new DeferredPlatform();
        const service = new EmojiPickerService(platform);

        const first = service.present();
        platform.resolveLatest({ emoji: null });
        await expect(first).resolves.toEqual({ emoji: null });

        const second = service.present();
        platform.resolveLatest({ emoji: '🎉' });
        await expect(second).resolves.toEqual({ emoji: '🎉' });
    });

    it('allows a new present() call once the previous one rejects', async () => {
        const platform = new DeferredPlatform();
        const service = new EmojiPickerService(platform);

        const first = service.present();
        platform.rejectLatest(new Error(ErrorCodes.NOT_IMPLEMENTED));
        await expect(first).rejects.toThrow(ErrorCodes.NOT_IMPLEMENTED);

        const second = service.present();
        platform.resolveLatest({ emoji: '🎉' });
        await expect(second).resolves.toEqual({ emoji: '🎉' });
    });

    it('propagates platform errors unchanged', async () => {
        const platform = new DeferredPlatform();
        const service = new EmojiPickerService(platform);

        const first = service.present();
        platform.rejectLatest(new Error(ErrorCodes.NOT_IMPLEMENTED));
        await expect(first).rejects.toThrow(ErrorCodes.NOT_IMPLEMENTED);
    });
});
