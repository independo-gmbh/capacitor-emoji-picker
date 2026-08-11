package app.independo.capacitoremojipicker.core;

/** Canonical error codes surfaced by the EmojiPicker plugin. */
public final class ErrorCodes {

    /** A `present()` call was made while a picker was already active. */
    public static final String ALREADY_PRESENTING = "ALREADY_PRESENTING";
    /** The native picker UI could not be presented (e.g. no active Activity); distinct from user cancellation. */
    public static final String NATIVE_UNAVAILABLE = "NATIVE_UNAVAILABLE";
    /** The requested presentation is not implemented on this platform yet. */
    public static final String NOT_IMPLEMENTED = "NOT_IMPLEMENTED";

    private ErrorCodes() {}
}
