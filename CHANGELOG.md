# Changelog

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

- `launchApp` with `stopApp: false` and `isE2E: "true"` argument
- `waitForAnimationToEnd` before every screenshot
- Multi-platform `appId` support (`{ ios, android }`)
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
