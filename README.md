# react-native-preflight

Simplify Maestro E2E testing for React Native. Test screens in isolation, browse a dev catalog, and catch visual regressions — all with zero production overhead.

## Features

- **Isolated screen testing** — Deep link directly to any screen with pre-injected state
- **Dev catalog** — Browse and preview all testable screens in one place
- **Visual regression** — Screenshot comparison with HTML reports
- **Zero prod impact** — Babel plugin strips all preflight code from production builds
- **CLI tooling** — Generate test skeletons, run tests, compare snapshots
- **Router agnostic** — Works with Expo Router (auto-detected) or React Navigation via `onNavigate`

## Installation

```sh
npm install react-native-preflight
```

Peer dependencies: `expo-linking`, `react`, `react-native`. `expo-router` is optional — if installed, navigation works automatically. Without it, provide an `onNavigate` prop.

## Claude Code Plugin

Skip the manual setup — this package ships a [Claude Code plugin](https://code.claude.com/docs/en/plugins) that handles everything: Babel config, StateInjector, screen wrapping, and Maestro YAML generation.

```sh
# Add the marketplace and install the plugin
/plugin marketplace add RamboWasReal/react-native-preflight
/plugin install react-native-preflight@react-native-preflight-plugins
```

Then run:

```
/react-native-preflight:preflight-setup
```

> Already using Claude Code? This is the fastest way to get started. The plugin auto-detects your project structure (Expo Router or React Navigation) and configures everything.

## Quick Start (manual)

### 1. Initialize

```sh
npx preflight init
```

Creates `.maestro/` directories, adds the `preflight` deep link scheme to `app.json`, scaffolds a catalog screen, and configures the Babel plugin.

### 2. Wrap your screens

Use `scenario()` to register a screen for testing. It wraps the component and makes it discoverable by the catalog and CLI.

```tsx
import { scenario } from 'react-native-preflight';

export default scenario(
  {
    id: 'settings',
    route: '/settings',
    description: 'Settings screen',
    inject: async () => {
      // Pre-populate stores, query cache, etc.
    },
    test: ({ see, tap }) => [
      see('Settings'),
      tap('dark-mode-toggle'),
    ],
  },
  function SettingsScreen() {
    // your component...
  },
);
```

- `id` — Unique identifier, used as Maestro `testID` and YAML filename
- `route` — Must match the file-based route (Expo Router) or screen name (React Navigation)
- `inject()` — Called BEFORE navigation to set up deterministic state (zero flash)
- `test()` — Optional. Generates Maestro test steps via `npx preflight generate`:
  - `see('text')` — assert visible text
  - `see({ id: 'testID' })` — assert testID visible
  - `tap('buttonId')` — tap element by testID
  - `type('inputId', 'value')` — type text into input
  - `notSee('text')` — assert text not visible
  - `wait(2000)` — wait N milliseconds
  - `scroll('listId', 'down')` — scroll the screen
- `variants` — Optional. Test multiple states of the same screen. Each variant inherits `route`, `inject`, and `test` from the base config unless overridden:

```tsx
export default scenario({
  id: 'dashboard',
  route: '/dashboard',
  variants: {
    'with-data': {
      inject: () => { /* populate stores with mock data */ },
      test: ({ see }) => [see('Welcome back')],
    },
    'empty-state': {
      inject: () => { /* clear all stores */ },
      test: ({ see }) => [see('Get started')],
    },
  },
}, DashboardScreen);
```

Generates `screens/dashboard/with-data.yaml` and `screens/dashboard/empty-state.yaml`.

### 3. Add StateInjector

Wrap your root layout with `StateInjector`. It listens for `preflight://` deep links, calls `inject`, then navigates.

**Expo Router** (auto-detected):
```tsx
// app/_layout.tsx
import { StateInjector } from 'react-native-preflight';

export default function RootLayout() {
  return (
    <StateInjector>
      <Stack />
    </StateInjector>
  );
}
```

**React Navigation**:
```tsx
import { StateInjector } from 'react-native-preflight';

export default function App() {
  const navigation = useNavigation();
  return (
    <StateInjector onNavigate={(route) => navigation.navigate(route)}>
      <Stack.Navigator>{/* ... */}</Stack.Navigator>
    </StateInjector>
  );
}
```

### 4. Add the catalog (optional)

Browse and preview all registered scenarios from a dev-only screen.

```tsx
import { Preflight } from 'react-native-preflight';

export default function PreflightScreen() {
  return <Preflight />;
}
```

For React Navigation: `<Preflight onNavigate={(id) => navigation.navigate(id)} />`

### 5. Configure Babel

Strip all preflight code from production builds.

```js
// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['react-native-preflight/babel', { strip: process.env.NODE_ENV === 'production' }],
  ],
};
```

> If you ran `npx preflight init`, this is already configured.

## CLI

| Command | Description |
|---------|-------------|
| `npx preflight init` | Scaffold directories, scheme, catalog, Babel plugin |
| `npx preflight generate` | Scan `scenario()` calls and generate Maestro YAML |
| `npx preflight test` | Interactive scenario picker |
| `npx preflight test <id>` | Run Maestro test for one scenario |
| `npx preflight test --all` | Run all scenarios (screens + flows) |
| `npx preflight test --retry 2` | Retry all tests up to N times on failure |
| `npx preflight test <id> --snapshot` | Run and capture screenshot |
| `npx preflight snapshot:compare` | Compare current vs baseline screenshots |
| `npx preflight snapshot:compare --ci` | Same, but exit 1 on regression |
| `npx preflight snapshot:update [id]` | Promote current screenshots to baselines |
| `npx preflight snapshot:reset [id]` | Delete all snapshots (or one scenario's) |

## Configuration

In `preflight.config.js` or under a `preflight` key in `package.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `appId` | `""` (auto-detected from `app.json`) | Bundle ID — string or `{ ios, android }` object |
| `scheme` | `"preflight"` | Deep link scheme |
| `screensDir` | `".maestro/screens"` | Generated Maestro YAML location |
| `snapshotsDir` | `".maestro/snapshots"` | Screenshot baselines and diffs |
| `threshold` | `0.1` | Allowed pixel diff % before comparison fails |
| `srcDir` | `""` (auto-detected) | Source directory for screen files |

Generated YAML uses Maestro's `waitForAnimationToEnd` before each screenshot — no manual delay needed.

### Multi-Platform appId

iOS and Android often have different bundle identifiers. Use an object instead of a string:

```json
{
  "preflight": {
    "appId": {
      "ios": "com.example.app.dev",
      "android": "com.example.app.staging"
    }
  }
}
```

Generates Maestro's native multi-platform `appId` format. A plain string still works for single-platform testing.

### Bypassing Guards

`isPreflightActive()` returns `true` after a preflight deep link has been handled. Use it to skip security gates, onboarding, and permission modals during E2E tests:

```ts
import { isPreflightActive } from 'react-native-preflight';

if (isPreflightActive()) {
  // Skip guards that would block E2E navigation
}
```

Stripped in production by the Babel plugin — zero runtime cost.

### Environment Variables

Pass variables to Maestro YAML via `env` in your scenario:

```tsx
scenario({
  id: 'login',
  route: '/login',
  env: { TEST_EMAIL: 'test@example.com', TEST_PASSWORD: 'password123' },
  // ...
}, LoginScreen);
```

These become Maestro `env:` variables, accessible in YAML via `${TEST_EMAIL}`.

## Multi-Screen Flows

Test complete user journeys by adding `flow` to a scenario:

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
    { screen: 'setup', actions: ({ tap }) => [tap('skip-btn')], skipIf: 'home' },
    { screen: 'home' },
  ],
}, OnboardingScreen);
```

`npx preflight generate` produces both `screens/onboarding.yaml` (isolated test) and `flows/onboarding.yaml` (full journey). Both appear in the interactive test picker.

`skipIf` makes a flow step conditional — if the given testID is already visible, the step is skipped.

## Visual Regression (Snapshots)

Catch unintended UI changes by comparing screenshots between test runs.

### 1. Capture baselines

```sh
npx preflight test --all --snapshot
```

First run creates `baseline.png` for each scenario. Subsequent runs update `current.png`. Passed tests get their screenshots saved; failed tests are skipped.

### 2. Compare

```sh
npx preflight snapshot:compare
```

Compares `current.png` vs `baseline.png` for every scenario. Generates an HTML report and opens it in your browser. Use `--ci` to exit with code 1 on regression (no auto-open).

### 3. Accept changes

```sh
npx preflight snapshot:update           # Update all baselines
npx preflight snapshot:update settings  # Update one baseline
```

Promotes `current.png` to `baseline.png` when UI changes are intentional.

### Structure

```
.maestro/snapshots/
  home/
    baseline.png    ← stable reference
    current.png     ← latest test run
    diff.png        ← generated by compare (if different)
  dashboard/
    with-data/      ← variant subdirectory
      baseline.png
      current.png
  report.html       ← visual comparison report
```

## How It Works

1. `scenario(config, Component)` registers the screen in an in-memory registry at import time and wraps it with `<View testID={id}>` for Maestro assertions.
2. `StateInjector` intercepts `preflight://scenario/<id>` deep links, calls `inject()`, then navigates via `expo-router` or your `onNavigate` callback.
3. The Babel plugin replaces `scenario(config, Component)` with just `Component` and removes `<Preflight />` elements — zero preflight code in production.

## License

MIT
