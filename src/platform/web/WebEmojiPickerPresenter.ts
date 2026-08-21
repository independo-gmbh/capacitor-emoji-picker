import { ErrorCodes } from '../../core/error-codes';
import type {
    EmojiPickerBackdropOptions,
    EmojiPickerCloseButtonOptions,
    EmojiPickerOptions,
    EmojiPickerResult,
    EmojiPickerTheme,
} from '../../definitions';
import { getEmojiDataSourceUrl } from './emoji-data-source';

/** Minimal shape of the `<emoji-picker>` custom element this presenter depends on. */
export interface EmojiPickerElement extends HTMLElement {
    dataSource: string;
    locale: string;
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

const SHEET_STYLE_ELEMENT_ID = 'emoji-picker-sheet-styles';
const ANIMATION_MS = 200;

/** Injects the bottom-sheet stylesheet into `document.head`, once per document. */
function ensureSheetStylesInjected(): void {
    if (document.getElementById(SHEET_STYLE_ELEMENT_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = SHEET_STYLE_ELEMENT_ID;
    style.textContent = `
        dialog.emoji-picker-sheet {
            position: fixed;
            inset: auto 0 0 0;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            width: 100%;
            max-width: 30rem;
            height: min(30rem, 80vh);
            max-height: 80vh;
            padding: 0 max(0.5rem, env(safe-area-inset-right, 0px)) max(0.5rem, env(safe-area-inset-bottom, 0px))
                max(0.5rem, env(safe-area-inset-left, 0px));
            border: none;
            border-radius: 1rem 1rem 0 0;
            overflow: hidden;
            transform: translateY(100%);
            transition: transform ${ANIMATION_MS}ms ease-out;
        }
        /*
         * Explicit colors rather than the \`Canvas\`/\`CanvasText\` system-color keywords: those rely
         * on the UA knowing the page's color-scheme, which isn't reliably signaled inside a
         * Capacitor WKWebView, so they were silently staying light-only regardless of the resolved
         * theme. Values match emoji-picker-element's own light/dark defaults so the seam between
         * the sheet chrome and the picker itself stays invisible.
         */
        dialog.emoji-picker-sheet--light {
            background-color: #fff;
            color: #1f1f1f;
        }
        dialog.emoji-picker-sheet--dark {
            background-color: #222;
            color: #e8e8e8;
        }
        dialog.emoji-picker-sheet[data-state='open'] {
            transform: translateY(0);
        }
        .emoji-picker-sheet__header {
            flex: 0 0 auto;
            display: flex;
            padding-block: 0.5rem;
        }
        .emoji-picker-sheet__close {
            border: none;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.06);
            color: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            cursor: pointer;
        }
        dialog.emoji-picker-sheet--dark .emoji-picker-sheet__close {
            background: rgba(255, 255, 255, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
            dialog.emoji-picker-sheet {
                transition: none;
            }
        }
    `;
    document.head.appendChild(style);
}

const DEFAULT_BACKDROP_COLOR = '#00000066';
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
let backdropStyleCounter = 0;

/** Validates a `#RGB`/`#RRGGBB`/`#RRGGBBAA` hex color, falling back to the default on any other input. */
function resolveBackdropColor(color: string | undefined): string {
    if (color !== undefined && HEX_COLOR_PATTERN.test(color)) {
        return color;
    }
    return DEFAULT_BACKDROP_COLOR;
}

/** Injects a one-off `::backdrop` rule scoped to a unique class, since inline styles can't target it. */
function injectBackdropStyle(options: EmojiPickerBackdropOptions): { className: string; remove: () => void } {
    const className = `emoji-picker-backdrop-${++backdropStyleCounter}`;
    const color = resolveBackdropColor(options.color);
    const blur = options.blur ?? 0;
    const style = document.createElement('style');
    // `backdrop-filter` is always set explicitly, never omitted: some browsers (e.g. Safari/WKWebView)
    // apply their own default blur to a <dialog>'s ::backdrop in their UA stylesheet, which would
    // otherwise leak through unopposed whenever the caller doesn't request blur.
    style.textContent = `
        dialog.${className}::backdrop {
            background: ${color};
            backdrop-filter: ${blur > 0 ? `blur(${blur}px)` : 'none'};
        }
    `;
    document.head.appendChild(style);
    return { className, remove: () => style.remove() };
}

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resolves `system` to the OS's current light/dark preference; passes explicit themes through. */
function resolveTheme(theme: EmojiPickerTheme | undefined): 'light' | 'dark' {
    if (theme === 'light' || theme === 'dark') {
        return theme;
    }
    const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
}

/**
 * Matches the sheet's own `--light`/`--dark` background colors (see `ensureSheetStylesInjected`).
 * Set explicitly, rather than the `Canvas` system-color keyword, for the same WKWebView
 * color-scheme-detection reason documented there.
 */
const SHEET_BACKGROUND_COLOR: Record<'light' | 'dark', string> = {
    light: '#fff',
    dark: '#222',
};

const CLOSE_BUTTON_SIZE_PX: Record<NonNullable<EmojiPickerCloseButtonOptions['size']>, number> = {
    xSmall: 24,
    small: 32,
    medium: 48,
    large: 64,
};

/** An "x" glyph sized proportionally to the button, matching the iOS button's icon/button ratio. */
function createCloseIcon(buttonSizePx: number): SVGSVGElement {
    const svgNs = 'http://www.w3.org/2000/svg';
    const iconSizePx = Math.round(buttonSizePx * 0.375);
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(iconSizePx));
    svg.setAttribute('height', String(iconSizePx));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const diagonal1 = document.createElementNS(svgNs, 'line');
    diagonal1.setAttribute('x1', '5');
    diagonal1.setAttribute('y1', '5');
    diagonal1.setAttribute('x2', '19');
    diagonal1.setAttribute('y2', '19');

    const diagonal2 = document.createElementNS(svgNs, 'line');
    diagonal2.setAttribute('x1', '19');
    diagonal2.setAttribute('y1', '5');
    diagonal2.setAttribute('x2', '5');
    diagonal2.setAttribute('y2', '19');

    svg.append(diagonal1, diagonal2);
    return svg;
}

/** Builds the header row hosting the close button, or `null` when the button is hidden. */
function createCloseButtonHeader(options: EmojiPickerCloseButtonOptions): {
    header: HTMLDivElement;
    button: HTMLButtonElement;
} | null {
    if (options.hidden) {
        return null;
    }
    const sizePx = CLOSE_BUTTON_SIZE_PX[options.size ?? 'medium'];
    const position = options.position ?? 'right';

    const header = document.createElement('div');
    header.className = 'emoji-picker-sheet__header';
    header.style.justifyContent = position === 'left' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-picker-sheet__close';
    button.setAttribute('aria-label', 'Close');
    button.style.width = `${sizePx}px`;
    button.style.height = `${sizePx}px`;
    button.appendChild(createCloseIcon(sizePx));

    header.appendChild(button);
    return { header, button };
}

/**
 * Seeds `locale`'s persisted preferred skin tone via `emoji-picker-element`'s own `Database`, so
 * `<emoji-picker>` picks it up as its default on render. A no-op for `skinTone === undefined`,
 * so an already-made user choice (persisted in IndexedDB) is never overwritten.
 */
async function defaultSeedSkinTone(locale: string, skinTone: number): Promise<void> {
    const { default: Database } = await import('emoji-picker-element/database');
    const db = new Database({ locale });
    await db.setPreferredSkinTone(skinTone);
}

export interface WebEmojiPickerPresenterOptions {
    /** Creates the picker element. Overridable for testing. */
    createPickerElement?: () => Promise<EmojiPickerElement>;
    /** Seeds the locale's persisted preferred skin tone. Overridable for testing. */
    seedSkinTone?: (locale: string, skinTone: number) => Promise<void>;
    /** Resolves the `dataSource` URL for a locale. Overridable for testing. */
    getDataSourceUrl?: (locale: string) => Promise<string>;
}

/**
 * Presents `emoji-picker-element` in a bottom-sheet `<dialog>` and resolves with the selected emoji.
 *
 * Kept independent of the Capacitor web plugin registration so native-platform fallback
 * orchestration (issue #6) can present the same web picker from inside a native WebView.
 */
export class WebEmojiPickerPresenter {
    private readonly createPickerElement: () => Promise<EmojiPickerElement>;
    private readonly seedSkinTone: (locale: string, skinTone: number) => Promise<void>;
    private readonly getDataSourceUrl: (locale: string) => Promise<string>;

    public constructor(options: WebEmojiPickerPresenterOptions = {}) {
        this.createPickerElement = options.createPickerElement ?? defaultCreatePickerElement;
        this.seedSkinTone = options.seedSkinTone ?? defaultSeedSkinTone;
        this.getDataSourceUrl = options.getDataSourceUrl ?? getEmojiDataSourceUrl;
    }

    public async present(
        options: EmojiPickerOptions = {},
        presentOptions: { signal?: AbortSignal } = {}
    ): Promise<EmojiPickerResult> {
        const { signal } = presentOptions;
        const closeButtonOptions = options.closeButton ?? {};
        // A hidden close button must never leave the user with zero ways to dismiss the picker,
        // so hiding it force-enables backdrop-tap-to-dismiss regardless of what was explicitly
        // requested (mirrors the iOS presenter's `effectiveDismissOnBackdropTap`).
        const dismissOnBackdropTap = (options.dismissOnBackdropTap ?? true) || (closeButtonOptions.hidden ?? false);

        // Resolved once at open time (rather than left to each side's own live
        // `prefers-color-scheme` tracking) so the picker and the sheet chrome around it always
        // agree, fixing the mismatch from issue #19.
        const resolvedTheme = resolveTheme(options.theme);
        const locale = options.locale ?? 'en';

        if (options.skinTone !== undefined) {
            // Seeded before the element is created so its initial render already reflects it.
            await this.seedSkinTone(locale, options.skinTone);
        }

        let picker: EmojiPickerElement;
        try {
            picker = await this.createPickerElement();
            picker.locale = locale;
            picker.dataSource = await this.getDataSourceUrl(locale);
            picker.classList.add(resolvedTheme);
        } catch {
            throw new Error(ErrorCodes.NOT_IMPLEMENTED);
        }

        ensureSheetStylesInjected();

        picker.style.display = 'block';
        picker.style.width = '100%';
        picker.style.flex = '1 1 auto';
        picker.style.minHeight = '0';
        // The picker's own card look (border + background) would otherwise float as a visibly
        // smaller box inside the sheet; matching its background to the sheet's and dropping its
        // border makes it read as full width, part of the sheet rather than nested inside it.
        picker.style.setProperty('--background', SHEET_BACKGROUND_COLOR[resolvedTheme]);
        picker.style.setProperty('--border-size', '0');

        const backdropStyle = injectBackdropStyle(options.backdrop ?? {});
        const dialog = document.createElement('dialog');
        dialog.className = `emoji-picker-sheet emoji-picker-sheet--${resolvedTheme} ${backdropStyle.className}`;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'Emoji picker');

        const closeButtonHeader = createCloseButtonHeader(closeButtonOptions);
        if (closeButtonHeader) {
            // With the picker's own border removed above, this is the only visual separation
            // between the close button and the picker.
            picker.style.borderTop = '1px solid rgba(127, 127, 127, 0.3)';
        }

        return new Promise<EmojiPickerResult>((resolve) => {
            let settled = false;
            let pointerDownOnDialog = false;

            const previouslyFocusedElement = document.activeElement as HTMLElement | null;
            const previousBodyOverflow = document.body.style.overflow;

            const onUnhandledRejection = (event: PromiseRejectionEvent) => {
                if (isKnownBlobHeadCheckRejection(event.reason)) {
                    event.preventDefault();
                }
            };

            const finish = (result: EmojiPickerResult) => {
                window.removeEventListener('unhandledrejection', onUnhandledRejection);
                document.body.style.overflow = previousBodyOverflow;
                dialog.close();
                dialog.remove();
                backdropStyle.remove();

                if (previouslyFocusedElement instanceof HTMLElement && document.contains(previouslyFocusedElement)) {
                    previouslyFocusedElement.focus?.();
                }

                resolve(result);
            };

            const settle = (result: EmojiPickerResult) => {
                if (settled) {
                    return;
                }
                settled = true;
                picker.removeEventListener('emoji-click', onEmojiClick as EventListener);
                dialog.removeEventListener('pointerdown', onDialogPointerDown);
                dialog.removeEventListener('click', onDialogClick);
                dialog.removeEventListener('cancel', onCancel);
                document.removeEventListener('keydown', onKeyDown);
                closeButtonHeader?.button.removeEventListener('click', onCloseButtonClick);
                signal?.removeEventListener('abort', onAbort);

                dialog.removeAttribute('data-state');

                if (prefersReducedMotion()) {
                    finish(result);
                } else {
                    setTimeout(() => finish(result), ANIMATION_MS);
                }
            };

            const onEmojiClick = (event: CustomEvent<{ unicode?: string }>) => {
                settle({ emoji: event.detail.unicode ?? null });
            };

            const onDialogPointerDown = (event: PointerEvent) => {
                pointerDownOnDialog = event.target === dialog;
            };

            const onDialogClick = (event: MouseEvent) => {
                if (dismissOnBackdropTap && event.target === dialog && pointerDownOnDialog) {
                    settle({ emoji: null });
                }
            };

            // The dialog's native `cancel` event covers real browsers, where it fires
            // automatically on Escape and its default action would otherwise close the dialog
            // instantly, skipping the close animation. The `keydown` listener is a fallback for
            // environments (e.g. jsdom in tests) that don't implement dialog cancellation;
            // `settle` is idempotent, so both firing for the same keypress is harmless.
            const onCancel = (event: Event) => {
                event.preventDefault();
                settle({ emoji: null });
            };

            const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    settle({ emoji: null });
                }
            };

            const onCloseButtonClick = () => {
                settle({ emoji: null });
            };

            const onAbort = () => {
                settle({ emoji: null });
            };

            if (signal?.aborted) {
                resolve({ emoji: null });
                return;
            }
            signal?.addEventListener('abort', onAbort);

            picker.addEventListener('emoji-click', onEmojiClick as EventListener);
            dialog.addEventListener('pointerdown', onDialogPointerDown);
            dialog.addEventListener('click', onDialogClick);
            dialog.addEventListener('cancel', onCancel);
            document.addEventListener('keydown', onKeyDown);
            window.addEventListener('unhandledrejection', onUnhandledRejection);
            closeButtonHeader?.button.addEventListener('click', onCloseButtonClick);

            if (closeButtonHeader) {
                dialog.appendChild(closeButtonHeader.header);
            }
            dialog.appendChild(picker);
            document.body.appendChild(dialog);
            document.body.style.overflow = 'hidden';
            dialog.showModal();

            requestAnimationFrame(() => {
                dialog.setAttribute('data-state', 'open');
            });

            picker.focus?.();
        });
    }
}
