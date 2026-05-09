# preflight-example

Demo app showing `react-native-preflight` with 5 scenarios: counter, counter/high-value, todos, todos/with-items, and profile.

## Setup

```sh
npm install
npx expo prebuild
npx expo run:ios
```

## Scenarios

| ID | Route | Description |
|----|-------|-------------|
| `counter` | `/counter` | Simple counter with increment/decrement |
| `counter/high-value` | `/counter` | Counter starting at 99 |
| `todos` | `/todos` | Empty todo list with add action |
| `todos/with-items` | `/todos` | Pre-populated todo list |
| `profile` | `/profile` | User profile with injected data |

## Run Maestro Tests

```sh
# Generate YAML from scenario() calls
npx preflight generate

# Run a single test
npx preflight test counter

# Run all tests
npx preflight test --all

# Run with screenshot capture
npx preflight test --all --snapshot

# Compare screenshots against baselines
npx preflight snapshot:compare
```

## Project Structure

```
app/
  _layout.tsx              # Root layout with StateInjector
  index.tsx                # Home screen with links
  counter.tsx              # Counter scenario
  todos.tsx                # Todo list scenario
  profile.tsx              # Profile scenario
  __dev/preflight.tsx      # Dev catalog screen
src/stores/
  counter-store.ts         # Zustand store for counter
  todo-store.ts            # Zustand store for todos
.maestro/
  screens/                 # Generated Maestro YAML
  snapshots/               # Screenshots (generated at runtime)
```
