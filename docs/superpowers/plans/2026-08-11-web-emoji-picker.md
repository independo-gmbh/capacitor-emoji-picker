# Web Emoji Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issue #3 — the browser/web emoji picker presentation, backed by `emoji-picker-element`, that `EmojiPickerWeb` uses on the web platform and that later native-fallback orchestration (issue #6) can reuse directly.

**Architecture:** `EmojiPickerWebAdapter` (implements the existing `EmojiPickerPlatform` interface consumed by `EmojiPickerService`) delegates to a new standalone `WebEmojiPickerPresenter` class that owns all DOM work: creating a backdrop, mounting `<emoji-picker>`, wiring `emoji-click`/backdrop-click/Escape dismissal, and cleaning up. The emoji dataset is self-hosted via a `Blob` object URL built from the `emoji-picker-element-data` package's bundled JSON, so the picker never fetches from the default jsDelivr CDN.

**Tech Stack:** TypeScript, `emoji-picker-element` (web component, zero runtime deps), `emoji-picker-element-data` (bundled JSON dataset), Jest + jsdom, Rollup (`@rollup/plugin-json` + `@rollup/plugin-node-resolve` added for the single-file `dist/plugin.js`/`dist/plugin.cjs.js` bundles).

## Global Constraints

- `EmojiPicker.present({ presentation: 'web' })` must open the web picker (and `'auto'`/undefined too, since web has no other option).
- Selecting an emoji resolves `{ emoji: <exact unicode string> }` — skin-tone variants and multi-code-point (ZWJ) emoji must pass through unchanged.
- Dismissing via backdrop click or Escape resolves `{ emoji: null }` exactly once (never leaves the promise pending, never resolves twice).
- All DOM nodes and event listeners must be cleaned up after selection/dismissal — repeated open/close cycles must not leave stale nodes.
- Support light/dark appearance (handled automatically by `emoji-picker-element` via `prefers-color-scheme`) and sensible mobile sizing.
- The presenter (`WebEmojiPickerPresenter`) must be usable independently of `EmojiPickerWebAdapter`/plugin registration, since issue #6's native-fallback orchestration will import it directly.
- The emoji dataset must not require an external CDN at runtime — self-host via the bundled `emoji-picker-element-data` package.
- `jsdom` (the test environment) does not implement `URL.createObjectURL` — tests must stub it.

---

## File Structure

- `src/platform/web/emoji-data-source.ts` — builds and caches a same-origin `Blob` object URL from the bundled dataset JSON.
- `src/platform/web/WebEmojiPickerPresenter.ts` — DOM presentation: backdrop, `<emoji-picker>` element, event wiring, cleanup. Exported standalone for reuse by future fallback orchestration.
- `src/platform/web/EmojiPickerWebAdapter.ts` — existing file, modified to delegate to `WebEmojiPickerPresenter` instead of rejecting `NOT_IMPLEMENTED`.
- `test/platform/web/emoji-data-source.test.ts`, `test/platform/web/WebEmojiPickerPresenter.test.ts` — new tests.
- `test/platform/web/EmojiPickerWebAdapter.test.ts` — existing file, modified (no longer asserts `NOT_IMPLEMENTED`).
- `package.json`, `tsconfig.json`, `rollup.config.mjs` — modified for the new dependencies and JSON bundling.
- `README.md` — status paragraph updated to reflect the web picker being implemented.

---

### Task 1: Self-hosted emoji dataset source

**Files:**
- Modify: `package.json` (add `dependencies.emoji-picker-element-data`)
- Modify: `tsconfig.json` (add `resolveJsonModule`)
- Create: `src/platform/web/emoji-data-source.ts`
- Test: `test/platform/web/emoji-data-source.test.ts`

**Interfaces:**
- Produces: `getBundledEmojiDataSourceUrl(): string` — exported from `src/platform/web/emoji-data-source.ts`. Called by Task 2's `WebEmojiPickerPresenter`.

- [ ] **Step 1: Add the dataset dependency**

```bash
cd /Users/konstantin/WebstormProjects/capacitor-emoji-picker
pnpm add emoji-picker-element-data@^1.8.0
```

This adds `"emoji-picker-element-data": "^1.8.0"` under `dependencies` in `package.json` (create the `dependencies` key if `pnpm add` doesn't find one already — the existing `package.json` currently has no `dependencies` field, only `devDependencies`/`peerDependencies`).

- [ ] **Step 2: Enable JSON module resolution**

In `tsconfig.json`, add `"resolveJsonModule": true` to `compilerOptions` (alphabetically after `"pretty": true` and before `"sourceMap": true`, matching the existing alphabetical ordering):

```json
{
  "compilerOptions": {
    "allowUnreachableCode": false,
    "declaration": true,
    "esModuleInterop": true,
    "inlineSources": true,
    "lib": ["dom", "es2017"],
    "module": "esnext",
    "moduleResolution": "node",
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist/esm",
    "pretty": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "strict": true,
    "target": "es2017"
  },
  "files": ["src/index.ts"]
}
```

- [ ] **Step 3: Write the failing test**

Create `test/platform/web/emoji-data-source.test.ts`:

```typescript
import { getBundledEmojiDataSourceUrl } from '../../../src/platform/web/emoji-data-source';

describe('getBundledEmojiDataSourceUrl', () => {
    beforeAll(() => {
        (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock-url');
    });

    it('creates and caches a blob URL for the bundled dataset', () => {
        const first = getBundledEmojiDataSourceUrl();
        const second = getBundledEmojiDataSourceUrl();

        expect(first).toBe('blob:mock-url');
        expect(second).toBe('blob:mock-url');
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm run test:web -- test/platform/web/emoji-data-source.test.ts`
Expected: FAIL — `Cannot find module '../../../src/platform/web/emoji-data-source'`

- [ ] **Step 5: Write the implementation**

Create `src/platform/web/emoji-data-source.ts`:

```typescript
import data from 'emoji-picker-element-data/en/emojibase/data.json';

let cachedDataSourceUrl: string | undefined;

/**
 * Returns a same-origin object URL serving the bundled emoji dataset, so the web picker
 * never depends on `emoji-picker-element`'s default jsDelivr CDN at runtime.
 */
export function getBundledEmojiDataSourceUrl(): string {
    if (!cachedDataSourceUrl) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        cachedDataSourceUrl = URL.createObjectURL(blob);
    }
    return cachedDataSourceUrl;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm run test:web -- test/platform/web/emoji-data-source.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json src/platform/web/emoji-data-source.ts test/platform/web/emoji-data-source.test.ts
git commit -m "feat: self-host emoji dataset via bundled emoji-picker-element-data"
```

---

### Task 2: Web picker presenter (DOM, dismissal, cleanup)

**Files:**
- Create: `src/platform/web/WebEmojiPickerPresenter.ts`
- Test: `test/platform/web/WebEmojiPickerPresenter.test.ts`

**Interfaces:**
- Consumes: `getBundledEmojiDataSourceUrl(): string` from Task 1.
- Produces: `WebEmojiPickerPresenter` class with `present(): Promise<EmojiPickerResult>` and constructor `(options?: { createPickerElement?: () => Promise<EmojiPickerElement> })`. Exports `EmojiPickerElement` interface (`HTMLElement & { dataSource: string }`). Consumed by Task 3's `EmojiPickerWebAdapter`.

- [ ] **Step 1: Write the failing tests**

Create `test/platform/web/WebEmojiPickerPresenter.test.ts`:

```typescript
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
        backdrop.dispatchEvent(new MouseEvent('click'));
        // A second click after dismissal must not throw or resolve a second time.
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:web -- test/platform/web/WebEmojiPickerPresenter.test.ts`
Expected: FAIL — `Cannot find module '../../../src/platform/web/WebEmojiPickerPresenter'`

- [ ] **Step 3: Write the implementation**

Create `src/platform/web/WebEmojiPickerPresenter.ts`:

```typescript
import type { EmojiPickerResult } from '../../definitions';
import { getBundledEmojiDataSourceUrl } from './emoji-data-source';

/** Minimal shape of the `<emoji-picker>` custom element this presenter depends on. */
export interface EmojiPickerElement extends HTMLElement {
    dataSource: string;
}

/** Registers `<emoji-picker>` (if needed) and creates the element. */
async function defaultCreatePickerElement(): Promise<EmojiPickerElement> {
    await import('emoji-picker-element');
    return document.createElement('emoji-picker') as unknown as EmojiPickerElement;
}

export interface WebEmojiPickerPresenterOptions {
    /** Creates the picker element. Overridable for testing. */
    createPickerElement?: () => Promise<EmojiPickerElement>;
}

/**
 * Presents `emoji-picker-element` in a backdrop and resolves with the selected emoji.
 *
 * Kept independent of the Capacitor web plugin registration so native-platform fallback
 * orchestration (issue #6) can present the same web picker from inside a native WebView.
 */
export class WebEmojiPickerPresenter {
    private readonly createPickerElement: () => Promise<EmojiPickerElement>;

    public constructor(options: WebEmojiPickerPresenterOptions = {}) {
        this.createPickerElement = options.createPickerElement ?? defaultCreatePickerElement;
    }

    public async present(): Promise<EmojiPickerResult> {
        const picker = await this.createPickerElement();
        picker.dataSource = getBundledEmojiDataSourceUrl();
        picker.style.width = 'min(100%, 22rem)';
        picker.style.maxHeight = '80vh';

        const backdrop = document.createElement('div');
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.style.background = 'rgba(0, 0, 0, 0.4)';
        backdrop.style.zIndex = '2147483647';

        return new Promise<EmojiPickerResult>((resolve) => {
            let settled = false;

            const settle = (result: EmojiPickerResult) => {
                if (settled) {
                    return;
                }
                settled = true;
                picker.removeEventListener('emoji-click', onEmojiClick as EventListener);
                backdrop.removeEventListener('click', onBackdropClick);
                document.removeEventListener('keydown', onKeyDown);
                backdrop.remove();
                resolve(result);
            };

            const onEmojiClick = (event: CustomEvent<{ unicode?: string }>) => {
                settle({ emoji: event.detail.unicode ?? null });
            };

            const onBackdropClick = (event: MouseEvent) => {
                if (event.target === backdrop) {
                    settle({ emoji: null });
                }
            };

            const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    settle({ emoji: null });
                }
            };

            picker.addEventListener('emoji-click', onEmojiClick as EventListener);
            backdrop.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKeyDown);

            backdrop.appendChild(picker);
            document.body.appendChild(backdrop);
        });
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:web -- test/platform/web/WebEmojiPickerPresenter.test.ts`
Expected: PASS (6 tests)

If any test hangs/times out, the most likely cause is a missing `await flush();` between calling `presenter.present()` and dispatching an event (the picker/backdrop attach one microtask after `present()` is called, because `createPickerElement` is async) — add the missing flush rather than changing the implementation's timing.

- [ ] **Step 5: Commit**

```bash
git add src/platform/web/WebEmojiPickerPresenter.ts test/platform/web/WebEmojiPickerPresenter.test.ts
git commit -m "feat: add WebEmojiPickerPresenter for backdrop + emoji-picker-element wiring"
```

---

### Task 3: Wire EmojiPickerWebAdapter to the presenter

**Files:**
- Modify: `src/platform/web/EmojiPickerWebAdapter.ts`
- Modify: `test/platform/web/EmojiPickerWebAdapter.test.ts`
- Modify: `package.json` (add `dependencies.emoji-picker-element`)

**Interfaces:**
- Consumes: `WebEmojiPickerPresenter` from Task 2.
- Produces: `EmojiPickerWebAdapter` constructor now accepts an optional `WebEmojiPickerPresenter` (defaults to `new WebEmojiPickerPresenter()`), used unchanged by `EmojiPickerService`/`EmojiPickerWeb`.

- [ ] **Step 1: Add the `emoji-picker-element` dependency**

```bash
cd /Users/konstantin/WebstormProjects/capacitor-emoji-picker
pnpm add emoji-picker-element@^1.29.1
```

- [ ] **Step 2: Update the failing/outdated test**

Replace the contents of `test/platform/web/EmojiPickerWebAdapter.test.ts` (it currently asserts `NOT_IMPLEMENTED`, which is no longer correct):

```typescript
import type { EmojiPickerResult } from '../../../src/definitions';
import { EmojiPickerWebAdapter } from '../../../src/platform/web/EmojiPickerWebAdapter';
import type { WebEmojiPickerPresenter } from '../../../src/platform/web/WebEmojiPickerPresenter';

describe('EmojiPickerWebAdapter', () => {
    it('delegates present() to the web presenter', async () => {
        const result: EmojiPickerResult = { emoji: '😀' };
        const presenter = { present: jest.fn().mockResolvedValue(result) } as unknown as WebEmojiPickerPresenter;
        const adapter = new EmojiPickerWebAdapter(presenter);

        await expect(adapter.present({ presentation: 'web' })).resolves.toEqual(result);
        expect(presenter.present).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test:web -- test/platform/web/EmojiPickerWebAdapter.test.ts`
Expected: FAIL — the current implementation always rejects with `NOT_IMPLEMENTED`, so the assertion on `resolves.toEqual(result)` fails.

- [ ] **Step 4: Update the implementation**

Replace the contents of `src/platform/web/EmojiPickerWebAdapter.ts`:

```typescript
import type { EmojiPickerOptions, EmojiPickerResult } from '../../definitions';
import type { EmojiPickerPlatform } from '../../service/EmojiPickerService';
import { WebEmojiPickerPresenter } from './WebEmojiPickerPresenter';

/** Web adapter that presents `emoji-picker-element` in a backdrop. */
export class EmojiPickerWebAdapter implements EmojiPickerPlatform {
    private readonly presenter: WebEmojiPickerPresenter;

    public constructor(presenter: WebEmojiPickerPresenter = new WebEmojiPickerPresenter()) {
        this.presenter = presenter;
    }

    /** Presents the web picker. `options` is unused: web has no separate native/web mode. */
    public present(_options?: EmojiPickerOptions): Promise<EmojiPickerResult> {
        return this.presenter.present();
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test:web -- test/platform/web/EmojiPickerWebAdapter.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm run test:web`
Expected: PASS (all suites, including the pre-existing `EmojiPickerService.test.ts`)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/platform/web/EmojiPickerWebAdapter.ts test/platform/web/EmojiPickerWebAdapter.test.ts
git commit -m "feat: present the web emoji picker instead of rejecting NOT_IMPLEMENTED"
```

---

### Task 4: Bundle emoji-picker-element/data into the Rollup output

**Files:**
- Modify: `rollup.config.mjs`
- Modify: `package.json` (add `@rollup/plugin-json`, `@rollup/plugin-node-resolve` to `devDependencies`)

**Interfaces:** None (build configuration only).

- [ ] **Step 1: Add the Rollup plugins**

```bash
cd /Users/konstantin/WebstormProjects/capacitor-emoji-picker
pnpm add -D @rollup/plugin-json@^6.1.0 @rollup/plugin-node-resolve@^16.0.3
```

- [ ] **Step 2: Update the Rollup config**

Replace the contents of `rollup.config.mjs`:

```javascript
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'dist/esm/index.js',
  output: [
    {
      file: 'dist/plugin.js',
      format: 'iife',
      name: 'capacitorEmojiPicker',
      globals: {
        '@capacitor/core': 'capacitorExports',
      },
      sourcemap: true,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  external: ['@capacitor/core'],
  plugins: [nodeResolve(), json()],
};
```

`nodeResolve()` lets Rollup locate the bare `emoji-picker-element` / `emoji-picker-element-data/...` specifiers in `node_modules` (previously only `@capacitor/core` was imported, and it's `external` so resolution was never needed). `json()` lets Rollup inline the dataset JSON directly into the bundle instead of erroring on a non-JS import.

- [ ] **Step 3: Run the full build**

Run: `pnpm run build`
Expected: succeeds; `dist/plugin.js` and `dist/plugin.cjs.js` are produced.

- [ ] **Step 4: Verify the bundle is self-contained**

Run:
```bash
grep -c "emoji-picker" dist/plugin.js
grep -c "createObjectURL" dist/plugin.js
```
Expected: both return a non-zero count (the web component and the data-source helper were inlined, not left as external `require`/`import` calls).

- [ ] **Step 5: Run lint and the full test suite**

Run: `pnpm run lint && pnpm run test:web`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml rollup.config.mjs
git commit -m "build: bundle emoji-picker-element and its dataset into the Rollup output"
```

---

### Task 5: Update docs and manually verify in the example app

**Files:**
- Modify: `README.md`

**Interfaces:** None.

- [ ] **Step 1: Update the status note**

In `README.md`, replace:

```markdown
> **Status:** this package currently ships the plugin scaffolding and public API surface. Platform
> presentation (web, Android, iOS) is implemented in follow-up releases; until then `present()`
> rejects with a `NOT_IMPLEMENTED` error on every platform.
```

with:

```markdown
> **Status:** the web picker (via [`emoji-picker-element`](https://github.com/nolanlawson/emoji-picker-element))
> is implemented. Android and iOS native presentation are implemented in follow-up releases; until
> then `present()` rejects with a `NOT_IMPLEMENTED` error on those platforms.
```

- [ ] **Step 2: Regenerate docs and rebuild**

Run: `pnpm run build`
Expected: succeeds (also re-verifies Task 4's bundling after the dependency/lockfile changes).

- [ ] **Step 3: Manually verify in the example app**

```bash
cd /Users/konstantin/WebstormProjects/capacitor-emoji-picker
pnpm -C example run build
pnpm -C example run start
```

Open `http://localhost:5173` in a browser (or use the `claude-in-chrome` tools). Click "Present emoji picker (auto)":
- Expected: a real emoji picker grid renders in a centered modal over a dark backdrop, not the previous `NOT_IMPLEMENTED` error text.
- Click an emoji: the modal closes and "Selected emoji" shows the exact emoji you clicked.
- Click "Present emoji picker (auto)" again, then click outside the picker (on the dark backdrop): the modal closes and "Selected emoji" reverts to showing nothing selected for that run (no error).

Stop the dev server afterward (`Ctrl+C`, or kill the background process).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update status note now that the web picker is implemented"
```

---

## Self-Review Notes

- **Spec coverage:** `emoji-picker-element` dependency (Task 3), modal/backdrop for desktop + WebViews (Task 2), `emoji-click` → `event.detail.unicode` (Task 2), dismissal → `{ emoji: null }` exactly once (Task 2), DOM/listener cleanup across cycles (Task 2), light/dark + mobile sizing (Task 2, relies on `emoji-picker-element`'s built-in `prefers-color-scheme` support plus inline width/max-height), presenter reusable by future fallback orchestration (Task 2 — standalone exported class, not coupled to `EmojiPickerWebAdapter`), self-hosted dataset / no CDN dependency (Task 1), works in example app on web (Task 5). Android/iOS WebView manual verification is out of scope for this issue's automated checks (issue #7 owns cross-platform example/test coverage) but the implementation makes no web-only assumptions (no `window.top`, no non-WebView-safe APIs).
- **Placeholder scan:** none found — every step has concrete code or exact commands.
- **Type consistency:** `EmojiPickerElement` (Task 2) is consumed identically in Task 2's tests and Task 3's `EmojiPickerWebAdapter`; `WebEmojiPickerPresenter.present(): Promise<EmojiPickerResult>` matches the `EmojiPickerPlatform.present()` signature `EmojiPickerWebAdapter` must satisfy (from the existing `src/service/EmojiPickerService.ts`).
