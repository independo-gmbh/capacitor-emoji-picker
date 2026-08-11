import { EmojiPicker } from '@independo/capacitor-emoji-picker';

const elements = {
    selectedEmoji: document.querySelector('#selected-emoji'),
    errorOutput: document.querySelector('#error-output'),
    presentAuto: document.querySelector('#present-auto'),
    presentWeb: document.querySelector('#present-web'),
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

async function present(presentation) {
    setText(elements.errorOutput, 'None');
    try {
        const result = await EmojiPicker.present(presentation ? { presentation } : undefined);
        setText(elements.selectedEmoji, result.emoji ?? '—');
    } catch (error) {
        setText(elements.errorOutput, normalizeError(error));
    }
}

elements.presentAuto?.addEventListener('click', () => present());
elements.presentWeb?.addEventListener('click', () => present('web'));
