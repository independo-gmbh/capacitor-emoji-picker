/** Canonical error codes surfaced by the EmojiPicker plugin. */
export const ErrorCodes = {
    /** A `present()` call was made while a picker was already active. */
    ALREADY_PRESENTING: 'ALREADY_PRESENTING',
    /** The requested presentation is not implemented on this platform yet. */
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;
