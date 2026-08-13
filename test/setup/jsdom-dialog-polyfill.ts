/**
 * jsdom does not implement `<dialog>`'s modal behavior (`showModal`/`close`/the `cancel` event
 * are absent from its `HTMLDialogElement` implementation as of jsdom 26). This minimal polyfill
 * covers just enough of the spec for `WebEmojiPickerPresenter` to run under Jest; it does not
 * attempt inert-background or top-layer semantics, which the tests don't rely on.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        if (!this.hasAttribute('open')) {
            return;
        }
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
    };
}
