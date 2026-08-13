# Native → Web Fallback Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit `presentation: 'web'` work on iOS and Android by having native evaluate the existing web bottom-sheet picker inside the app's own Capacitor webview, and report the result back over a JS→native bridge.

**Architecture:** JS side exposes `window.__CapacitorEmojiPickerPresentWeb`/`__CapacitorEmojiPickerDismissWeb`, native evaluates the former (fire-and-forget) and gets results back via a JS→native callback object (`addJavascriptInterface` on Android, `WKScriptMessageHandler` on iOS). Each platform gets a new `WebFallbackEmojiPickerPresenter` implementing the existing `EmojiPickerPresenter` interface, selected by a new `DispatchingEmojiPickerPresenter` alongside the existing native presenter — `EmojiPickerService`'s concurrency guard is untouched and covers both paths uniformly.

**Tech Stack:** TypeScript (Jest/ts-jest), Java (JUnit, no Robolectric), Swift (XCTest).

## Global Constraints

- `presentation: 'auto'`'s native-fails-so-fall-back-to-web behavior is OUT OF SCOPE — do not touch it. This plan only wires up explicit `presentation: 'web'`.
- Android unit tests run under plain JUnit with the Android Gradle Plugin's mockable `android.jar` (`returnDefaultValues` not enabled) — calling *any* unstubbed `android.*` API (including `org.json.JSONObject`, `android.util.Base64`, `android.os.Handler`/`Looper`) from code a unit test exercises throws `RuntimeException: ... not mocked`. New Android code must keep these out of unit-tested paths: inject `JsEvaluator`/`Scheduler`/`ActivityProvider` seams (mirroring `NativeEmojiPickerPresenter`'s existing pattern) and hand-roll the tiny options JSON string instead of using `org.json`/`Base64`.
- Options JSON sent native→JS is built by hand-rolled string interpolation (no JSON library needed either language): `closeButton.size`/`.position` are always one of a small fixed enum set validated/defaulted when the plugin call is parsed, never arbitrary user text, so this is safe.
- Results JS→native use typed arguments (`onWebResult(requestId, emoji, errorCode)` / a `{requestId, emoji, error}` message body), never a JSON string to parse — avoids all escaping/parsing concerns on that leg entirely.
- No new public error code: web-bridge timeout/unavailability reuses `NOT_IMPLEMENTED`.
- Follow existing code style: 4-space indent, existing Conventional Commit types, existing doc-comment conventions per file.

---

## Task 1: `WebEmojiPickerPresenter` gains an `AbortSignal` to force-dismiss

**Files:**
- Modify: `src/platform/web/WebEmojiPickerPresenter.ts:183` (the `present` method)
- Test: `test/platform/web/WebEmojiPickerPresenter.test.ts`

**Interfaces:**
- Produces: `WebEmojiPickerPresenter.present(options?: EmojiPickerOptions, presentOptions?: { signal?: AbortSignal }): Promise<EmojiPickerResult>` — new second parameter, optional, backward compatible with every existing call site.

- [ ] **Step 1: Write the failing tests**

Add to `test/platform/web/WebEmojiPickerPresenter.test.ts` (inside the existing `describe('WebEmojiPickerPresenter', ...)` block, alongside the other close-button tests near the end):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:web -- WebEmojiPickerPresenter`
Expected: FAIL — `present` doesn't accept a second argument, `AbortSignal` is never consulted, so the dialog opens/never settles.

- [ ] **Step 3: Implement**

In `src/platform/web/WebEmojiPickerPresenter.ts`, change the `present` method signature and body:

```ts
    public async present(
        options: EmojiPickerOptions = {},
        presentOptions: { signal?: AbortSignal } = {}
    ): Promise<EmojiPickerResult> {
        const { signal } = presentOptions;
        const closeButtonOptions = options.closeButton ?? {};
```

(keep everything else in the method body as-is up through the `closeButtonHeader` construction). Then, inside the `return new Promise<EmojiPickerResult>((resolve) => {` block, add the abort wiring. Right after the `onCloseButtonClick` handler definition and before the block of `addEventListener` calls, add:

```ts
            const onAbort = () => {
                settle({ emoji: null });
            };
```

In the `settle` function's listener-cleanup block (alongside the other `removeEventListener` calls), add:

```ts
                signal?.removeEventListener('abort', onAbort);
```

Right before the `picker.addEventListener('emoji-click', ...)` block of registrations, add an early-exit for an already-aborted signal, and otherwise register the listener:

```ts
            if (signal?.aborted) {
                resolve({ emoji: null });
                return;
            }
            signal?.addEventListener('abort', onAbort);

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:web -- WebEmojiPickerPresenter`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean.

```bash
git add src/platform/web/WebEmojiPickerPresenter.ts test/platform/web/WebEmojiPickerPresenter.test.ts
git commit -m "feat(web): support force-dismissing the picker via AbortSignal"
```

---

## Task 2: JS native↔web bridge (`nativeWebBridge.ts`)

**Files:**
- Create: `src/platform/web/nativeWebBridge.ts`
- Modify: `src/index.ts`
- Test: `test/platform/web/nativeWebBridge.test.ts`

**Interfaces:**
- Consumes: `WebEmojiPickerPresenter.present(options?, { signal? })` from Task 1; `Capacitor.isNativePlatform()` from `@capacitor/core`.
- Produces: `registerNativeWebBridge(createPresenter?: () => WebEmojiPickerPresenter): void` — idempotent, no-op outside a native platform. When active, defines two `window` globals consumed by native code in Tasks 4–7: `window.__CapacitorEmojiPickerPresentWeb(requestId: string, optionsBase64: string): void` and `window.__CapacitorEmojiPickerDismissWeb(requestId: string): void`. Reports results by calling `window.CapacitorEmojiPickerAndroidBridge.onWebResult(requestId, emoji, error)` (Android) or `window.webkit.messageHandlers.capacitorEmojiPickerBridge.postMessage({requestId, emoji, error})` (iOS) — whichever is present.

- [ ] **Step 1: Write the failing tests**

Create `test/platform/web/nativeWebBridge.test.ts`:

```ts
import { Capacitor } from '@capacitor/core';

import type { EmojiPickerElement } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';
import { registerNativeWebBridge } from '../../../src/platform/web/nativeWebBridge';

const ANIMATION_MS = 200;
const flush = () => Promise.resolve();

async function advancePastCloseAnimation(): Promise<void> {
    jest.advanceTimersByTime(ANIMATION_MS);
    await flush();
}

function createFakePicker(): EmojiPickerElement {
    return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
}

describe('registerNativeWebBridge', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
        delete (window as Record<string, unknown>).__CapacitorEmojiPickerPresentWeb;
        delete (window as Record<string, unknown>).__CapacitorEmojiPickerDismissWeb;
        delete (window as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge;
        delete (window as Record<string, unknown>).webkit;
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('does not register bridge functions outside a native platform', () => {
        (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);

        registerNativeWebBridge();

        expect(window.__CapacitorEmojiPickerPresentWeb).toBeUndefined();
    });

    it('reports the selected emoji back through the Android bridge object', async () => {
        const picker = createFakePicker();
        const onWebResult = jest.fn();
        (window as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge = { onWebResult };

        registerNativeWebBridge(() => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) }));
        window.__CapacitorEmojiPickerPresentWeb?.('req-1', btoa(JSON.stringify({ dismissOnBackdropTap: true })));
        await flush();

        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '😀' } }));
        await advancePastCloseAnimation();

        expect(onWebResult).toHaveBeenCalledWith('req-1', '😀', null);
    });

    it('reports a null emoji through the iOS message handler when dismissed via the dismiss bridge function', async () => {
        const picker = createFakePicker();
        const postMessage = jest.fn();
        (window as Record<string, unknown>).webkit = { messageHandlers: { capacitorEmojiPickerBridge: { postMessage } } };

        registerNativeWebBridge(() => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.resolve(picker) }));
        window.__CapacitorEmojiPickerPresentWeb?.('req-2', btoa(JSON.stringify({})));
        await flush();

        window.__CapacitorEmojiPickerDismissWeb?.('req-2');
        await advancePastCloseAnimation();

        expect(postMessage).toHaveBeenCalledWith({ requestId: 'req-2', emoji: null, error: null });
    });

    it('reports NOT_IMPLEMENTED when the picker element fails to load', async () => {
        const onWebResult = jest.fn();
        (window as Record<string, unknown>).CapacitorEmojiPickerAndroidBridge = { onWebResult };

        registerNativeWebBridge(
            () => new WebEmojiPickerPresenter({ createPickerElement: () => Promise.reject(new Error('boom')) })
        );
        window.__CapacitorEmojiPickerPresentWeb?.('req-3', btoa(JSON.stringify({})));
        await flush();

        expect(onWebResult).toHaveBeenCalledWith('req-3', null, 'NOT_IMPLEMENTED');
    });

    it('is idempotent across multiple calls', () => {
        registerNativeWebBridge();
        const firstFn = window.__CapacitorEmojiPickerPresentWeb;
        registerNativeWebBridge();

        expect(window.__CapacitorEmojiPickerPresentWeb).toBe(firstFn);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:web -- nativeWebBridge`
Expected: FAIL — module `src/platform/web/nativeWebBridge.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/platform/web/nativeWebBridge.ts`:

```ts
import { Capacitor } from '@capacitor/core';

import type { EmojiPickerOptions } from '../../definitions';
import { WebEmojiPickerPresenter } from './WebEmojiPickerPresenter';

declare global {
    interface Window {
        __CapacitorEmojiPickerPresentWeb?: (requestId: string, optionsBase64: string) => void;
        __CapacitorEmojiPickerDismissWeb?: (requestId: string) => void;
        CapacitorEmojiPickerAndroidBridge?: {
            onWebResult: (requestId: string, emoji: string | null, error: string | null) => void;
        };
        webkit?: {
            messageHandlers?: {
                capacitorEmojiPickerBridge?: {
                    postMessage: (message: { requestId: string; emoji: string | null; error: string | null }) => void;
                };
            };
        };
    }
}

let registered = false;

function reportResult(requestId: string, emoji: string | null, error: string | null): void {
    if (window.CapacitorEmojiPickerAndroidBridge) {
        window.CapacitorEmojiPickerAndroidBridge.onWebResult(requestId, emoji, error);
        return;
    }
    window.webkit?.messageHandlers?.capacitorEmojiPickerBridge?.postMessage({ requestId, emoji, error });
}

/**
 * Registers the native↔JS bridge iOS/Android use when a caller explicitly requests
 * `presentation: 'web'`: native evaluates `window.__CapacitorEmojiPickerPresentWeb` to run the
 * same bottom-sheet picker used in pure-browser contexts inside the app's own webview, and
 * this reports the outcome back over whichever platform bridge object is present. No-op outside
 * a native platform (there's nothing to report back to) and safe to call more than once.
 */
export function registerNativeWebBridge(createPresenter: () => WebEmojiPickerPresenter = () => new WebEmojiPickerPresenter()): void {
    if (registered || !Capacitor.isNativePlatform()) {
        return;
    }
    registered = true;

    const pending = new Map<string, AbortController>();

    window.__CapacitorEmojiPickerPresentWeb = (requestId: string, optionsBase64: string) => {
        const options: EmojiPickerOptions = optionsBase64 ? JSON.parse(atob(optionsBase64)) : {};
        const controller = new AbortController();
        pending.set(requestId, controller);

        createPresenter()
            .present(options, { signal: controller.signal })
            .then((result) => {
                pending.delete(requestId);
                reportResult(requestId, result.emoji, null);
            })
            .catch((error: Error) => {
                pending.delete(requestId);
                reportResult(requestId, null, error.message);
            });
    };

    window.__CapacitorEmojiPickerDismissWeb = (requestId: string) => {
        pending.get(requestId)?.abort();
        pending.delete(requestId);
    };
}
```

Then wire it into `src/index.ts`:

```ts
import { registerPlugin } from '@capacitor/core';

import type { EmojiPickerPlugin } from './definitions';
import { registerNativeWebBridge } from './platform/web/nativeWebBridge';

const EmojiPicker = registerPlugin<EmojiPickerPlugin>('EmojiPicker', {
    web: () => import('./web').then((m) => new m.EmojiPickerWeb()),
});

registerNativeWebBridge();

export * from './definitions';
export { EmojiPicker };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:web`
Expected: PASS, full suite (including all prior tests, unaffected).

- [ ] **Step 5: Typecheck, lint, build, commit**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: all clean.

```bash
git add src/platform/web/nativeWebBridge.ts src/index.ts test/platform/web/nativeWebBridge.test.ts
git commit -m "feat(web): add native<->JS bridge for presentation:'web' on native platforms"
```

---

## Task 3: Android — thread `closeButton` through the presenter interface

**Files:**
- Create: `android/src/main/java/app/independo/capacitoremojipicker/core/EmojiCloseButtonOptions.java`
- Modify: `android/src/main/java/app/independo/capacitoremojipicker/presenter/EmojiPickerPresenter.java`
- Modify: `android/src/main/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenter.java`
- Modify: `android/src/main/java/app/independo/capacitoremojipicker/service/EmojiPickerService.java`
- Modify: `android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java`
- Modify: `android/src/test/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenterTest.java`
- Modify: `android/src/test/java/app/independo/capacitoremojipicker/service/EmojiPickerServiceTest.java`

**Interfaces:**
- Produces: `EmojiCloseButtonOptions(String size, String position, boolean hidden)` (plain immutable POJO). `EmojiPickerPresenter.present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback)` and `EmojiPickerService.present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback)` — both gain the new third parameter (Android's native picker has never used `closeButton`; this is purely so Task 4's web-fallback presenter can receive it, mirroring how iOS already threads it through `EmojiPickerPresentOptions`).

This task only threads the new parameter everywhere the interface already flows — it doesn't add new behavior yet, so there's no new test to write; existing tests are updated to compile against the new signature and must keep passing.

- [ ] **Step 1: Create the options POJO**

Create `android/src/main/java/app/independo/capacitoremojipicker/core/EmojiCloseButtonOptions.java`:

```java
package app.independo.capacitoremojipicker.core;

/**
 * Close-button configuration for a single {@code present()} call. Only consulted by presenters
 * that render their own close affordance (currently the web-fallback presenter); ignored
 * elsewhere, mirroring the iOS `EmojiCloseButtonOptions` struct.
 */
public final class EmojiCloseButtonOptions {
    public final String size;
    public final String position;
    public final boolean hidden;

    public EmojiCloseButtonOptions(String size, String position, boolean hidden) {
        this.size = size;
        this.position = position;
        this.hidden = hidden;
    }
}
```

- [ ] **Step 2: Update the presenter interface**

In `android/src/main/java/app/independo/capacitoremojipicker/presenter/EmojiPickerPresenter.java`, change:

```java
package app.independo.capacitoremojipicker.presenter;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;

/**
 * Performs the platform-specific presentation.
 *
 * Kept separate from the Capacitor bridge and service so the native picker UI (issue #4) can be
 * implemented without touching plugin wiring or the concurrency-guard logic.
 */
public interface EmojiPickerPresenter {

    /** Presents the picker for the given presentation mode and reports the outcome. */
    void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback);
}
```

- [ ] **Step 3: Update `NativeEmojiPickerPresenter`**

In `android/src/main/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenter.java`, add the import `import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;` and change the `present` method signature (it continues to ignore the new parameter, exactly as it already ignores `closeButton` on the JS/Options layer):

```java
    @Override
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
```

(leave the method body unchanged).

- [ ] **Step 4: Update `EmojiPickerService`**

In `android/src/main/java/app/independo/capacitoremojipicker/service/EmojiPickerService.java`:

```java
package app.independo.capacitoremojipicker.service;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import app.independo.capacitoremojipicker.presenter.EmojiPickerPresenter;

/** Orchestrates presenter calls and guards against overlapping presentations. */
public class EmojiPickerService {

    private final EmojiPickerPresenter presenter;
    private volatile boolean isPresenting = false;

    public EmojiPickerService(EmojiPickerPresenter presenter) {
        this.presenter = presenter;
    }

    /** Presents the picker, rejecting a second concurrent call instead of overlapping pickers. */
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
        if (isPresenting) {
            callback.onError(ErrorCodes.ALREADY_PRESENTING);
            return;
        }

        isPresenting = true;
        presenter.present(
            presentation,
            dismissOnBackdropTap,
            closeButton,
            new EmojiPickerCallback() {
                @Override
                public void onResult(EmojiPickerResult result) {
                    isPresenting = false;
                    callback.onResult(result);
                }

                @Override
                public void onError(String code) {
                    isPresenting = false;
                    callback.onError(code);
                }
            }
        );
    }
}
```

- [ ] **Step 5: Update `EmojiPicker.java` to parse and forward `closeButton`**

In `android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java`, add the import `import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;` and `import com.getcapacitor.JSObject;` (already imported), then update `present`:

```java
    /** Presents the emoji picker. */
    @PluginMethod
    public void present(PluginCall call) {
        String presentation = call.getString("presentation", "auto");
        boolean dismissOnBackdropTap = call.getBoolean("dismissOnBackdropTap", true);
        JSObject closeButtonObject = call.getObject("closeButton");
        EmojiCloseButtonOptions closeButton = new EmojiCloseButtonOptions(
            closeButtonObject != null ? closeButtonObject.getString("size", "medium") : "medium",
            closeButtonObject != null ? closeButtonObject.getString("position", "right") : "right",
            closeButtonObject != null && closeButtonObject.optBoolean("hidden", false)
        );
        service.present(
            presentation,
            dismissOnBackdropTap,
            closeButton,
            new EmojiPickerCallback() {
                @Override
                public void onResult(EmojiPickerResult result) {
                    JSObject ret = new JSObject();
                    ret.put("emoji", result.getEmoji());
                    call.resolve(ret);
                }

                @Override
                public void onError(String code) {
                    call.reject(code, code);
                }
            }
        );
    }
```

- [ ] **Step 6: Update existing tests to compile against the new signature**

In `android/src/test/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenterTest.java`:
- Add import: `import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;`
- Every `presenter.present("auto", true, callback)` (or similar) call becomes `presenter.present("auto", true, null, callback)` — `null` is fine since `NativeEmojiPickerPresenter` never reads it.

In `android/src/test/java/app/independo/capacitoremojipicker/service/EmojiPickerServiceTest.java`:
- Add import: `import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;`
- `PendingPresenter.present(...)` signature becomes:
  ```java
        @Override
        public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
            this.capturedCallback = callback;
        }
  ```
- Every `service.present("auto", true, callback)` call becomes `service.present("auto", true, null, callback)`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd android && ./gradlew testDebugUnitTest` (requires `ANDROID_HOME`/`sdk.dir` configured locally — if unavailable in this environment, at minimum run `javac`-level compilation via the Gradle `compileDebugJavaWithJavac` task to confirm the signature change compiles cleanly everywhere)
Expected: PASS, both `NativeEmojiPickerPresenterTest` and `EmojiPickerServiceTest` unchanged in behavior.

- [ ] **Step 8: Commit**

```bash
git add android/src/main/java/app/independo/capacitoremojipicker/core/EmojiCloseButtonOptions.java \
        android/src/main/java/app/independo/capacitoremojipicker/presenter/EmojiPickerPresenter.java \
        android/src/main/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenter.java \
        android/src/main/java/app/independo/capacitoremojipicker/service/EmojiPickerService.java \
        android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java \
        android/src/test/java/app/independo/capacitoremojipicker/presenter/NativeEmojiPickerPresenterTest.java \
        android/src/test/java/app/independo/capacitoremojipicker/service/EmojiPickerServiceTest.java
git commit -m "refactor(android): thread closeButton through the presenter interface"
```

---

## Task 4: Android `WebFallbackEmojiPickerPresenter`

**Files:**
- Create: `android/src/main/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenter.java`
- Test: `android/src/test/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenterTest.java`

**Interfaces:**
- Consumes: `EmojiPickerPresenter`, `EmojiCloseButtonOptions`, `EmojiPickerCallback`, `EmojiPickerResult`, `ErrorCodes` from Task 3.
- Produces: `WebFallbackEmojiPickerPresenter implements EmojiPickerPresenter`, constructed as `new WebFallbackEmojiPickerPresenter(JsEvaluator jsEvaluator, ActivityProvider activityProvider)` (production) — package-private 4-arg constructor also takes a `Scheduler` for tests. Nested types: `JsEvaluator { void eval(String js); }`, `ActivityProvider { Activity get(); }`, package-private `Scheduler { void postDelayed(Runnable, long); void cancel(Runnable); }`. Public method `void onWebResult(String requestId, String emoji, String errorCode)` — called by Task 5's JS-interface bridge object.

- [ ] **Step 1: Write the failing tests**

Create `android/src/test/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenterTest.java`:

```java
package app.independo.capacitoremojipicker.presenter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class WebFallbackEmojiPickerPresenterTest {

    /** Captures every script evaluated instead of touching a real WebView. */
    private static class FakeJsEvaluator implements WebFallbackEmojiPickerPresenter.JsEvaluator {
        final List<String> evaluated = new ArrayList<>();

        @Override
        public void eval(String js) {
            evaluated.add(js);
        }
    }

    /** Runs/cancels "delayed" work synchronously on demand instead of touching a real Handler. */
    private static class FakeScheduler implements WebFallbackEmojiPickerPresenter.Scheduler {
        Runnable scheduled;
        boolean cancelled;

        @Override
        public void postDelayed(Runnable runnable, long delayMillis) {
            scheduled = runnable;
        }

        @Override
        public void cancel(Runnable runnable) {
            if (runnable == scheduled) {
                cancelled = true;
            }
        }

        void fireTimeout() {
            scheduled.run();
        }
    }

    private static class CapturingCallback implements EmojiPickerCallback {
        EmojiPickerResult result;
        String errorCode;
        int callCount;

        @Override
        public void onResult(EmojiPickerResult result) {
            this.result = result;
            callCount++;
        }

        @Override
        public void onError(String code) {
            this.errorCode = code;
            callCount++;
        }
    }

    private static final EmojiCloseButtonOptions CLOSE_BUTTON = new EmojiCloseButtonOptions("medium", "right", false);

    @Test
    public void evaluatesJsWithEncodedOptions() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());

        presenter.present("web", true, CLOSE_BUTTON, new CapturingCallback());

        assertEquals(1, evaluator.evaluated.size());
        String js = evaluator.evaluated.get(0);
        assertTrue(js.contains("window.__CapacitorEmojiPickerPresentWeb("));
        assertTrue(js.contains("\"dismissOnBackdropTap\":true"));
        assertTrue(js.contains("\"size\":\"medium\""));
        assertTrue(js.contains("\"position\":\"right\""));
        assertTrue(js.contains("\"hidden\":false"));
    }

    @Test
    public void onWebResultResolvesTheMatchingPendingCallback() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, "😀", null);

        assertEquals(1, callback.callCount);
        assertEquals("😀", callback.result.getEmoji());
    }

    @Test
    public void onWebResultWithErrorCodeReportsError() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, null, ErrorCodes.NOT_IMPLEMENTED);

        assertEquals(ErrorCodes.NOT_IMPLEMENTED, callback.errorCode);
    }

    @Test
    public void unmatchedRequestIdIsIgnored() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        presenter.onWebResult("some-other-request-id", "😀", null);

        assertEquals(0, callback.callCount);
    }

    @Test
    public void resultAfterTimeoutIsIgnored() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        scheduler.fireTimeout();
        assertEquals(ErrorCodes.NOT_IMPLEMENTED, callback.errorCode);

        callback.callCount = 0;
        presenter.onWebResult(requestId, "😀", null);
        assertEquals(0, callback.callCount);
    }

    @Test
    public void successfulResultCancelsTheTimeout() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        FakeScheduler scheduler = new FakeScheduler();
        WebFallbackEmojiPickerPresenter presenter = new WebFallbackEmojiPickerPresenter(evaluator, () -> null, scheduler);
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.onWebResult(requestId, "😀", null);

        assertTrue(scheduler.cancelled);
    }

    @Test
    public void dismissEvaluatesDismissJsAndSettlesNull() {
        FakeJsEvaluator evaluator = new FakeJsEvaluator();
        WebFallbackEmojiPickerPresenter presenter =
            new WebFallbackEmojiPickerPresenter(evaluator, () -> null, new FakeScheduler());
        CapturingCallback callback = new CapturingCallback();

        presenter.present("web", true, CLOSE_BUTTON, callback);
        String js = evaluator.evaluated.get(0);
        String requestId = js.substring(js.indexOf("('") + 2, js.indexOf("',"));

        presenter.dismiss(requestId);

        assertTrue(evaluator.evaluated.get(1).contains("__CapacitorEmojiPickerDismissWeb"));
        assertEquals(1, callback.callCount);
        assertNull(callback.result.getEmoji());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*WebFallbackEmojiPickerPresenterTest*"`
Expected: FAIL — `WebFallbackEmojiPickerPresenter` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `android/src/main/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenter.java`:

```java
package app.independo.capacitoremojipicker.presenter;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import app.independo.capacitoremojipicker.core.ErrorCodes;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Presents the web bottom sheet inside the app's own Capacitor webview by evaluating JS there
 * (registered by {@code registerNativeWebBridge()} in the JS layer), and resolves once that JS
 * reports back via {@link #onWebResult}. Kept independent of any real {@code Bridge}/{@code
 * WebView} type so it stays unit-testable without the Android Gradle Plugin's mockable
 * {@code android.jar}: production wiring in {@code EmojiPicker#load()} supplies a {@link
 * JsEvaluator} backed by {@code Bridge#eval} and an {@link ActivityProvider}; tests supply fakes.
 */
public class WebFallbackEmojiPickerPresenter implements EmojiPickerPresenter {

    /** Evaluates JS in the app's webview. Abstracts away the real Capacitor {@code Bridge}. */
    public interface JsEvaluator {
        void eval(String js);
    }

    /** Supplies the current hosting Activity; returns null if none is available. */
    public interface ActivityProvider {
        Activity get();
    }

    /** Posts/cancels delayed work. Abstracts away {@code Handler} for tests. */
    interface Scheduler {
        void postDelayed(Runnable runnable, long delayMillis);
        void cancel(Runnable runnable);
    }

    /** How long to wait for the JS side to report back before giving up. */
    static final long TIMEOUT_MILLIS = 3000;

    private final JsEvaluator jsEvaluator;
    private final ActivityProvider activityProvider;
    private final Scheduler scheduler;
    private final Map<String, PendingRequest> pending = new HashMap<>();

    public WebFallbackEmojiPickerPresenter(JsEvaluator jsEvaluator, ActivityProvider activityProvider) {
        this(jsEvaluator, activityProvider, defaultScheduler());
    }

    /** Package-private: lets tests inject a fake {@link Scheduler}. */
    WebFallbackEmojiPickerPresenter(JsEvaluator jsEvaluator, ActivityProvider activityProvider, Scheduler scheduler) {
        this.jsEvaluator = jsEvaluator;
        this.activityProvider = activityProvider;
        this.scheduler = scheduler;
    }

    private static Scheduler defaultScheduler() {
        Handler handler = new Handler(Looper.getMainLooper());
        return new Scheduler() {
            @Override
            public void postDelayed(Runnable runnable, long delayMillis) {
                handler.postDelayed(runnable, delayMillis);
            }

            @Override
            public void cancel(Runnable runnable) {
                handler.removeCallbacks(runnable);
            }
        };
    }

    @Override
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
        String requestId = UUID.randomUUID().toString();

        Runnable timeoutRunnable = () -> settle(requestId, null, ErrorCodes.NOT_IMPLEMENTED);

        DefaultLifecycleObserver lifecycleObserver = null;
        LifecycleOwner lifecycleOwner = null;
        Activity activity = activityProvider.get();
        if (activity instanceof LifecycleOwner) {
            lifecycleOwner = (LifecycleOwner) activity;
            lifecycleObserver = new DefaultLifecycleObserver() {
                @Override
                public void onDestroy(LifecycleOwner owner) {
                    dismiss(requestId);
                }
            };
            lifecycleOwner.getLifecycle().addObserver(lifecycleObserver);
        }

        pending.put(requestId, new PendingRequest(callback, timeoutRunnable, lifecycleObserver, lifecycleOwner));
        scheduler.postDelayed(timeoutRunnable, TIMEOUT_MILLIS);

        jsEvaluator.eval(
            "window.__CapacitorEmojiPickerPresentWeb('" + requestId + "', '" + encodeOptionsBase64Free(dismissOnBackdropTap, closeButton) + "')"
        );
    }

    /** Called by the JS-interface bridge object once the JS sheet settles. */
    public void onWebResult(String requestId, String emoji, String errorCode) {
        settle(requestId, emoji, errorCode);
    }

    /** Force-dismisses a still-pending presentation (e.g. on Activity destruction). */
    public void dismiss(String requestId) {
        jsEvaluator.eval("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('" + requestId + "')");
        settle(requestId, null, null);
    }

    private void settle(String requestId, String emoji, String errorCode) {
        PendingRequest request = pending.remove(requestId);
        if (request == null) {
            return;
        }
        scheduler.cancel(request.timeoutRunnable);
        if (request.lifecycleObserver != null && request.lifecycleOwner != null) {
            request.lifecycleOwner.getLifecycle().removeObserver(request.lifecycleObserver);
        }
        if (errorCode != null) {
            request.callback.onError(errorCode);
        } else {
            request.callback.onResult(new EmojiPickerResult(emoji));
        }
    }

    /**
     * Hand-rolled instead of a JSON library: `size`/`position` are always one of a small fixed
     * set of ASCII enum values validated/defaulted in {@code EmojiPicker#present}, never
     * arbitrary user text, so plain string interpolation is safe here. This also sidesteps
     * `org.json`/`android.util.Base64` throwing under the mockable `android.jar` in plain JUnit
     * unit tests (see the plan's Global Constraints).
     */
    private static String encodeOptionsBase64Free(boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton) {
        return "{"
            + "\"dismissOnBackdropTap\":" + dismissOnBackdropTap + ","
            + "\"closeButton\":{"
            + "\"size\":\"" + closeButton.size + "\","
            + "\"position\":\"" + closeButton.position + "\","
            + "\"hidden\":" + closeButton.hidden
            + "}}";
    }

    private static final class PendingRequest {
        final EmojiPickerCallback callback;
        final Runnable timeoutRunnable;
        final DefaultLifecycleObserver lifecycleObserver;
        final LifecycleOwner lifecycleOwner;

        PendingRequest(
            EmojiPickerCallback callback,
            Runnable timeoutRunnable,
            DefaultLifecycleObserver lifecycleObserver,
            LifecycleOwner lifecycleOwner
        ) {
            this.callback = callback;
            this.timeoutRunnable = timeoutRunnable;
            this.lifecycleObserver = lifecycleObserver;
            this.lifecycleOwner = lifecycleOwner;
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*WebFallbackEmojiPickerPresenterTest*"`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add android/src/main/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenter.java \
        android/src/test/java/app/independo/capacitoremojipicker/presenter/WebFallbackEmojiPickerPresenterTest.java
git commit -m "feat(android): add WebFallbackEmojiPickerPresenter"
```

---

## Task 5: Android wiring — dispatcher, JS interface registration, plugin `load()`

**Files:**
- Create: `android/src/main/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenter.java`
- Create: `android/src/main/java/app/independo/capacitoremojipicker/EmojiPickerWebBridgeInterface.java`
- Modify: `android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java`
- Test: `android/src/test/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenterTest.java`

**Interfaces:**
- Consumes: `EmojiPickerPresenter`, `WebFallbackEmojiPickerPresenter` from Tasks 3–4.
- Produces: `DispatchingEmojiPickerPresenter implements EmojiPickerPresenter`, constructed as `new DispatchingEmojiPickerPresenter(EmojiPickerPresenter nativePresenter, EmojiPickerPresenter webFallbackPresenter)` — routes by `"web".equals(presentation)`.

- [ ] **Step 1: Write the failing test**

Create `android/src/test/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenterTest.java`:

```java
package app.independo.capacitoremojipicker.presenter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;
import app.independo.capacitoremojipicker.core.EmojiPickerResult;
import org.junit.Test;

public class DispatchingEmojiPickerPresenterTest {

    private static class RecordingPresenter implements EmojiPickerPresenter {
        String lastPresentation;
        int callCount;

        @Override
        public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
            lastPresentation = presentation;
            callCount++;
            callback.onResult(new EmojiPickerResult(null));
        }
    }

    @Test
    public void routesAutoToTheNativePresenter() {
        RecordingPresenter nativePresenter = new RecordingPresenter();
        RecordingPresenter webFallbackPresenter = new RecordingPresenter();
        DispatchingEmojiPickerPresenter dispatcher = new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter);

        dispatcher.present("auto", true, null, new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        assertEquals(1, nativePresenter.callCount);
        assertEquals(0, webFallbackPresenter.callCount);
    }

    @Test
    public void routesWebToTheWebFallbackPresenter() {
        RecordingPresenter nativePresenter = new RecordingPresenter();
        RecordingPresenter webFallbackPresenter = new RecordingPresenter();
        DispatchingEmojiPickerPresenter dispatcher = new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter);

        dispatcher.present("web", true, null, new EmojiPickerCallback() {
            @Override
            public void onResult(EmojiPickerResult result) {}

            @Override
            public void onError(String code) {}
        });

        assertEquals(0, nativePresenter.callCount);
        assertEquals(1, webFallbackPresenter.callCount);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*DispatchingEmojiPickerPresenterTest*"`
Expected: FAIL — `DispatchingEmojiPickerPresenter` doesn't exist yet.

- [ ] **Step 3: Implement the dispatcher**

Create `android/src/main/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenter.java`:

```java
package app.independo.capacitoremojipicker.presenter;

import app.independo.capacitoremojipicker.core.EmojiCloseButtonOptions;
import app.independo.capacitoremojipicker.core.EmojiPickerCallback;

/**
 * Picks between the native and web-fallback presenters by {@code presentation}, so {@code
 * EmojiPickerService}'s single concurrency guard covers both paths uniformly - from its point of
 * view this is just another {@link EmojiPickerPresenter}.
 */
public class DispatchingEmojiPickerPresenter implements EmojiPickerPresenter {

    private final EmojiPickerPresenter nativePresenter;
    private final EmojiPickerPresenter webFallbackPresenter;

    public DispatchingEmojiPickerPresenter(EmojiPickerPresenter nativePresenter, EmojiPickerPresenter webFallbackPresenter) {
        this.nativePresenter = nativePresenter;
        this.webFallbackPresenter = webFallbackPresenter;
    }

    @Override
    public void present(String presentation, boolean dismissOnBackdropTap, EmojiCloseButtonOptions closeButton, EmojiPickerCallback callback) {
        EmojiPickerPresenter target = "web".equals(presentation) ? webFallbackPresenter : nativePresenter;
        target.present(presentation, dismissOnBackdropTap, closeButton, callback);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "*DispatchingEmojiPickerPresenterTest*"`
Expected: PASS.

- [ ] **Step 5: Create the JS-interface bridge object**

Create `android/src/main/java/app/independo/capacitoremojipicker/EmojiPickerWebBridgeInterface.java`:

```java
package app.independo.capacitoremojipicker;

import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import app.independo.capacitoremojipicker.presenter.WebFallbackEmojiPickerPresenter;

/**
 * JS-callable object registered on the Capacitor webview
 * (`webView.addJavascriptInterface(this, "CapacitorEmojiPickerAndroidBridge")`) so the web
 * bottom sheet can report its outcome back to {@link WebFallbackEmojiPickerPresenter} once it
 * settles. `@JavascriptInterface` methods run on a background thread, so this hops back to the
 * main thread before touching the presenter (which touches `Lifecycle`, a main-thread-only API).
 */
class EmojiPickerWebBridgeInterface {

    private final WebFallbackEmojiPickerPresenter presenter;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    EmojiPickerWebBridgeInterface(WebFallbackEmojiPickerPresenter presenter) {
        this.presenter = presenter;
    }

    @JavascriptInterface
    public void onWebResult(String requestId, String emoji, String errorCode) {
        mainHandler.post(() -> presenter.onWebResult(requestId, emoji, errorCode));
    }
}
```

- [ ] **Step 6: Wire it all up in `EmojiPicker.java#load()`**

In `android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java`, add imports for `app.independo.capacitoremojipicker.presenter.DispatchingEmojiPickerPresenter` and `app.independo.capacitoremojipicker.presenter.WebFallbackEmojiPickerPresenter`, then update `load()`:

```java
    @Override
    public void load() {
        super.load();
        EmojiPickerPresenter nativePresenter =
            new NativeEmojiPickerPresenter(this::getActivity, new DefaultEmojiPickerDialogFactory());
        WebFallbackEmojiPickerPresenter webFallbackPresenter =
            new WebFallbackEmojiPickerPresenter(js -> getBridge().eval(js, null), this::getActivity);
        getBridge().getWebView().addJavascriptInterface(
            new EmojiPickerWebBridgeInterface(webFallbackPresenter),
            "CapacitorEmojiPickerAndroidBridge"
        );
        service = new EmojiPickerService(new DispatchingEmojiPickerPresenter(nativePresenter, webFallbackPresenter));
    }
```

- [ ] **Step 7: Compile-check and commit**

Run: `cd android && ./gradlew compileDebugJavaWithJavac` (or `testDebugUnitTest` if an SDK is configured)
Expected: compiles cleanly; unit tests from Tasks 3–5 all still pass.

```bash
git add android/src/main/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenter.java \
        android/src/main/java/app/independo/capacitoremojipicker/EmojiPickerWebBridgeInterface.java \
        android/src/main/java/app/independo/capacitoremojipicker/EmojiPicker.java \
        android/src/test/java/app/independo/capacitoremojipicker/presenter/DispatchingEmojiPickerPresenterTest.java
git commit -m "feat(android): wire presentation:'web' to the JS bottom sheet"
```

---

## Task 6: iOS `WebFallbackEmojiPickerPresenter`

**Files:**
- Create: `ios/Sources/EmojiPicker/Presenter/WebFallbackEmojiPickerPresenter.swift`
- Test: `ios/Tests/EmojiPickerTests/WebFallbackEmojiPickerPresenterTests.swift`

**Interfaces:**
- Consumes: `EmojiPickerPresenter`, `EmojiPickerPresentOptions`, `EmojiCloseButtonOptions`, `EmojiPickerResult`, `EmojiPickerError`, `ErrorCodes` (all already defined, from `EmojiPickerPresenter.swift`/`ErrorCodes.swift`/`EmojiPickerResult.swift`).
- Produces: `WebFallbackEmojiPickerPresenter: EmojiPickerPresenter`, `convenience init(jsEvaluator: @escaping (String) -> Void)` (production) and `init(jsEvaluator:scheduler:)` (tests). Method `func handleBridgeMessage(requestId: String, emoji: String?, errorCode: String?)` — called by Task 7's `WKScriptMessageHandler`.

- [ ] **Step 1: Write the failing tests**

Create `ios/Tests/EmojiPickerTests/WebFallbackEmojiPickerPresenterTests.swift`:

```swift
import UIKit
import XCTest
@testable import EmojiPicker

private let closeButton = EmojiCloseButtonOptions(size: "medium", position: "right", hidden: false)
private let webOptions = EmojiPickerPresentOptions(presentation: "web", closeButton: closeButton, dismissOnBackdropTap: true)

/// Captures every script evaluated instead of touching a real `WKWebView`.
private final class FakeJsEvaluator {
    var evaluated: [String] = []

    func eval(_ js: String) {
        evaluated.append(js)
    }
}

/// Captures scheduled work so tests can fire it (or not) on demand instead of waiting real time.
private final class FakeScheduler {
    var scheduledWork: (() -> Void)?

    func schedule(_ delay: TimeInterval, _ work: @escaping () -> Void) {
        scheduledWork = work
    }

    func fire() {
        scheduledWork?()
    }
}

/// Extracts the `requestId` this presenter generated from the evaluated JS string, e.g.
/// `"window.__CapacitorEmojiPickerPresentWeb('<id>', '...')"`.
private func requestId(from js: String) -> String {
    let afterOpenParen = js.components(separatedBy: "('")[1]
    return String(afterOpenParen.prefix(while: { $0 != "'" }))
}

final class WebFallbackEmojiPickerPresenterTests: XCTestCase {
    func testEvaluatesJsWithEncodedOptions() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        presenter.present(options: webOptions) { _ in }

        XCTAssertEqual(evaluator.evaluated.count, 1)
        let js = evaluator.evaluated[0]
        XCTAssertTrue(js.contains("window.__CapacitorEmojiPickerPresentWeb("))
        XCTAssertTrue(js.contains("\"dismissOnBackdropTap\":true"))
        XCTAssertTrue(js.contains("\"size\":\"medium\""))
        XCTAssertTrue(js.contains("\"position\":\"right\""))
        XCTAssertTrue(js.contains("\"hidden\":false"))
    }

    func testHandleBridgeMessageResolvesTheMatchingPendingCompletion() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "resolved")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertEqual(pickerResult.emoji, "😀")
                expectation.fulfill()
            }
        }

        let id = requestId(from: evaluator.evaluated[0])
        presenter.handleBridgeMessage(requestId: id, emoji: "😀", errorCode: nil)

        wait(for: [expectation], timeout: 1)
    }

    func testHandleBridgeMessageWithErrorCodeReportsError() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "rejected")
        presenter.present(options: webOptions) { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error.code, ErrorCodes.notImplemented)
                expectation.fulfill()
            }
        }

        let id = requestId(from: evaluator.evaluated[0])
        presenter.handleBridgeMessage(requestId: id, emoji: nil, errorCode: ErrorCodes.notImplemented)

        wait(for: [expectation], timeout: 1)
    }

    func testUnmatchedRequestIdIsIgnored() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        presenter.present(options: webOptions) { _ in
            XCTFail("should not be called for an unrelated request id")
        }

        presenter.handleBridgeMessage(requestId: "some-other-request-id", emoji: "😀", errorCode: nil)
    }

    func testTimeoutSettlesNotImplemented() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "timed out")
        presenter.present(options: webOptions) { result in
            if case .failure(let error) = result {
                XCTAssertEqual(error.code, ErrorCodes.notImplemented)
                expectation.fulfill()
            }
        }

        scheduler.fire()
        wait(for: [expectation], timeout: 1)
    }

    func testDismissEvaluatesDismissJsAndSettlesNil() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "dismissed")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertNil(pickerResult.emoji)
                expectation.fulfill()
            }
        }

        let id = requestId(from: evaluator.evaluated[0])
        presenter.dismiss(requestId: id)

        XCTAssertTrue(evaluator.evaluated[1].contains("__CapacitorEmojiPickerDismissWeb"))
        wait(for: [expectation], timeout: 1)
    }

    func testAppBackgroundingDismissesAPendingPresentation() {
        let evaluator = FakeJsEvaluator()
        let scheduler = FakeScheduler()
        let presenter = WebFallbackEmojiPickerPresenter(jsEvaluator: evaluator.eval, scheduler: scheduler.schedule)

        let expectation = expectation(description: "dismissed on backgrounding")
        presenter.present(options: webOptions) { result in
            if case .success(let pickerResult) = result {
                XCTAssertNil(pickerResult.emoji)
                expectation.fulfill()
            }
        }

        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)

        wait(for: [expectation], timeout: 1)
        XCTAssertTrue(evaluator.evaluated[1].contains("__CapacitorEmojiPickerDismissWeb"))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:ios` (or `xcodebuild test -scheme EmojiPicker ...` per `scripts/verify-ios.js` if available locally)
Expected: FAIL — `WebFallbackEmojiPickerPresenter` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `ios/Sources/EmojiPicker/Presenter/WebFallbackEmojiPickerPresenter.swift`:

```swift
import UIKit

/// Presents the web bottom sheet inside the app's own Capacitor webview by evaluating JS there
/// (registered by `registerNativeWebBridge()` in the JS layer), and resolves once that JS
/// reports back via `handleBridgeMessage`. Kept independent of any real `WKWebView` type so it
/// stays unit-testable: production wiring in `EmojiPicker.load()` supplies a JS evaluator backed
/// by `WKWebView.evaluateJavaScript`, tests supply a fake one.
final class WebFallbackEmojiPickerPresenter: EmojiPickerPresenter {
    /// How long to wait for the JS side to report back before giving up.
    static let timeoutSeconds: TimeInterval = 3

    private let jsEvaluator: (String) -> Void
    private let scheduler: (TimeInterval, @escaping () -> Void) -> Void
    private var pending: [String: PendingRequest] = [:]

    convenience init(jsEvaluator: @escaping (String) -> Void) {
        self.init(jsEvaluator: jsEvaluator) { delay, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        }
    }

    /// Internal: lets tests inject a fake scheduler instead of waiting real time.
    init(jsEvaluator: @escaping (String) -> Void, scheduler: @escaping (TimeInterval, @escaping () -> Void) -> Void) {
        self.jsEvaluator = jsEvaluator
        self.scheduler = scheduler
    }

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        let requestId = UUID().uuidString

        scheduler(Self.timeoutSeconds) { [weak self] in
            self?.settle(requestId: requestId, emoji: nil, errorCode: ErrorCodes.notImplemented)
        }

        // Belt-and-suspenders, mirroring `NativeEmojiPickerPresenter`'s own backgrounding safety
        // net: force-dismiss (and tell the JS sheet to close) if the app backgrounds mid-presentation,
        // since there's no guarantee the JS side's own bridge call ever lands in that case.
        let resignActiveObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.dismiss(requestId: requestId)
        }

        pending[requestId] = PendingRequest(completion: completion, resignActiveObserver: resignActiveObserver)

        let json = Self.encodeOptionsJson(dismissOnBackdropTap: options.dismissOnBackdropTap, closeButton: options.closeButton)
        jsEvaluator("window.__CapacitorEmojiPickerPresentWeb('\(requestId)', '\(json)')")
    }

    /// Called by the `WKScriptMessageHandler` once the JS sheet settles.
    func handleBridgeMessage(requestId: String, emoji: String?, errorCode: String?) {
        settle(requestId: requestId, emoji: emoji, errorCode: errorCode)
    }

    /// Force-dismisses a still-pending presentation (e.g. on app backgrounding).
    func dismiss(requestId: String) {
        jsEvaluator("window.__CapacitorEmojiPickerDismissWeb && window.__CapacitorEmojiPickerDismissWeb('\(requestId)')")
        settle(requestId: requestId, emoji: nil, errorCode: nil)
    }

    private func settle(requestId: String, emoji: String?, errorCode: String?) {
        guard let request = pending.removeValue(forKey: requestId) else { return }
        NotificationCenter.default.removeObserver(request.resignActiveObserver)
        if let errorCode = errorCode {
            request.completion(.failure(EmojiPickerError(code: errorCode)))
        } else {
            request.completion(.success(EmojiPickerResult(emoji: emoji)))
        }
    }

    /// Hand-rolled instead of `JSONSerialization`: `size`/`position` are always one of a small
    /// fixed set of ASCII enum values validated/defaulted when the plugin call is parsed, never
    /// arbitrary user text, so plain string interpolation is safe here.
    private static func encodeOptionsJson(dismissOnBackdropTap: Bool, closeButton: EmojiCloseButtonOptions) -> String {
        "{\"dismissOnBackdropTap\":\(dismissOnBackdropTap),\"closeButton\":{\"size\":\"\(closeButton.size)\",\"position\":\"\(closeButton.position)\",\"hidden\":\(closeButton.hidden)}}"
    }

    private struct PendingRequest {
        let completion: (Result<EmojiPickerResult, EmojiPickerError>) -> Void
        let resignActiveObserver: NSObjectProtocol
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:ios`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add ios/Sources/EmojiPicker/Presenter/WebFallbackEmojiPickerPresenter.swift \
        ios/Tests/EmojiPickerTests/WebFallbackEmojiPickerPresenterTests.swift
git commit -m "feat(ios): add WebFallbackEmojiPickerPresenter"
```

---

## Task 7: iOS wiring — dispatcher, script message handler, plugin `load()`

**Files:**
- Create: `ios/Sources/EmojiPicker/Presenter/DispatchingEmojiPickerPresenter.swift`
- Create: `ios/Sources/EmojiPicker/Bridge/EmojiPickerScriptMessageHandler.swift`
- Modify: `ios/Sources/EmojiPicker/Bridge/EmojiPicker.swift`
- Test: `ios/Tests/EmojiPickerTests/DispatchingEmojiPickerPresenterTests.swift`

**Interfaces:**
- Consumes: `EmojiPickerPresenter`, `WebFallbackEmojiPickerPresenter` from Task 6.
- Produces: `DispatchingEmojiPickerPresenter: EmojiPickerPresenter`, `init(nativePresenter:webFallbackPresenter:)` — routes by `options.presentation == "web"`. `EmojiPickerScriptMessageHandler: NSObject, WKScriptMessageHandler`, `init(presenter: WebFallbackEmojiPickerPresenter)`.

- [ ] **Step 1: Write the failing test**

Create `ios/Tests/EmojiPickerTests/DispatchingEmojiPickerPresenterTests.swift`:

```swift
import XCTest
@testable import EmojiPicker

private let closeButton = EmojiCloseButtonOptions(size: "medium", position: "right", hidden: false)

private final class RecordingPresenter: EmojiPickerPresenter {
    var lastPresentation: String?
    var callCount = 0

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        lastPresentation = options.presentation
        callCount += 1
        completion(.success(EmojiPickerResult(emoji: nil)))
    }
}

final class DispatchingEmojiPickerPresenterTests: XCTestCase {
    func testRoutesAutoToTheNativePresenter() {
        let nativePresenter = RecordingPresenter()
        let webFallbackPresenter = RecordingPresenter()
        let dispatcher = DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)

        let options = EmojiPickerPresentOptions(presentation: "auto", closeButton: closeButton, dismissOnBackdropTap: true)
        dispatcher.present(options: options) { _ in }

        XCTAssertEqual(nativePresenter.callCount, 1)
        XCTAssertEqual(webFallbackPresenter.callCount, 0)
    }

    func testRoutesWebToTheWebFallbackPresenter() {
        let nativePresenter = RecordingPresenter()
        let webFallbackPresenter = RecordingPresenter()
        let dispatcher = DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)

        let options = EmojiPickerPresentOptions(presentation: "web", closeButton: closeButton, dismissOnBackdropTap: true)
        dispatcher.present(options: options) { _ in }

        XCTAssertEqual(nativePresenter.callCount, 0)
        XCTAssertEqual(webFallbackPresenter.callCount, 1)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:ios`
Expected: FAIL — `DispatchingEmojiPickerPresenter` doesn't exist yet.

- [ ] **Step 3: Implement the dispatcher**

Create `ios/Sources/EmojiPicker/Presenter/DispatchingEmojiPickerPresenter.swift`:

```swift
import Foundation

/// Picks between the native and web-fallback presenters by `options.presentation`, so
/// `EmojiPickerService`'s single concurrency guard covers both paths uniformly - from its point
/// of view this is just another `EmojiPickerPresenter`.
final class DispatchingEmojiPickerPresenter: EmojiPickerPresenter {
    private let nativePresenter: EmojiPickerPresenter
    private let webFallbackPresenter: EmojiPickerPresenter

    init(nativePresenter: EmojiPickerPresenter, webFallbackPresenter: EmojiPickerPresenter) {
        self.nativePresenter = nativePresenter
        self.webFallbackPresenter = webFallbackPresenter
    }

    func present(options: EmojiPickerPresentOptions, completion: @escaping (Result<EmojiPickerResult, EmojiPickerError>) -> Void) {
        let target = options.presentation == "web" ? webFallbackPresenter : nativePresenter
        target.present(options: options, completion: completion)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:ios`
Expected: PASS.

- [ ] **Step 5: Create the script message handler**

Create `ios/Sources/EmojiPicker/Bridge/EmojiPickerScriptMessageHandler.swift`:

```swift
import WebKit

/// Registered on the Capacitor webview's `WKUserContentController`
/// (`userContentController.add(self, name: "capacitorEmojiPickerBridge")`) so the web bottom
/// sheet can report its outcome back to a `WebFallbackEmojiPickerPresenter` once it settles.
final class EmojiPickerScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private let presenter: WebFallbackEmojiPickerPresenter

    init(presenter: WebFallbackEmojiPickerPresenter) {
        self.presenter = presenter
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let requestId = body["requestId"] as? String else {
            return
        }
        presenter.handleBridgeMessage(requestId: requestId, emoji: body["emoji"] as? String, errorCode: body["error"] as? String)
    }
}
```

- [ ] **Step 6: Wire it all up in `EmojiPicker.swift`**

In `ios/Sources/EmojiPicker/Bridge/EmojiPicker.swift`, add `import WebKit`, a stored property to retain the handler (`WKUserContentController.add(_:name:)` retains it strongly, but keeping an explicit reference documents the ownership and avoids relying on that implementation detail), and update `load()`:

```swift
import Foundation
import Capacitor
import WebKit

/// Capacitor bridge for the EmojiPicker plugin.
@objc(EmojiPicker)
public class EmojiPicker: CAPPlugin, CAPBridgedPlugin {
    /// Plugin identifier used by Capacitor.
    public let identifier = "EmojiPicker"
    /// JavaScript name used for the plugin proxy.
    public let jsName = "EmojiPicker"
    /// Supported plugin methods exposed to the JS layer.
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    /// Service layer that owns presentation flow and concurrency guarding.
    private var service: EmojiPickerService?
    /// Retained so it isn't deallocated out from under the `WKUserContentController`.
    private var scriptMessageHandler: EmojiPickerScriptMessageHandler?

    /// Initializes dependencies after the plugin loads.
    public override func load() {
        super.load()
        let nativePresenter = NativeEmojiPickerPresenter(
            hostViewControllerProvider: { [weak self] in self?.bridge?.viewController },
            factory: DefaultEmojiKeyboardPresentationFactory()
        )
        let webFallbackPresenter = WebFallbackEmojiPickerPresenter(jsEvaluator: { [weak self] js in
            self?.bridge?.webView?.evaluateJavaScript(js)
        })
        let handler = EmojiPickerScriptMessageHandler(presenter: webFallbackPresenter)
        scriptMessageHandler = handler
        bridge?.webView?.configuration.userContentController.add(handler, name: "capacitorEmojiPickerBridge")

        service = EmojiPickerService(
            presenter: DispatchingEmojiPickerPresenter(nativePresenter: nativePresenter, webFallbackPresenter: webFallbackPresenter)
        )
    }

    func configureForTesting(service: EmojiPickerService?) {
        self.service = service
    }

    /// Presents the emoji picker.
    @objc func present(_ call: CAPPluginCall) {
        guard let service = service else {
            call.reject(ErrorCodes.notImplemented, ErrorCodes.notImplemented)
            return
        }

        let closeButtonObject = call.getObject("closeButton")
        let options = EmojiPickerPresentOptions(
            presentation: call.getString("presentation") ?? "auto",
            closeButton: EmojiCloseButtonOptions(
                size: closeButtonObject?["size"] as? String ?? "medium",
                position: closeButtonObject?["position"] as? String ?? "right",
                hidden: closeButtonObject?["hidden"] as? Bool ?? false
            ),
            dismissOnBackdropTap: call.getBool("dismissOnBackdropTap") ?? true
        )
        service.present(options: options) { result in
            switch result {
            case .success(let pickerResult):
                call.resolve(["emoji": pickerResult.emoji as Any])
            case .failure(let error):
                call.reject(error.code, error.code)
            }
        }
    }
}
```

- [ ] **Step 7: Run the full iOS test suite and commit**

Run: `pnpm run test:ios`
Expected: PASS, full suite (including existing `EmojiPickerServiceTests`, `NativeEmojiPickerPresenterTests`, `EmojiTextFieldDelegateTests`, unaffected).

```bash
git add ios/Sources/EmojiPicker/Presenter/DispatchingEmojiPickerPresenter.swift \
        ios/Sources/EmojiPicker/Bridge/EmojiPickerScriptMessageHandler.swift \
        ios/Sources/EmojiPicker/Bridge/EmojiPicker.swift \
        ios/Tests/EmojiPickerTests/DispatchingEmojiPickerPresenterTests.swift
git commit -m "feat(ios): wire presentation:'web' to the JS bottom sheet"
```

---

## Task 8: Docs + manual verification

**Files:**
- Modify: `CLAUDE.md` (the "Platform Notes & Safety" section's now-outdated note)
- Modify: `README.md` if `pnpm docgen` output changed (it shouldn't for this task — no `EmojiPickerOptions`/`EmojiPickerPlugin` doc-comment changes were made)

**Interfaces:** None — this task is verification and doc cleanup only.

- [ ] **Step 1: Update the outdated CLAUDE.md note**

In `CLAUDE.md`, under "## Platform Notes & Safety", replace:

```
- Platform presentation (web, Android, iOS) is implemented in follow-up issues. The web picker and the Android and
  iOS native pickers are implemented. On both Android and iOS, `presentation: 'web'` currently rejects with
  `NOT_IMPLEMENTED` (native-to-web fallback is a separate follow-up issue, not yet wired up).
```

with:

```
- Platform presentation (web, Android, iOS) is implemented. The web picker and the Android and iOS native pickers
  are implemented, and explicit `presentation: 'web'` on Android/iOS presents the same web bottom sheet inside the
  app's own webview via a native<->JS bridge. `presentation: 'auto'`'s native-fails-so-fall-back-to-web behavior
  is a separate, still-unimplemented follow-up.
```

- [ ] **Step 2: Full verification run**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass, `README.md` unchanged by `docgen` (no public option doc comments changed in this plan).

- [ ] **Step 3: Manual device/simulator check**

In the `example/` app, add a way to call `EmojiPicker.present({ presentation: 'web' })` (e.g. a second button alongside whatever already triggers `present()`), then:
- Run on iOS simulator: tap it, confirm the same bottom sheet from the pure-web build appears over the native UI, resolves on emoji tap, dismisses on backdrop tap/close button, and backgrounding the app while it's open dismisses it (check Xcode console/UI afterward — a second `present()` call should succeed immediately, proving the guard was released).
- Run on Android emulator/device: same checks.
- Confirm `presentation: 'auto'` (the default) still shows the native picker unchanged on both platforms.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update platform notes now that presentation:'web' works everywhere"
```
