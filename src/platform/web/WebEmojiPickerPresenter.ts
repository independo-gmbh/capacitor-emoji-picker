import { ErrorCodes } from '../../core/error-codes';
import type { EmojiPickerResult } from '../../definitions';
import { getBundledEmojiDataSourceUrl } from './emoji-data-source';

/** Minimal shape of the `<emoji-picker>` custom element this presenter depends on. */
export interface EmojiPickerElement extends HTMLElement {
    dataSource: string;
}

/** Registers `<emoji-picker>` (if needed) and creates the element. */
async function defaultCreatePickerElement(): Promise<EmojiPickerElement> {
    try {
        await import('emoji-picker-element');
        return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
    } catch {
        throw new Error(ErrorCodes.NOT_IMPLEMENTED);
    }
}

/**
 * `emoji-picker-element`'s internal `Database` runs a background `fetch(dataSource, { method: 'HEAD' })`
 * freshness check whenever it already has cached data for the locale (i.e. on the second+ open in a
 * session). Non-`GET` requests to `blob:` URLs always throw `TypeError` per the Fetch spec, and this
 * internal call isn't awaited, so it otherwise surfaces as a noisy but harmless `unhandledrejection`.
 * This filters out only that specific rejection shape while a picker is open, letting everything else
 * propagate normally to the host app.
 */
function isKnownBlobHeadCheckRejection(reason: unknown): boolean {
    if (!(reason instanceof TypeError) || !reason.message.includes('Failed to fetch')) {
        return false;
    }
    return reason.stack?.includes('getETag') ?? false;
}

export interface WebEmojiPickerPresenterOptions {
    /** Creates the picker element. Overridable for testing. */
    createPickerElement?: () => Promise<EmojiPickerElement>;
}

/**
 * Presents `emoji-picker-element` in a backdrop and resolves with the selected emoji.
 *
 * Kept independent of the Capacitor web plugin registration so native-platform fallback
 * orchestration (issue #6) can present the same web picker from inside a native WebView.
 */
export class WebEmojiPickerPresenter {
    private readonly createPickerElement: () => Promise<EmojiPickerElement>;

    public constructor(options: WebEmojiPickerPresenterOptions = {}) {
        this.createPickerElement = options.createPickerElement ?? defaultCreatePickerElement;
    }

    public async present(): Promise<EmojiPickerResult> {
        let picker: EmojiPickerElement;
        try {
            picker = await this.createPickerElement();
            picker.dataSource = getBundledEmojiDataSourceUrl();
        } catch {
            throw new Error(ErrorCodes.NOT_IMPLEMENTED);
        }
        picker.style.width = 'min(100%, 22rem)';
        picker.style.maxHeight = '80vh';

        const backdrop = document.createElement('div');
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-label', 'Emoji picker');
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.style.background = 'rgba(0, 0, 0, 0.4)';
        backdrop.style.zIndex = '2147483647';

        return new Promise<EmojiPickerResult>((resolve) => {
            let settled = false;
            let pointerDownOnBackdrop = false;

            const previouslyFocusedElement = document.activeElement as HTMLElement | null;
            const previousBodyOverflow = document.body.style.overflow;

            // Make the rest of the page inert while the picker is open, so assistive tech
            // doesn't navigate into content hidden behind the modal backdrop.
            const siblings = Array.from(document.body.children).filter((child) => child !== backdrop);
            for (const sibling of siblings) {
                // `inert` may not be present in older TS DOM lib snapshots; it is a standard
                // boolean IDL property in modern browsers.
                (sibling as HTMLElement & { inert: boolean }).inert = true;
            }

            const onUnhandledRejection = (event: PromiseRejectionEvent) => {
                if (isKnownBlobHeadCheckRejection(event.reason)) {
                    event.preventDefault();
                }
            };

            const settle = (result: EmojiPickerResult) => {
                if (settled) {
                    return;
                }
                settled = true;
                picker.removeEventListener('emoji-click', onEmojiClick as EventListener);
                backdrop.removeEventListener('click', onBackdropClick);
                backdrop.removeEventListener('pointerdown', onBackdropPointerDown);
                document.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('unhandledrejection', onUnhandledRejection);

                for (const sibling of siblings) {
                    (sibling as HTMLElement & { inert: boolean }).inert = false;
                }
                document.body.style.overflow = previousBodyOverflow;

                backdrop.remove();

                if (previouslyFocusedElement instanceof HTMLElement && document.contains(previouslyFocusedElement)) {
                    previouslyFocusedElement.focus?.();
                }

                resolve(result);
            };

            const onEmojiClick = (event: CustomEvent<{ unicode?: string }>) => {
                settle({ emoji: event.detail.unicode ?? null });
            };

            const onBackdropPointerDown = (event: PointerEvent) => {
                pointerDownOnBackdrop = event.target === backdrop;
            };

            const onBackdropClick = (event: MouseEvent) => {
                if (event.target === backdrop && pointerDownOnBackdrop) {
                    settle({ emoji: null });
                }
            };

            const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    settle({ emoji: null });
                }
            };

            picker.addEventListener('emoji-click', onEmojiClick as EventListener);
            backdrop.addEventListener('pointerdown', onBackdropPointerDown);
            backdrop.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKeyDown);
            window.addEventListener('unhandledrejection', onUnhandledRejection);

            backdrop.appendChild(picker);
            document.body.appendChild(backdrop);
            document.body.style.overflow = 'hidden';

            picker.focus?.();
        });
    }
}
