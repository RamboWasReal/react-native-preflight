# Changelog

## Unreleased

### Added

- Added `launchApp` config for generated Maestro flows, including `stopApp`, `clearState`, `clearKeychain`, and `permissions`.
- Added `scheme` prop to `<StateInjector>` for apps using a custom preflight deep link scheme.
- Added support for aliased and namespace `scenario` imports in `preflight generate`.
- Added support for `helpers.tap()`-style test helper calls in generated Maestro steps.

### Changed

- `<Preflight onNavigate>` now receives the scenario route instead of the scenario id, matching `<StateInjector onNavigate>`.
- `scenario()` now registers the base scenario even when variants are configured, so both the base state and variants can be tested.
- Generated `wait()` steps now use Maestro `evalScript` instead of `runScript`.
- `isPreflightActive()` is set only after a valid scenario has been found and `inject()` has completed.

### Fixed

- `StateInjector` now matches only direct preflight URLs instead of embedded URL substrings.
- `preflight init` avoids rewriting `app.json` when the configured scheme is already present.
- `preflight init` can add the Babel plugin when `babel.config.js` has no existing `plugins` array.
- `preflight test --snapshot` stores flow snapshots under stable flow-specific names.
- `preflight test` reports a clear error when the `maestro` binary cannot be started.

## 0.1.5 (2026-03-24)

### New Test Helpers

- `swipe(direction, duration?)` — swipe in a direction (default 400ms)
- `back()` — press back button
- `hideKeyboard()` — dismiss the keyboard
- `longPress(id)` — long press element by testID
- `raw(yaml)` — escape hatch for injecting any raw Maestro YAML

### Improvements

- `scroll(id, direction)` now generates `scrollUntilVisible` (was generating invalid `scroll` with `direction`)
- Multi-platform `appId` uses `${APP_ID}` env var — Maestro does not support nested format
- `--platform ios|android` flag on `preflight test` to resolve multi-platform appId
- `preflight generate` deletes orphaned YAML files with no matching `scenario()` in codebase
- `preflight generate` follows single-level imports to resolve external test functions
- Show raw Maestro stderr when tests fail without parsed results (YAML parse errors, etc.)
- Always display output directory path on test failure
- Validate generated YAML commands against known Maestro commands at generate time

### Bug Fixes

- Fixed `scroll` step generating invalid Maestro YAML (`scroll` with `direction` property)
- Fixed multi-platform `appId` generating unsupported nested YAML format
- Fixed pre-existing lint errors (`no-useless-escape`, `no-redeclare`)

## 0.1.0 (2026-03-23)

First stable release. Validated with 22/22 scenarios passing on a production React Native app.

### Core

- `scenario(config, Component)` — wrap screens for isolated E2E testing
- `<StateInjector>` — intercept `preflight://` deep links, inject state, navigate
- `<Preflight />` — dev catalog to browse and preview all scenarios
- Babel plugin strips all preflight code in production (`strip: true` opt-in)
- `isPreflightActive()` — exported flag to bypass auth gates, onboarding, modals during E2E

### scenario() Config

- `id`, `route`, `description` — screen identification
- `inject()` — pre-populate stores and query cache before navigation (zero loading states)
- `test()` — declarative test steps: `see()`, `tap()`, `type()`, `notSee()`, `wait()`, `scroll()`
- `variants` — test multiple states of the same screen (generates subdirectory YAMLs)
- `flow` — multi-screen journeys with `actions()` and `skipIf` conditional steps
- `env` — Maestro environment variables for parameterized tests
- HOC compatible — `React.ComponentType<any>` overload for wrapped components

### CLI

- `npx preflight init` — scaffold directories, deep link scheme, catalog, Babel plugin
- `npx preflight generate` — AST scan for `scenario()` calls, generate Maestro YAML
- `npx preflight test` — interactive multi-select picker with live progress
- `npx preflight test <id>` — run a single scenario (auto-regenerates YAML)
- `npx preflight test --all` — run all scenarios + flows in a single Maestro session
- `npx preflight test --retry N` — retry failed tests
- `npx preflight test --snapshot` — capture screenshots per passed test
- `npx preflight snapshot:compare` — pixelmatch comparison + HTML report (auto-opens)
- `npx preflight snapshot:update` — promote current screenshots to baselines
- `npx preflight snapshot:reset` — delete all or single scenario snapshots

### Generated YAML

- `launchApp` with `stopApp: false`
- `waitForAnimationToEnd` before every screenshot
- Multi-platform `appId` support (`{ ios, android }`) via `${APP_ID}` env var and `--platform` flag
- Flows generated in `.maestro/flows/` with conditional `skipIf` via `runFlow: when: notVisible`

### Framework Detection

- Auto-detects Expo Router (`app/_layout.tsx`) or React Navigation (`src/screens/`)
- Supports `app/`, `src/app/`, `src/screens/`, `src/` with configurable `srcDir`
- Conditional scaffolding: `__dev/preflight.tsx` (Expo Router) or `PreflightScreen.tsx` + navigator instructions (React Navigation)

### Security

- Path traversal protection on all config paths (`screensDir`, `snapshotsDir`, `srcDir`)
- Deep recursive prototype pollution sanitization on deep link state params
- Deep link ID validation against `^[a-zA-Z0-9_\-/]+$` pattern
- YAML string escaping on all user-provided values
- HTML escaping in snapshot reports
- `wait()` step clamped to 0-60000ms
- Config type validation with warnings on mismatch

### DX

- Colored terminal output (green PASS, red FAIL, dim hints)
- Parsed Maestro errors with contextual failure messages
- Debug log path shown inline with each failure
- Quiet mode for generate when called from test
- Single Maestro session for multiple tests (temp dir approach)
- Orphan YAML detection (recursive, including variant subdirectories)
