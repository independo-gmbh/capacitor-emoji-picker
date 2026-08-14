import { ErrorCodes } from '../../../src/core/error-codes';
import type { EmojiPickerElement } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

const ANIMATION_MS = 200;

function createFakePicker(): EmojiPickerElement {
    return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
}

function dialogCount(): number {
    return document.body.children.length;
}

const flush = () => Promise.resolve();

/** Advances past the presenter's close-animation timer and lets its `finish` microtask run. */
async function advancePastCloseAnimation(): Promise<void> {
    jest.advanceTimersByTime(ANIMATION_MS);
    await flush();
}

describe('WebEmojiPickerPresenter', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    it('resolves with the selected unicode and removes the dialog', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '👍🏽' } }));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: '👍🏽' });
        expect(dialogCount()).toBe(0);
    });

    it('passes through multi-code-point emoji unchanged', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '🏳️‍🌈' } }));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: '🏳️‍🌈' });
    });

    it('resolves with a null emoji exactly once when the backdrop is tapped', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        dialog.dispatchEvent(new Event('pointerdown'));
        dialog.dispatchEvent(new MouseEvent('click'));
        // A second tap after dismissal must not throw or resolve a second time.
        dialog.dispatchEvent(new Event('pointerdown'));
        dialog.dispatchEvent(new MouseEvent('click'));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(dialogCount()).toBe(0);
    });

    it('does not dismiss on backdrop tap when dismissOnBackdropTap is false', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present({ dismissOnBackdropTap: false });
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        dialog.dispatchEvent(new Event('pointerdown'));
        dialog.dispatchEvent(new MouseEvent('click'));
        await flush();

        // Still open: the backdrop tap must not have dismissed it.
        expect(dialogCount()).toBe(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
    });

    it('resolves with a null emoji when Escape is pressed', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(dialogCount()).toBe(0);
    });

    it('does not leave stale DOM nodes across repeated open/close cycles', async () => {
        for (let i = 0; i < 3; i += 1) {
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });
            const resultPromise = presenter.present();
            await flush();
            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        }

        expect(dialogCount()).toBe(0);
    });

    describe('theme', () => {
        function mockPrefersDark(matches: boolean): void {
            (window.matchMedia as unknown as jest.Mock) = jest.fn().mockReturnValue({ matches } as MediaQueryList);
        }

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('resolves system theme to dark when the OS prefers dark', async () => {
            mockPrefersDark(true);
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present({ theme: 'system' });
            await flush();

            const dialog = document.body.firstElementChild as HTMLElement;
            expect(picker.classList.contains('dark')).toBe(true);
            expect(dialog.classList.contains('emoji-picker-sheet--dark')).toBe(true);

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });

        it('resolves system theme (the default) to light when the OS prefers light', async () => {
            mockPrefersDark(false);
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present();
            await flush();

            const dialog = document.body.firstElementChild as HTMLElement;
            expect(picker.classList.contains('light')).toBe(true);
            expect(dialog.classList.contains('emoji-picker-sheet--light')).toBe(true);

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });

        it('forces dark theme regardless of the OS preference', async () => {
            mockPrefersDark(false);
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present({ theme: 'dark' });
            await flush();

            const dialog = document.body.firstElementChild as HTMLElement;
            expect(picker.classList.contains('dark')).toBe(true);
            expect(dialog.classList.contains('emoji-picker-sheet--dark')).toBe(true);

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });

        it('sets an explicit dark background on the picker rather than the unreliable Canvas keyword', async () => {
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present({ theme: 'dark' });
            await flush();
            expect(picker.style.getPropertyValue('--background')).toBe('#222');

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });

        it('sets an explicit light background on the picker rather than the unreliable Canvas keyword', async () => {
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present({ theme: 'light' });
            await flush();
            expect(picker.style.getPropertyValue('--background')).toBe('#fff');

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });

        it('forces light theme regardless of the OS preference', async () => {
            mockPrefersDark(true);
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

            const resultPromise = presenter.present({ theme: 'light' });
            await flush();

            const dialog = document.body.firstElementChild as HTMLElement;
            expect(picker.classList.contains('light')).toBe(true);
            expect(dialog.classList.contains('emoji-picker-sheet--light')).toBe(true);

            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await advancePastCloseAnimation();
            await resultPromise;
        });
    });

    it('sets the bundled data source on the picker element', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        expect(picker.dataSource).toBe('blob:mock-url');

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await advancePastCloseAnimation();
        await resultPromise;
    });

    it('sets dialog accessibility attributes on the sheet', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        expect(dialog.tagName).toBe('DIALOG');
        expect(dialog.getAttribute('role')).toBe('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-label')).toBeTruthy();

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await advancePastCloseAnimation();
        await resultPromise;
    });

    it('restores focus to the previously focused element after dismissal', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(document.activeElement).toBe(trigger);
    });

    it('rejects with NOT_IMPLEMENTED when createPickerElement fails', async () => {
        const presenter = new WebEmojiPickerPresenter({
            createPickerElement: () => Promise.reject(new Error('chunk load failed')),
        });

        await expect(presenter.present()).rejects.toThrow(ErrorCodes.NOT_IMPLEMENTED);
    });

    it('requires pointerdown and click to both originate on the dialog before dismissing', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;

        // Simulate a drag-select gesture that starts on the picker (not the dialog chrome) and
        // releases over the dialog: pointerdown target is the picker, click target is the dialog.
        const pointerDownEvent = new Event('pointerdown');
        Object.defineProperty(pointerDownEvent, 'target', { value: picker });
        dialog.dispatchEvent(pointerDownEvent);

        const clickEvent = new MouseEvent('click');
        Object.defineProperty(clickEvent, 'target', { value: dialog });
        dialog.dispatchEvent(clickEvent);
        await flush();

        // Should not have dismissed.
        expect(dialogCount()).toBe(1);

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await advancePastCloseAnimation();
        await resultPromise;
    });

    it('renders a close button by default and dismisses when it is clicked', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        const closeButton = dialog.querySelector<HTMLButtonElement>('.emoji-picker-sheet__close');
        expect(closeButton).not.toBeNull();
        expect(closeButton?.getAttribute('aria-label')).toBe('Close');

        closeButton?.click();
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
    });

    it('omits the close button when closeButton.hidden is true', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present({ closeButton: { hidden: true } });
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        expect(dialog.querySelector('.emoji-picker-sheet__close')).toBeNull();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await advancePastCloseAnimation();
        await resultPromise;
    });

    it('forces backdrop-tap dismissal on when closeButton.hidden is true, even if dismissOnBackdropTap is false', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present({ dismissOnBackdropTap: false, closeButton: { hidden: true } });
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        dialog.dispatchEvent(new Event('pointerdown'));
        dialog.dispatchEvent(new MouseEvent('click'));
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
    });

    it('sizes and positions the close button per closeButton options', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present({ closeButton: { size: 'large', position: 'left' } });
        await flush();

        const dialog = document.body.firstElementChild as HTMLElement;
        const header = dialog.querySelector<HTMLElement>('.emoji-picker-sheet__header');
        const closeButton = dialog.querySelector<HTMLButtonElement>('.emoji-picker-sheet__close');
        expect(header?.style.justifyContent).toBe('flex-start');
        expect(closeButton?.style.width).toBe('64px');
        expect(closeButton?.style.height).toBe('64px');

        closeButton?.click();
        await advancePastCloseAnimation();
        await resultPromise;
    });

    it('settles with a null emoji when the abort signal fires', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });
        const controller = new AbortController();

        const resultPromise = presenter.present({}, { signal: controller.signal });
        await flush();
        controller.abort();
        await advancePastCloseAnimation();

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(dialogCount()).toBe(0);
    });

    it('never opens the dialog when the signal is already aborted', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });
        const controller = new AbortController();
        controller.abort();

        const result = await presenter.present({}, { signal: controller.signal });

        expect(result).toEqual({ emoji: null });
        expect(dialogCount()).toBe(0);
    });
});
