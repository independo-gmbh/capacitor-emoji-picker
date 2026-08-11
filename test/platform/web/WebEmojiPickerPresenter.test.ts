import { ErrorCodes } from '../../../src/core/error-codes';
import type { EmojiPickerElement } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

function createFakePicker(): EmojiPickerElement {
    return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
}

function backdropCount(): number {
    return document.body.children.length;
}

const flush = () => Promise.resolve();

describe('WebEmojiPickerPresenter', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('resolves with the selected unicode and removes the backdrop', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '👍🏽' } }));

        await expect(resultPromise).resolves.toEqual({ emoji: '👍🏽' });
        expect(backdropCount()).toBe(0);
    });

    it('passes through multi-code-point emoji unchanged', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '🏳️‍🌈' } }));

        await expect(resultPromise).resolves.toEqual({ emoji: '🏳️‍🌈' });
    });

    it('resolves with a null emoji exactly once when the backdrop is clicked', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const backdrop = document.body.firstElementChild as HTMLElement;
        backdrop.dispatchEvent(new Event('pointerdown'));
        backdrop.dispatchEvent(new MouseEvent('click'));
        // A second click after dismissal must not throw or resolve a second time.
        backdrop.dispatchEvent(new Event('pointerdown'));
        backdrop.dispatchEvent(new MouseEvent('click'));

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(backdropCount()).toBe(0);
    });

    it('resolves with a null emoji when Escape is pressed', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(backdropCount()).toBe(0);
    });

    it('does not leave stale DOM nodes across repeated open/close cycles', async () => {
        for (let i = 0; i < 3; i += 1) {
            const picker = createFakePicker();
            const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });
            const resultPromise = presenter.present();
            await flush();
            picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
            await resultPromise;
        }

        expect(backdropCount()).toBe(0);
    });

    it('sets the bundled data source on the picker element', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();
        expect(picker.dataSource).toBe('blob:mock-url');

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await resultPromise;
    });

    it('sets dialog accessibility attributes on the backdrop', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const backdrop = document.body.firstElementChild as HTMLElement;
        expect(backdrop.getAttribute('role')).toBe('dialog');
        expect(backdrop.getAttribute('aria-modal')).toBe('true');
        expect(backdrop.getAttribute('aria-label')).toBeTruthy();

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
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

        await expect(resultPromise).resolves.toEqual({ emoji: null });
        expect(document.activeElement).toBe(trigger);
    });

    it('rejects with NOT_IMPLEMENTED when createPickerElement fails', async () => {
        const presenter = new WebEmojiPickerPresenter({
            createPickerElement: () => Promise.reject(new Error('chunk load failed')),
        });

        await expect(presenter.present()).rejects.toThrow(ErrorCodes.NOT_IMPLEMENTED);
    });

    it('requires pointerdown and click to both originate on the backdrop before dismissing', async () => {
        const picker = createFakePicker();
        const presenter = new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) });

        const resultPromise = presenter.present();
        await flush();

        const backdrop = document.body.firstElementChild as HTMLElement;

        // Simulate a drag-select gesture that starts on the picker (not the backdrop) and
        // releases over the backdrop: pointerdown target is the picker, click target is the backdrop.
        const pointerDownEvent = new Event('pointerdown');
        Object.defineProperty(pointerDownEvent, 'target', { value: picker });
        backdrop.dispatchEvent(pointerDownEvent);

        const clickEvent = new MouseEvent('click');
        Object.defineProperty(clickEvent, 'target', { value: backdrop });
        backdrop.dispatchEvent(clickEvent);

        // Should not have dismissed.
        expect(backdropCount()).toBe(1);

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await resultPromise;
    });
});
