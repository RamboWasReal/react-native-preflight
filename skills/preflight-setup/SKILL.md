---
name: preflight-setup
description: |
  Use when integrating react-native-preflight into a React Native project.
  Covers scenario wrapping, StateInjector setup, Babel config, and
  Maestro YAML generation. Works with Expo Router or React Navigation.
disable-model-invocation: true
---

# Setting Up react-native-preflight

Your job is to configure the project and create working scenario wrappers.

**DO NOT just show templates or explain concepts. Actually read the project files, make changes, and produce a working integration.**

## Phase 0: Detect existing setup

Before making any changes, check what's already in place:

**Check if the package is installed and up to date:**
1. Read `package.json` for `react-native-preflight` in dependencies. If not installed, run `npm install react-native-preflight` (or yarn/pnpm equivalent).
2. Check the installed version against the latest on npm. If outdated, suggest upgrading: `npm install react-native-preflight@latest`.
3. After an upgrade, run `npx preflight generate` to regenerate all YAML files with the latest format.


1. **Check for existing Maestro setup** — Look for `.maestro/` directory, any `.yaml` test files, `maestro` in package.json scripts, or a `.maestro.yaml` config file.
2. **Check for existing preflight setup** — Look for `react-native-preflight` in imports, `scenario()` calls, `StateInjector` usage, or the babel plugin in `babel.config.js`.
3. **Check for existing deep link scheme** — Read `app.json` for existing scheme config.

**If Maestro tests already exist:**
- Read the existing YAML files to understand what's already tested
- When wrapping screens with `scenario()`, match existing test IDs and flows
- Note: `npx preflight generate` regenerates all YAML files from scenario() definitions on every run
- Tell the user what was detected: "Found N existing Maestro tests in .maestro/. I'll integrate preflight alongside them."

**If preflight is partially configured:**
- Skip steps that are already done (e.g., don't add the babel plugin twice, don't re-wrap StateInjector)
- Tell the user what was already configured and what's left

**If nothing exists, proceed normally.**

## Phase 0.5: Detect project structure

Detect the framework and source directory **before** making any changes. This determines how screens are scaffolded and where to scan.

### Detection logic (in order):

1. **Check preflight config** — Read `package.json` `"preflight"` key or `preflight.config.js` for explicit `srcDir`. If set, use it.
2. **Expo Router: `app/_layout.tsx`** — If `app/_layout.tsx` (or `.ts`, `.jsx`, `.js`) exists at project root → framework is **Expo Router**, srcDir is `app/`.
3. **Expo Router: `src/app/_layout.tsx`** — Same check in `src/app/` → framework is **Expo Router**, srcDir is `src/app/`.
4. **React Navigation: `src/screens/`** — If `src/screens/` directory exists → framework is **React Navigation**, srcDir is `src/screens/`.
5. **Fallback: `src/`** — If `src/` exists → framework is **unknown**, srcDir is `src/`.
6. **Nothing found** — Error. Ask the user where their screens live.

### Confirm with the user:
```
Detected: Expo Router (app/)
— or —
Detected: React Navigation (src/screens/)
```

If the detection seems wrong (e.g., `src/` fallback), ask the user to confirm or provide the correct path.

## Phase 1: Configure the project (do all of these silently, skip what's already done)

### 1. Babel Plugin
Read `babel.config.js`. If `react-native-preflight/babel` is NOT already present, add `['react-native-preflight/babel', { strip: process.env.NODE_ENV === 'production' }]` to the plugins array. Do not replace existing plugins.

### 2. Deep Link Scheme
Read `app.json`. Add `"preflight"` to `expo.scheme` only if not already present. Handle string (convert to array), array (push if missing), or absent (set it).

### 3. StateInjector
Find the root layout based on the detected framework:
- **Expo Router**: `{srcDir}/_layout.tsx`
- **React Navigation**: The root navigator file (often `App.tsx`, `src/navigation/index.tsx`, or similar)

If `StateInjector` is NOT already imported, wrap the outermost navigator:
- **Expo Router**: `<StateInjector><Stack /></StateInjector>`
- **React Navigation**: `<StateInjector onNavigate={(route) => navigation.navigate(route)}>{children}</StateInjector>`

### 4. .gitignore
Add `.maestro-output/` if not already present.

### 5. Configuration — appId detection
The appId must match the **development build** bundle identifier (the one running on the simulator/device). Maestro uses this to target the app.

**Detection order:**
1. Check `app.config.js` or `app.config.ts` first — it may use environment variables or EAS profiles. Look for `ios.bundleIdentifier` and `android.package`. If values differ per environment, use the **development** variant (e.g., `com.company.app.dev`, not `com.company.app`).
2. If no `app.config.js`, check `app.json` — look at `expo.ios.bundleIdentifier` and `expo.android.package`.
3. Check `eas.json` for build profiles — the `development` profile may override the bundle identifier with a `.dev` suffix.

**Ask the user to confirm:** "I detected appId `com.company.app.dev` from your development config. Is this the bundle ID of the build you test on locally?" If they say no, ask them for the correct one.

Add the confirmed appId to `package.json` under `"preflight": { "appId": "..." }` (only if not already set).

**Multi-platform:** If iOS and Android have different bundle identifiers (common with EAS build profiles), use an object:
```json
{
  "preflight": {
    "appId": {
      "ios": "com.company.app.dev",
      "android": "com.company.app.staging"
    }
  }
}
```
This generates Maestro's native multi-platform appId format. Ask the user if their iOS and Android IDs differ.

### 6. Persist srcDir in config
If the detected srcDir is not the default `app/`, persist it in `package.json` under `"preflight": { "srcDir": "..." }` so that `generate` and `test` commands pick it up automatically.

**After completing Phase 1, tell the user what was configured (and what was skipped because it was already done) and move to Phase 2.**

## Phase 2: Scan screens and ask the user

### 1. Scan all screen files
- **Expo Router**: Read every `.tsx`/`.ts` file in `{srcDir}/` recursively. Skip `_layout.tsx`, files starting with `_`, and anything in `__dev/` or `(group)/` layout files.
- **React Navigation**: Find screen components registered in navigators. Look for `<Stack.Screen component={...} />` or `<Tab.Screen component={...} />` patterns, then follow the imports to find the actual screen files.

### 2. For each screen, analyze:
- The component's default export function name
- What stores/hooks it uses (look for `useXxxStore`, `useContext`, custom hooks that fetch data)
- **What data-fetching hooks it uses** (look for `useQuery`, `useSWR`, `useFetch`, or custom hooks that wrap them like `useGetXxx`, etc.)
- What the main UI elements are (Text content, Buttons, TextInputs, FlatLists)
- What `testID` props already exist

### 3. Present the findings:
```
Found 4 screens:

  1. /home (app/index.tsx)
     State: useAppStore
     Data: useGetDashboard → ['dashboard']
     UI: header, main content, action buttons

  2. /settings (app/settings.tsx)
     State: useSettingsStore
     UI: toggle switches, save button

  3. /notifications (app/notifications.tsx)
     Data: useGetNotifications → ['notifications']
     UI: notification list, empty state

  4. /details (app/details.tsx)
     Data: useGetItem → ['item', itemId]
     UI: item details, action buttons

  ...

Which screens should I wrap with scenario()? (all / numbers / none)
```

Wait for the user's response before continuing.

### 4. Wrap selected screens

For each selected screen, **read the full file** and modify it:

1. Add `import { scenario } from 'react-native-preflight';` at the top
2. Wrap the default export with `scenario(config, Component)`:
   - `id`: kebab-case from the route (e.g., `/settings` → `settings`)
   - `route`: the actual route path
   - `description`: one line describing what the screen shows
   - `inject()`: pre-populate ALL data the screen needs before it mounts. This includes:
     - **Zustand/Jotai stores**: call `.setState()` with realistic values based on the store's type definition
     - **React Query / TanStack Query**: call `queryClient.setQueryData(queryKey, data)` to pre-fill the cache. Follow the custom hook to find the query key and return type. The queryClient must be imported from the app's query setup (e.g., `import { queryClient } from '@/lib/queryClient'`).
     - **SWR**: call `mutate(key, data, false)` to pre-fill the cache
     - **Apollo**: call `client.writeQuery({ query, data })` to pre-fill the cache
     - If the screen has no external state or data fetching, omit inject.
     - **The goal is zero loading states in screenshots.** Every screen should render with data immediately.
   - `test()`: write 2-5 basic assertions based on the UI elements visible in the component. Available helpers:
     - `see('text')` — assert visible text
     - `see({ id: 'testID' })` — assert testID visible (use this for testID-based assertions)
     - `tap('buttonId')` — tap element by testID
     - `type('inputId', 'value')` — type text into input
     - `notSee('text')` — assert text not visible
     - `wait(2000)` — wait N milliseconds
     - `scroll('listId', 'down')` — scroll the screen (direction: up/down)
   - `variants`: optional. Use when a screen needs to be tested in multiple states (e.g., logged in vs logged out). Each variant gets its own YAML in a subdirectory.
3. Add `testID` props to interactive elements (buttons, inputs) and key display elements (titles, counts) if they don't already have them
4. Convert the default export function to a named function inside `scenario()`

**Variants example** — when a screen has distinct states to test:
```tsx
export default scenario({
  id: 'profile',
  route: '/profile',
  variants: {
    'logged-in': {
      inject: () => { /* populate stores with mock data */ },
      test: ({ see }) => [see('Welcome back')],
    },
    'empty-state': {
      inject: () => { /* clear all stores */ },
      test: ({ see }) => [see('Get started')],
    },
  },
}, ProfileScreen);
```
This generates `screens/profile/logged-in.yaml` and `screens/profile/logged-out.yaml`. Each variant inherits the base `route`, `description`, and `inject` unless overridden.

**Note on HOC compatibility:** `scenario()` accepts `React.ComponentType<any>`, so it works with HOC-wrapped components (e.g., `withSecurityGate(MyScreen)`, `withSuspenseBoundary(MyScreen)`). You can safely pass the HOC result directly.

**The result must compile and run.** Do not leave placeholder comments like `// add your state here`. Use real store methods and real values.

### 5. Dev Catalog

Scaffold depends on the detected framework:

**Expo Router:** Create `{srcDir}/__dev/preflight.tsx`:
```tsx
import { Preflight } from 'react-native-preflight';

export default function PreflightScreen() {
  return <Preflight />;
}
```

**React Navigation:** Create `{srcDir}/PreflightScreen.tsx`:
```tsx
import { Preflight } from 'react-native-preflight';

export default function PreflightScreen() {
  return <Preflight />;
}
```
Then tell the user to register it in their navigator:
```
Add to your navigator:
  <Stack.Screen name="Preflight" component={PreflightScreen} />
```

### 6. Generate Maestro YAML
Run `npx preflight generate` to create `.maestro/screens/*.yaml` from the scenario() calls. Note: `npx preflight test` auto-regenerates YAML before running, so manual generation is only needed if you want to inspect the YAML files.

### 7. Run tests
- `npx preflight test` — interactive multi-select picker
- `npx preflight test <id>` — run a specific scenario (regenerates only that YAML)
- `npx preflight test --all` — run all scenarios

## Phase 3: Multi-screen flows (optional)

If the user wants to test complete user journeys (onboarding, checkout, multi-step forms), add a `flow` property to the starting scenario. The flow YAML is auto-generated by `npx preflight generate`.

### When to add a flow
- The user asks to test a multi-step journey
- A feature involves navigating through 2+ screens in sequence
- Testing requires real user interaction (typing, tapping through forms)

### How to add a flow

Add `flow: [...]` to the starting scenario's config:

```tsx
export default scenario({
  id: 'onboarding',
  route: '/onboarding',
  inject: () => { /* set up initial state */ },
  test: ({ type, tap }) => [
    type('name-input', 'Jane'),
    tap('next-btn'),
  ],
  flow: [
    { screen: 'setup', actions: ({ tap }) => [tap('skip-btn')] },
    { screen: 'home' },
  ],
}, SignupScreen);
```

This generates two files:
- `screens/onboarding.yaml` — isolated screen test (deep link + test steps + screenshot)
- `flows/onboarding.yaml` — full flow (deep link + test steps + navigate through subsequent screens + screenshot)

Both appear in the interactive picker (`npx preflight test`). Flows are tagged with `[flow]`.

### Flow rules
- **Read the screens first.** Follow the actual navigation logic — don't guess which screen comes after which.
- **`test()` runs first**, then `flow` continues to subsequent screens via real navigation (tapping buttons).
- **`screen` must match the `id` of another scenario.** The `assertVisible` uses that ID as the testID.
- **`actions` uses the same helpers** as `test()`: `tap()`, `type()`, `see()`, etc.
- **`skipIf`** makes a step conditional: `{ screen: 'onboarding', skipIf: 'home', actions: ... }` — skip this step if `home` testID is already visible (user already past this screen).
- **Keep flows short** — 2-5 screens max. If it's longer, break it into sub-flows.

## Rules

- **Read before writing.** Always read the full screen file before modifying it.
- **Working code only.** Every wrapped screen must compile. Use real store methods, real values, real types.
- **Don't wrap layouts, error boundaries, auth gates, or modals.** Only feature screens.
- **inject() pre-populates ALL data.** Use store `.setState()` for state management, `queryClient.setQueryData()` for React Query, `mutate()` for SWR. inject runs before the component mounts — the screen should never show a loading state in preflight.
- **Follow data-fetching hooks to their source.** When a screen uses `useGetBadges()`, read the hook implementation to find the query key (e.g., `['user-badges']`) and return type, then generate `queryClient.setQueryData(['user-badges'], mockData)` in inject().
- **test() references testID props.** If a testID doesn't exist on the element, add it. Use `see({ id: 'testID' })` for testID assertions, `see('text')` for visible text.
- **IDs must be unique** and match `/^[a-zA-Z0-9_-]+$/`.
- **Detect framework first.** Never assume Expo Router — always run the detection logic.
- **Persist non-default srcDir.** If srcDir is not `app/`, save it to the preflight config so CLI commands work without re-detection.
- **generate regenerates all YAML.** `npx preflight generate` always overwrites existing YAML files from scenario() definitions. The scenario() is the source of truth.
- **Screenshots wait for stability.** Generated YAML uses `waitForAnimationToEnd` before `takeScreenshot` — Maestro waits for the screen to settle, no manual delay needed.
- **Variants go in subdirectories.** `screens/{baseId}/{variantKey}.yaml` and `snapshots/{baseId}/{variantKey}/current.png`. Screens without variants stay flat.
- **Babel plugin is opt-in.** `strip` must be explicitly set to `true` — without it, the plugin does nothing. Always use `{ strip: process.env.NODE_ENV === 'production' }`.
- **isPreflightActive().** Exported function that returns `true` after a preflight deep link is handled. Use it to bypass security gates, onboarding flows, and permission modals during E2E tests. When the app has HOCs or guards that block navigation (PIN, biometry, consent), check `isPreflightActive()` to skip them instead of hacking the inject().
- **env variables.** Use `env: { KEY: 'value' }` in scenario config for parameterized tests (test emails, passwords). Generates a Maestro `env:` block in the YAML.
- **--retry for flaky tests.** `npx preflight test --retry 2` re-runs all tests up to 2 times on failure.
