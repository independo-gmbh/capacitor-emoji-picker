# Manual QA checklist

Behavior that automated tests cannot reliably cover, especially the iOS system emoji keyboard, must be verified
manually on real devices before each release. Use the example app (`example/`) with both the `present-auto` and
`present-web` buttons.

## Matrix

Run the full checklist below on:

- [ ] Latest supported iOS version, real device
- [ ] Oldest supported iOS version, real device
- [ ] Latest supported Android version, real device
- [ ] Oldest supported Android version, real device or emulator

## Checklist (per target above)

- [ ] Light mode: picker renders correctly, matches system/app appearance
- [ ] Dark mode: picker renders correctly, matches system/app appearance
- [ ] Standard emoji selection returns the correct Unicode string
- [ ] Skin tone variant selection returns the correct Unicode string
- [ ] Flag emoji selection returns the correct Unicode string
- [ ] ZWJ/family emoji selection returns the correct Unicode string (grapheme unchanged)
- [ ] Cancel via every supported dismissal path (close button, backdrop tap, system back/swipe) returns
      `{ emoji: null }`
- [ ] `presentation: 'auto'` prefers native UI when available
- [ ] Native-to-web fallback triggers correctly when native presentation is unavailable/fails (e.g. simulate by
      forcing the native-unavailable path where feasible), and does not trigger on user cancellation
- [ ] `presentation: 'web'` always uses the web picker, never native
- [ ] Offline/first-run web fallback: web picker loads its emoji dataset correctly with no network connection
- [ ] Repeated open/close of the picker (5+ cycles) leaves no leaked/stale state and does not degrade performance
- [ ] Calling `present()` again while a picker is already active rejects with `ALREADY_PRESENTING` and does not
      present a second, overlapping picker

## Reporting

Record the app version, OS version, and device/emulator for each run. File a bug against the relevant checklist
item if any step fails.
