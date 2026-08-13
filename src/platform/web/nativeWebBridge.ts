import { Capacitor } from '@capacitor/core';

import type { EmojiPickerOptions } from '../../definitions';
import { ErrorCodes } from '../../core/error-codes';
import { WebEmojiPickerPresenter } from './WebEmojiPickerPresenter';

declare global {
    interface Window {
        __CapacitorEmojiPickerPresentWeb?: (requestId: string, optionsJson: string) => void;
        __CapacitorEmojiPickerDismissWeb?: (requestId: string) => void;
        CapacitorEmojiPickerAndroidBridge?: {
            onWebResult: (requestId: string, emoji: string | null, error: string | null) => void;
        };
        webkit?: {
            messageHandlers?: {
                capacitorEmojiPickerBridge?: {
                    postMessage: (message: { requestId: string; emoji: string | null; error: string | null }) => void;
                };
            };
        };
    }
}

function reportResult(requestId: string, emoji: string | null, error: string | null): void {
    if (window.CapacitorEmojiPickerAndroidBridge) {
        window.CapacitorEmojiPickerAndroidBridge.onWebResult(requestId, emoji, error);
        return;
    }
    window.webkit?.messageHandlers?.capacitorEmojiPickerBridge?.postMessage({ requestId, emoji, error });
}

/**
 * Maps an arbitrary thrown error message to a canonical error code. Only known codes are ever
 * passed through as-is; anything else (a raw JS error message, for example) is not a documented
 * error code and must not leak to callers as if it were one.
 */
function toErrorCode(message: string): string {
    return message === ErrorCodes.NOT_IMPLEMENTED ? message : ErrorCodes.NOT_IMPLEMENTED;
}

/**
 * Registers the native↔JS bridge iOS/Android use when a caller explicitly requests
 * `presentation: 'web'`: native evaluates `window.__CapacitorEmojiPickerPresentWeb` to run the
 * same bottom-sheet picker used in pure-browser contexts inside the app's own webview, and
 * this reports the outcome back over whichever platform bridge object is present. No-op outside
 * a native platform (there's nothing to report back to) and safe to call more than once.
 */
export function registerNativeWebBridge(createPresenter: () => WebEmojiPickerPresenter = () => new WebEmojiPickerPresenter()): void {
    if (!Capacitor.isNativePlatform() || window.__CapacitorEmojiPickerPresentWeb) {
        return;
    }

    const pending = new Map<string, AbortController>();

    window.__CapacitorEmojiPickerPresentWeb = (requestId: string, optionsJson: string) => {
        try {
            const options: EmojiPickerOptions = optionsJson ? JSON.parse(optionsJson) : {};
            const controller = new AbortController();
            pending.set(requestId, controller);

            createPresenter()
                .present(options, { signal: controller.signal })
                .then((result) => {
                    pending.delete(requestId);
                    reportResult(requestId, result.emoji, null);
                })
                .catch((error: Error) => {
                    pending.delete(requestId);
                    reportResult(requestId, null, toErrorCode(error.message));
                });
        } catch {
            reportResult(requestId, null, ErrorCodes.NOT_IMPLEMENTED);
        }
    };

    window.__CapacitorEmojiPickerDismissWeb = (requestId: string) => {
        pending.get(requestId)?.abort();
        pending.delete(requestId);
    };
}
