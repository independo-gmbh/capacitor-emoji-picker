import { Capacitor } from '@capacitor/core';

import type { EmojiPickerElement } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { registerNativeWebBridge } from '../../../src/platform/web/nativeWebBridge';

const ANIMATION_MS = 200;
const flush = () => Promise.resolve();

async function advancePastCloseAnimation(): Promise<void> {
    jest.advanceTimersByTime(ANIMATION_MS);
    await flush();
}

function createFakePicker(): EmojiPickerElement {
    return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
}

describe('registerNativeWebBridge', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
        delete (window as unknown as Record<string, unknown>).__CapacitorEmojiPickerPresentWeb;
        delete (window as unknown as Record<string, unknown>).__CapacitorEmojiPickerDismissWeb;
        delete (window as unknown as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge;
        delete (window as unknown as Record<string, unknown>).webkit;
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('does not register bridge functions outside a native platform', () => {
        (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);

        registerNativeWebBridge();

        expect(window.__CapacitorEmojiPickerPresentWeb).toBeUndefined();
    });

    it('reports the selected emoji back through the Android bridge object', async () => {
        const picker = createFakePicker();
        const onWebResult = jest.fn();
        (window as unknown as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge = { onWebResult };

        registerNativeWebBridge(() => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) }));
        window.__CapacitorEmojiPickerPresentWeb?.('req-1', JSON.stringify({ dismissOnBackdropTap: true }));
        await flush();

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await advancePastCloseAnimation();
        await flush();

        expect(onWebResult).toHaveBeenCalledWith('req-1', '😀', null);
    });

    it('reports a null emoji through the iOS message handler when dismissed via the dismiss bridge function', async () => {
        const picker = createFakePicker();
        const postMessage = jest.fn();
        (window as unknown as Record<string, unknown>).webkit = { messageHandlers: { capacitorEmojiPickerBridge: { postMessage } } };

        registerNativeWebBridge(() => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) }));
        window.__CapacitorEmojiPickerPresentWeb?.('req-2', JSON.stringify({}));
        await flush();

        window.__CapacitorEmojiPickerDismissWeb?.('req-2');
        await advancePastCloseAnimation();
        await flush();

        expect(postMessage).toHaveBeenCalledWith({ requestId: 'req-2', emoji: null, error: null });
    });

    it('reports NOT_IMPLEMENTED when the picker element fails to load', async () => {
        const onWebResult = jest.fn();
        (window as unknown as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge = { onWebResult };

        registerNativeWebBridge(
            () => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.reject(new Error('boom')) })
        );
        window.__CapacitorEmojiPickerPresentWeb?.('req-3', JSON.stringify({}));
        await flush();
        await flush();
        await flush();

        expect(onWebResult).toHaveBeenCalledWith('req-3', null, 'NOT_IMPLEMENTED');
    });

    it('reports NOT_IMPLEMENTED synchronously without throwing when given malformed JSON', () => {
        const onWebResult = jest.fn();
        (window as unknown as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge = { onWebResult };

        registerNativeWebBridge();

        expect(() => window.__CapacitorEmojiPickerPresentWeb?.('req-4', 'not valid json')).not.toThrow();
        expect(onWebResult).toHaveBeenCalledWith('req-4', null, 'NOT_IMPLEMENTED');
    });

    it('is idempotent across multiple calls', () => {
        registerNativeWebBridge();
        const firstFn = window.__CapacitorEmojiPickerPresentWeb;
        registerNativeWebBridge();

        expect(window.__CapacitorEmojiPickerPresentWeb).toBe(firstFn);
    });
});
