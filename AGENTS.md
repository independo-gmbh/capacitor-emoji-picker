# Repository Guidelines

## Project Structure & Module Organization
- Source plugin code lives in `src/` (TypeScript bridge plus web implementation); shared orchestration lives in
  `src/service/`, platform adapters in `src/platform/`, shared helpers in `src/core/`.
- Native implementations reside in `android/` (Gradle module) and `ios/Sources/EmojiPicker/` (Swift). Each native
  platform mirrors the same layering: a thin `Bridge`/plugin class, a `Service` that owns concurrency guarding, and
  a `Presenter` that will hold the platform-specific picker UI. The CocoaPods spec is
  `IndependoCapacitorEmojiPicker.podspec`.
- Tests sit in `test/` (Jest + ts-jest), `android/src/test/`, and `ios/Tests/`. Build output is generated into `dist/`
  and should not be committed manually.
- The example app for manual validation is in `example/`.

## Build, Test, and Development Commands
- `pnpm build` — cleans, regenerates docs (`docgen`), runs `tsc`, then bundles via Rollup.
- `pnpm test` — runs Jest tests in `test/`.
- `pnpm lint` / `pnpm fmt` — check or auto-fix TypeScript lint issues using the Ionic ESLint preset.
- `pnpm swiftlint` — lint Swift sources (requires SwiftLint installed).
- `pnpm verify` — end-to-end check: iOS build (`xcodebuild`), Android Gradle build/tests, then web build. Requires
  Xcode + Android SDK/NDK installed.
- `pnpm watch` — incremental TypeScript compilation during development.

## Coding Style & Naming Conventions
- Follow the Ionic ESLint + Prettier configs; default spacing is 4 spaces, single quotes preferred.
- TypeScript: classes/interfaces in `PascalCase`, functions/variables in `camelCase`.
- File naming follows existing patterns (`EmojiPickerService.ts`, platform adapters under `src/platform/<platform>/`).
- Avoid editing `dist/` directly; rely on `pnpm build`.

## Testing Guidelines
- Place specs under `test/` with the `.test.ts` suffix (e.g., `EmojiPickerService.test.ts`).
- Use Jest with ts-jest; prefer asserting high-level behavior (concurrency guarding, error propagation) rather than
  implementation details.
- Run `pnpm test` before submitting; for native changes, also execute platform builds via `pnpm verify:ios` /
  `pnpm verify:android` when available.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`); this repo relies on
  semantic-release tooling.
- Keep commits scoped and descriptive (e.g., `fix: guard against overlapping picker presentations`).
- PRs should include: summary of changes, affected platforms (web/android/ios), test evidence (`pnpm test`,
  `pnpm verify` excerpts if run), and notes on doc updates (`pnpm docgen` when API comments change).
- Do not commit generated artifacts (`dist/`, build outputs); ensure lockfile changes are intentional.
- Target pull requests at `dev`, not `main` — `main` only receives stable releases via the `dev` → `main` promotion
  flow.

## Platform Notes & Safety
- iOS builds require CocoaPods (`pod install`) and a recent Xcode; Android builds require a configured JDK/SDK and
  Gradle wrapper.
- Platform presentation (web, Android, iOS) is implemented in follow-up issues. The web picker and the Android
  native picker are implemented; `present()` still rejects with `NOT_IMPLEMENTED` on iOS until its follow-up issue
  lands. On Android, `presentation: 'web'` also currently rejects with `NOT_IMPLEMENTED` (native-to-web fallback is
  a separate follow-up issue, not yet wired up).
