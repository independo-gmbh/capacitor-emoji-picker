# Native → web bridge for explicit `presentation: 'web'`

## Context

`EmojiPickerOptions.presentation` has always accepted `'web'`, but on iOS and Android it currently
rejects with `NOT_IMPLEMENTED` (`NativeEmojiPickerPresenter.java:62-67`,
`NativeEmojiPickerPresenter.swift:51-53`). A developer who wants consistent web-picker behavior
across every platform (e.g. to avoid divergent native/web UX, or because their app doesn't want
the native emoji keyboard) currently can't get it inside a native build.

This closes that gap: `presentation: 'web'` on iOS/Android now presents the same bottom-sheet web
picker (`WebEmojiPickerPresenter`, already built for pure-browser use) as an overlay inside the
app's own Capacitor webview, instead of rejecting.

**Explicitly out of scope:** `presentation: 'auto'`'s native-fails-so-fall-back-to-web behavior.
That's a different, still-unimplemented follow-up (the "issue #6" referenced in
`WebEmojiPickerPresenter.ts`'s class doc comment) and stays untouched. This spec only wires up the
case where the caller *explicitly* asks for web.

## Architecture

The app's native UI *is* rendered by a webview that already has our JS bundle loaded (it's how the
plugin's JS API is callable at all). So presenting the web picker doesn't require a new webview or
window — native just needs to trigger the existing JS bottom sheet inside that same webview and
learn when it settles.

**Why not just call `evaluateJavascript`/`WKWebView.evaluateJavaScript` and await the result?**
Both platforms' synchronous eval only returns the immediate synchronous return value of the
injected script — never an awaited Promise's resolution. `WebEmojiPickerPresenter.present()` is
inherently async (waits for user interaction). So the flow needs a **separate JS → native
callback channel**, not just a native → JS call:

1. Native evaluates JS to kick off presentation (fire-and-forget).
2. That JS runs `WebEmojiPickerPresenter.present()` exactly as the pure-browser path does.
3. When the resulting promise settles, JS reports the outcome back to native over a dedicated
   bridge object (`addJavascriptInterface` on Android, `WKScriptMessageHandler` on iOS) — these
   are real JS → native calls, not bound by eval's synchronous-return limitation.

### JS side (`src/`)

- New file `src/platform/web/nativeWebBridge.ts`, exporting `registerNativeWebBridge()`:
  - No-ops when `Capacitor.isNativePlatform()` is false (pure browser has no native bridge objects
    to report back to, and this code path is meaningless there).
  - Idempotent (guards against double-registration if called more than once).
  - Defines `window.__CapacitorEmojiPickerPresentWeb(requestId: string, optionsJson: string)`:
    - Parses `optionsJson` into `EmojiPickerOptions` (minus `presentation`, which is implied).
    - Creates an `AbortController`, stores it in a `Map<string, AbortController>` keyed by
      `requestId` (needed for step below).
    - Calls `new WebEmojiPickerPresenter().present(options, { signal: controller.signal })`.
    - On settle (resolve — this call never rejects in practice since `WebEmojiPickerPresenter`
      only rejects on `NOT_IMPLEMENTED`, which is handled too): removes the map entry and reports
      `{ requestId, emoji }` (or `{ requestId, error: code }`) back over whichever platform bridge
      object is present (`window.CapacitorEmojiPickerAndroidBridge.onWebResult(...)` /
      `window.webkit.messageHandlers.capacitorEmojiPickerBridge.postMessage(...)`).
  - Defines `window.__CapacitorEmojiPickerDismissWeb(requestId: string)`: looks up the
    `AbortController` for `requestId` and calls `.abort()` if found (no-op if already settled).
  - Called once from `src/index.ts` at module load (native platforms only, per the guard above).

- `WebEmojiPickerPresenter.present()` gains a second parameter:
  `present(options: EmojiPickerOptions = {}, presentOptions: { signal?: AbortSignal } = {})`.
  When `signal` is provided and fires `abort`, the presenter force-settles with `{ emoji: null }`
  through the existing `settle()` path (same animated close, same cleanup) — no new dismissal
  logic, just one more trigger alongside emoji-click/backdrop-tap/Escape/close-button.

### Android (`android/src/main/java/...`)

- New `EmojiPickerPresentOptions` POJO (mirrors the existing Swift struct):
  `presentation`, `dismissOnBackdropTap`, and close-button `size`/`position`/`hidden` — parsed
  once in `EmojiPicker.java` from the `PluginCall`, replacing today's two loose scalar args
  (`presentation`, `dismissOnBackdropTap`) that get threaded through `EmojiPickerService` and
  `EmojiPickerPresenter`. This is needed because Android's native picker never needed
  `closeButton` (only iOS's does), so today's Android interface has nowhere to carry it — the new
  web-fallback presenter needs it forwarded to JS.
- `EmojiPickerPresenter` interface (Android) changes to
  `present(EmojiPickerPresentOptions options, EmojiPickerCallback callback)`.
  `NativeEmojiPickerPresenter` updates its signature accordingly but keeps gating on
  `"auto".equals(options.presentation)`, ignoring the close-button fields exactly as before.
- New `WebFallbackEmojiPickerPresenter implements EmojiPickerPresenter`:
  - Generates a `requestId` (`UUID.randomUUID()`), serializes `{dismissOnBackdropTap, closeButton}`
    to JSON, and calls `bridge.eval("window.__CapacitorEmojiPickerPresentWeb('" + requestId + "',
    '" + escapedJson + "')", null)` (already hops to the UI thread).
  - Tracks pending callbacks in a `Map<String, EmojiPickerCallback>` keyed by `requestId`.
  - Exposes a `@JavascriptInterface`-annotated inner class registered once via
    `bridge.getWebView().addJavascriptInterface(...)` in `EmojiPicker.java#load()`, whose
    `onWebResult(String requestId, String resultJson)` looks up and resolves/removes the pending
    callback (hopping back to the UI thread since `@JavascriptInterface` methods run on a
    background thread).
  - Adds a `DefaultLifecycleObserver` (same pattern `NativeEmojiPickerPresenter` already uses) that,
    on `onDestroy`, evaluates `window.__CapacitorEmojiPickerDismissWeb(requestId)` for any pending
    request *and* settles it locally with `{ emoji: null }` (belt-and-suspenders, same rationale as
    the existing native lifecycle handling — the JS call may not land if the webview is already
    torn down).
  - If no result arrives within a fixed timeout (e.g. 3s — covers "webview JS bundle hasn't loaded
    yet"), settles with `NOT_IMPLEMENTED`.
- `EmojiPicker.java#load()`: builds both `nativePresenter` and `webFallbackPresenter`, wraps them
  in a small `DispatchingEmojiPickerPresenter implements EmojiPickerPresenter` that picks by
  `"web".equals(options.presentation)`, and passes *that* into `EmojiPickerService` — the service's
  own `isPresenting` guard and structure are untouched, so it uniformly covers both paths.

### iOS (`ios/Sources/EmojiPicker/...`)

- No interface changes needed: `EmojiPickerPresentOptions` already carries `presentation`,
  `closeButton`, and `dismissOnBackdropTap` end to end (`EmojiPickerPresenter.swift:15-21`).
- New `WebFallbackEmojiPickerPresenter: EmojiPickerPresenter`:
  - Generates a `requestId` (`UUID().uuidString`), serializes options to JSON, and calls
    `bridge?.webView?.evaluateJavaScript("window.__CapacitorEmojiPickerPresentWeb('\(requestId)',
    '\(escapedJson)')")` (fire-and-forget kickoff).
  - Tracks pending completions in `[String: (Result<EmojiPickerResult, EmojiPickerError>) -> Void]`.
  - Registers a `WKScriptMessageHandler` once, in `EmojiPicker.swift#load()`, via
    `bridge?.webView?.configuration.userContentController.add(handler, name:
    "capacitorEmojiPickerBridge")`; the handler parses `{requestId, emoji}` / `{requestId, error}`
    messages and resolves/removes the matching pending completion.
  - Mirrors `NativeEmojiPickerPresenter`'s existing backgrounding safety net: on
    `UIApplication.didEnterBackgroundNotification`, evaluates the JS dismiss call for any pending
    request and settles it locally with `nil`.
  - Same fixed timeout/`NOT_IMPLEMENTED` fallback as Android if no result arrives.
- `EmojiPicker.swift#load()`: builds both presenters, wraps them in a
  `DispatchingEmojiPickerPresenter` selecting by `options.presentation`, passes that into
  `EmojiPickerService` unchanged.

### Concurrency & errors

- `EmojiPickerService` (both platforms) is untouched — the dispatching presenter is just another
  `EmojiPickerPresenter` implementation from its point of view, so the existing single
  `isPresenting` guard / `ALREADY_PRESENTING` behavior automatically covers native and web-fallback
  presentations uniformly; a native call and a web-fallback call can never overlap.
- No new public error code: an unreachable/timed-out web bridge reuses `NOT_IMPLEMENTED`.

## Testing

- JS: unit tests for `nativeWebBridge.ts` (mock `window.CapacitorEmojiPickerAndroidBridge` /
  `window.webkit.messageHandlers`, verify request/response wiring, abort-triggers-dismiss) and for
  `WebEmojiPickerPresenter`'s new `signal` option (abort settles `{emoji: null}` through the normal
  animated-close path).
- Android: JUnit tests for `WebFallbackEmojiPickerPresenter` (using the existing fake
  `ActivityAvailabilityChecker`-style test patterns) covering: eval is invoked with the right JSON,
  `onWebResult` resolves the matching pending callback, unmatched/late results are ignored,
  `onDestroy` dismisses and settles null, timeout settles `NOT_IMPLEMENTED`. Update
  `EmojiPicker.java`/`NativeEmojiPickerPresenter` tests for the new `EmojiPickerPresentOptions`
  signature.
- iOS: XCTest coverage mirroring the Android list, adapted to `WKScriptMessageHandler` and
  `evaluateJavaScript` mocking patterns already used in `NativeEmojiPickerPresenter`'s test target.
- Manual: run the example app on a real/simulated device with `presentation: 'web'`, confirm the
  bottom sheet appears over the native UI, resolves/dismisses correctly, and that backgrounding the
  app while it's open force-dismisses it.
