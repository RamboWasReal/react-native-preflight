# Agent Instructions for react-native-preflight

## Overview

`react-native-preflight` simplifies Maestro E2E testing for React Native. It provides isolated screen testing via deep links, a dev-only catalog, and visual regression screenshots.

**TypeScript-only** — no native code. Three build targets: React components (bob), CLI (tsc), Babel plugin (tsc).

## Project Structure

```
src/                          # React library — built by bob -> lib/module/
  index.tsx                   # Public exports
  types.ts                    # ScenarioConfig, ScenarioEntry, PreflightProps, StateInjectorProps
  registry.ts                 # Global Map<string, ScenarioEntry>
  scenario.tsx                # scenario(config, Component) wrapper + testID View
  Preflight.tsx               # Dev catalog component
  StateInjector.tsx            # Deep link interceptor provider
  __tests__/                  # Jest tests (react-native preset)

cli/                          # Node.js CLI — built by tsc -> lib/cli/
  index.ts                    # commander entry point
  config.ts                   # Config reader (package.json or preflight.config.js)
  commands/
    init.ts                   # Scaffold preflight in a project
    test.ts                   # Run Maestro tests per scenario
    generate.ts               # AST scan for scenario() -> YAML skeletons
    snapshot-compare.ts       # pixelmatch comparison + HTML report
    snapshot-update.ts        # Promote current screenshots to baselines
  snapshot/
    compare.ts                # pixelmatch wrapper
    report.ts                 # HTML report generator
  __tests__/                  # Jest tests (node env, babel-jest)

babel/                        # Babel plugin — built by tsc -> lib/babel/
  strip-preflight.ts          # Strip scenario() and <Preflight /> in prod
  __tests__/                  # Jest tests (node env, babel-jest)

example/                      # Expo Router demo app (workspace)
```

## Architecture

### Core Flow
1. `scenario(config, Component)` registers the screen in a global registry at import time
2. `<StateInjector>` intercepts `preflight://scenario/<id>` deep links
3. On deep link: calls `await inject()` -> navigates via Expo Router -> screen mounts with injected state
4. `<Preflight />` reads the registry and displays a catalog with Preview buttons
5. Babel plugin strips everything in production (registry is empty -> StateInjector is a no-op)

### Key Design Decisions
- `inject()` is called BEFORE navigation (zero flash)
- `scenario()` wraps component with a `<View testID={id}>` for Maestro assertions
- expo-router is dynamically required in Preflight.tsx (graceful fallback)
- All error messages prefixed with `[preflight]`
- CLI is Node.js only (separate tsconfig targeting CommonJS)

## Commands

```bash
yarn test                     # React component tests (jest, react-native preset)
yarn test:cli                 # CLI tests (jest, node env)
yarn test:babel               # Babel plugin tests (jest, node env)
yarn test:all                 # All tests

yarn prepare                  # Full build (bob + tsc cli + tsc babel + shebang)
yarn clean                    # Remove lib/

yarn lint                     # ESLint
yarn lint:ts                  # TypeScript check
yarn format:write             # Prettier
```

## Build Pipeline

`yarn prepare` runs 3 builds sequentially:
1. `bob build` -> `lib/module/` (ESM) + `lib/typescript/` (.d.ts)
2. `tsc -p cli/tsconfig.json` -> `lib/cli/` (CommonJS)
3. `tsc -p babel/tsconfig.json` -> `lib/babel/` (CommonJS)
4. Prepends shebang to `lib/cli/index.js`

## Testing

- **React tests** (`src/__tests__/`): `@testing-library/react-native`, mocked `expo-router` and `expo-linking`
- **CLI tests** (`cli/__tests__/`): `babel-jest` transform, node environment, mocked `fs`
- **Babel tests** (`babel/__tests__/`): `@babel/core` transformSync, node environment
- Note: `cli/commands/test.ts` file name matches `*.test.ts` — `cli/jest.config.js` uses `testMatch: ['**/__tests__/**/*.test.ts']` to avoid false matches

## Yarn PnP Gotchas

- `expo-router` and `expo-linking` are peer deps but must be in devDependencies for Jest mocks to work with PnP
- `pixelmatch` v6 is ESM-only — `cli/jest.config.js` has `transformIgnorePatterns` to handle it
- `bob build` can't resolve `tsc` through PnP zips — typescript declarations built via direct `tsc` call instead

## Adding a New CLI Command

1. Create `cli/commands/<name>.ts` with an exported `run<Name>()` function
2. Register in `cli/index.ts` with commander
3. Add tests in `cli/__tests__/<name>.test.ts`
4. Run `yarn test:cli`

## Adding a New React Component

1. Create `src/<Name>.tsx`
2. Export from `src/index.tsx`
3. Export types if applicable
4. Add tests in `src/__tests__/<Name>.test.tsx`
5. Run `yarn test`
6. Run `yarn prepare` to regenerate type declarations

## Error Handling Convention

All warnings/errors use `console.warn`/`console.error` with `[preflight]` prefix. The library never crashes the host app — invalid states degrade gracefully (skip navigation, return component unwrapped, etc.).

## Roadmap

- **v1.1**: React Navigation support via adapter pattern on StateInjector
- **v2**: Run tests from within the app, Maestro Cloud integration, watch mode

## Spec & Plan

- Design spec: `docs/superpowers/specs/2026-03-20-react-native-preflight-design.md`
- Implementation plan: `docs/superpowers/plans/2026-03-20-react-native-preflight.md`
