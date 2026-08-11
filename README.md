<p align="center">
  <img src="https://user-images.githubusercontent.com/236501/85893648-1c92e880-b7a8-11ea-926d-95355b8175c7.png" width="128" height="128" alt="CapacitorJS Logo" />
</p>
<h3 align="center">Capacitor Emoji Picker</h3>
<p align="center"><strong><code>@independo/capacitor-emoji-picker</code></strong></p>
<p align="center">Capacitor plugin for presenting an emoji picker</p>

<p align="center">
  <img src="https://img.shields.io/maintenance/yes/2026" alt="Maintenance Badge: until 2026" />
  <a href="https://www.npmjs.com/package/@independo/capacitor-emoji-picker"><img src="https://img.shields.io/npm/l/@independo/capacitor-emoji-picker" alt="License Badge: MIT" /></a>
<br>
  <a href="https://www.npmjs.com/package/@independo/capacitor-emoji-picker"><img src="https://img.shields.io/npm/dw/@independo/capacitor-emoji-picker" alt="" role="presentation" /></a>
  <a href="https://www.npmjs.com/package/@independo/capacitor-emoji-picker"><img src="https://img.shields.io/npm/v/@independo/capacitor-emoji-picker" alt="" role="presentation" /></a>
  <a href="https://codecov.io/gh/independo-gmbh/capacitor-emoji-picker/branch/main"><img src="https://codecov.io/gh/independo-gmbh/capacitor-emoji-picker/branch/main/graph/badge.svg" alt="Coverage Badge: main" /></a>
</p>

## Overview

The `@independo/capacitor-emoji-picker` plugin presents an emoji picker on Android, iOS, and Web
and resolves with the emoji the user selected.

> **Status:** the web picker (via [`emoji-picker-element`](https://github.com/nolanlawson/emoji-picker-element))
> and the Android native picker (via [`androidx.emoji2:emoji2-emojipicker`](https://developer.android.com/jetpack/androidx/releases/emoji2))
> are implemented. iOS native presentation will be implemented in a follow-up release; until then
> `present()` rejects with a `NOT_IMPLEMENTED` error on iOS.

The web picker self-hosts its emoji dataset as a same-origin `blob:` object URL (rather than
fetching it from `emoji-picker-element`'s default CDN). Apps with a restrictive Content-Security-Policy
need to allow `blob:` in `connect-src`/`default-src` for this dataset to load.

## Installation

```
pnpm add @independo/capacitor-emoji-picker
pnpm exec cap sync
```

## API

<docgen-index>

* [`present(...)`](#present)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Interface for the EmojiPicker plugin, which presents a native or web emoji picker and
resolves with the emoji the user selected.

### present(...)

```typescript
present(options?: EmojiPickerOptions | undefined) => Promise<EmojiPickerResult>
```

Presents the emoji picker.

Resolves with `{ emoji: null }` rather than leaving the promise pending when the user
dismisses the picker without selecting an emoji.

Calling this method again while a picker is already active rejects immediately with the
`ALREADY_PRESENTING` error code rather than presenting a second, overlapping picker.

On Android, if native presentation fails (e.g. no Activity is available, or the picker dialog
could not be created), the call rejects with the `NATIVE_UNAVAILABLE` error code — distinct from
the user simply dismissing the picker without selecting an emoji, which resolves with
`{ emoji: null }` instead.

| Param         | Type                                                              | Description                       |
| ------------- | ----------------------------------------------------------------- | --------------------------------- |
| **`options`** | <code><a href="#emojipickeroptions">EmojiPickerOptions</a></code> | The options for the presentation. |

**Returns:** <code>Promise&lt;<a href="#emojipickerresult">EmojiPickerResult</a>&gt;</code>

--------------------


### Interfaces


#### EmojiPickerResult

Result of presenting the emoji picker.

| Prop        | Type                        | Description                                                                                                                        |
| ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **`emoji`** | <code>string \| null</code> | The selected emoji as a complete Unicode string/grapheme (unchanged), or `null` when the picker was dismissed without a selection. |


#### EmojiPickerOptions

Options for presenting the emoji picker.

| Prop               | Type                                                                        | Description                                                                                                                                                                                   | Default             |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **`presentation`** | <code><a href="#emojipickerpresentation">EmojiPickerPresentation</a></code> | `auto`: prefer native/system UI and fall back to the web picker when native presentation is not available or fails. `web`: always use the web picker, including inside Capacitor native apps. | <code>'auto'</code> |


### Type Aliases


#### EmojiPickerPresentation

How the picker should be presented.

<code>'auto' | 'web'</code>

</docgen-api>
