import { EmojiPicker } from '@independo/capacitor-emoji-picker';

const elements = {
    selectedEmoji: document.querySelector('#selected-emoji'),
    errorOutput: document.querySelector('#error-output'),
    presentAuto: document.querySelector('#present-auto'),
    presentWeb: document.querySelector('#present-web'),
    closeButtonSize: document.querySelector('#close-button-size'),
    closeButtonPosition: document.querySelector('#close-button-position'),
    closeButtonHidden: document.querySelector('#close-button-hidden'),
    dismissOnBackdropTap: document.querySelector('#dismiss-on-backdrop-tap'),
    theme: document.querySelector('#theme'),
};

function setText(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function normalizeError(error) {
    if (!error) {
        return 'Unknown error';
    }
    if (typeof error === 'string') {
        return error;
    }
    if (typeof error === 'object') {
        const code = error.code ? String(error.code) : null;
        const message = error.message ? String(error.message) : null;
        if (code && message) {
            return `${code}: ${message}`;
        }
        return code ?? message ?? JSON.stringify(error);
    }
    return String(error);
}

function buildCloseButtonOptions() {
    return {
        size: elements.closeButtonSize?.value,
        position: elements.closeButtonPosition?.value,
        hidden: elements.closeButtonHidden?.checked ?? false,
    };
}

async function present(presentation) {
    setText(elements.errorOutput, 'None');
    try {
        const result = await EmojiPicker.present({
            ...(presentation ? { presentation } : {}),
            closeButton: buildCloseButtonOptions(),
            dismissOnBackdropTap: elements.dismissOnBackdropTap?.checked ?? true,
            theme: elements.theme?.value,
        });
        setText(elements.selectedEmoji, result.emoji ?? '—');
    } catch (error) {
        setText(elements.errorOutput, normalizeError(error));
    }
}

elements.presentAuto?.addEventListener('click', () => present());
elements.presentWeb?.addEventListener('click', () => present('web'));
