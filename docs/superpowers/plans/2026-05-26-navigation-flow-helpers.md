# Navigation Flow Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `navigate(route)` and `openLink(url)` helpers so Preflight tests can drive navigation inside scenario tests and flow actions.

**Architecture:** The public React package owns helper types and runtime helper constructors. The CLI scanner extracts static helper calls from scenario source, and the YAML generator lowers both helpers to Maestro `openLink` commands. `navigate(route)` uses the configured `scheme`; `openLink(url)` emits the URL unchanged.

**Tech Stack:** TypeScript, React Native, Babel parser/traverse, Jest, Maestro YAML.

---

## File Structure

- Modify `src/types.ts`: extend public `TestStep`, `TestHelpers`, and `testHelpers`.
- Modify `src/__tests__/scenario.test.tsx`: add focused package-level helper tests.
- Modify `cli/commands/generate.ts`: extend CLI `TestStep`, scanner extraction, URL normalization, step YAML generation, and calls that pass `config.scheme`.
- Modify `cli/__tests__/generate.test.ts`: add scanner and YAML generation coverage for `navigate` and `openLink`.

The current worktree has pre-existing edits in `src/scenario.tsx` and `src/__tests__/scenario.test.tsx`. Review them before changing `src/__tests__/scenario.test.tsx`, keep unrelated user edits, and commit only the navigation-helper changes.

---

### Task 1: Public Helper Types

**Files:**
- Modify: `src/types.ts`
- Test: `src/__tests__/scenario.test.tsx`

- [ ] **Step 1: Write failing tests for helper constructors**

Add these imports and tests in `src/__tests__/scenario.test.tsx`:

```ts
import { testHelpers } from '../types';

test('testHelpers.navigate creates navigate step', () => {
  expect(testHelpers.navigate('/settings')).toEqual({ navigate: '/settings' });
});

test('testHelpers.openLink creates openLink step', () => {
  expect(testHelpers.openLink('myapp://settings')).toEqual({ openLink: 'myapp://settings' });
});
```

- [ ] **Step 2: Run package tests to verify failure**

Run:

```bash
yarn test src/__tests__/scenario.test.tsx
```

Expected: FAIL because `testHelpers.navigate` and `testHelpers.openLink` do not exist.

- [ ] **Step 3: Implement public helper types**

In `src/types.ts`, extend `TestStep`:

```ts
  | { navigate: string }
  | { openLink: string }
```

Extend `TestHelpers`:

```ts
  navigate: (route: string) => TestStep;
  openLink: (url: string) => TestStep;
```

Extend `testHelpers`:

```ts
  navigate: (route) => ({ navigate: route }),
  openLink: (url) => ({ openLink: url }),
```

- [ ] **Step 4: Run package tests to verify pass**

Run:

```bash
yarn test src/__tests__/scenario.test.tsx
```

Expected: PASS for existing scenario tests and the two new helper tests.

- [ ] **Step 5: Commit public helper changes**

Run:

```bash
git add src/types.ts src/__tests__/scenario.test.tsx
git commit -m "feat: add navigation test helpers"
```

---

### Task 2: CLI Scanner Extraction

**Files:**
- Modify: `cli/commands/generate.ts`
- Test: `cli/__tests__/generate.test.ts`

- [ ] **Step 1: Write failing scanner tests**

Add tests to `cli/__tests__/generate.test.ts`:

```ts
test('scanScenarios extracts navigate and openLink steps', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'settings-entry',
      route: '/home',
      test: ({ navigate, openLink }) => [
        navigate('/settings'),
        openLink('myapp://profile'),
      ],
    }, function Home() { return null; });
  `;
  const results = scanScenarios(source, 'app/home.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.steps).toEqual([
    { navigate: '/settings' },
    { openLink: 'myapp://profile' },
  ]);
});

test('scanScenarios extracts navigation helpers from flow actions', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'signup',
      route: '/signup',
      flow: [
        {
          screen: 'settings',
          actions: ({ navigate, openLink }) => [
            navigate('/settings'),
            openLink('myapp://help'),
          ],
        },
      ],
    }, function Signup() { return null; });
  `;
  const results = scanScenarios(source, 'app/signup.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.flow[0]!.steps).toEqual([
    { navigate: '/settings' },
    { openLink: 'myapp://help' },
  ]);
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
yarn test:cli --runTestsByPath cli/__tests__/generate.test.ts
```

Expected: FAIL because scanner output omits `navigate` and `openLink` steps.

- [ ] **Step 3: Extend CLI `TestStep`**

In `cli/commands/generate.ts`, extend the internal `TestStep` interface:

```ts
  navigate?: string;
  openLink?: string;
```

- [ ] **Step 4: Extract helper calls in `extractTestSteps`**

Add these cases to the `switch (name)` block in `extractTestSteps`:

```ts
        case 'navigate':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ navigate: args[0].value });
          }
          break;
        case 'openLink':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ openLink: args[0].value });
          }
          break;
```

- [ ] **Step 5: Run CLI tests to verify pass**

Run:

```bash
yarn test:cli --runTestsByPath cli/__tests__/generate.test.ts
```

Expected: PASS for the new scanner tests.

- [ ] **Step 6: Commit scanner changes**

Run:

```bash
git add cli/commands/generate.ts cli/__tests__/generate.test.ts
git commit -m "feat: scan navigation test helpers"
```

---

### Task 3: YAML Generation

**Files:**
- Modify: `cli/commands/generate.ts`
- Test: `cli/__tests__/generate.test.ts`

- [ ] **Step 1: Write failing YAML generation tests**

Add tests to `cli/__tests__/generate.test.ts`:

```ts
test('generateYaml converts navigate step to openLink with default scheme', () => {
  const yaml = generateYaml({
    id: 'home',
    filePath: 'app/home.tsx',
    steps: [{ navigate: '/settings' }],
  }, 'com.test.app');
  expect(yaml).toContain('openLink:\n    link: "preflight://settings"');
});

test('generateYaml converts navigate step without leading slash', () => {
  const yaml = generateYaml({
    id: 'home',
    filePath: 'app/home.tsx',
    steps: [{ navigate: 'settings' }],
  }, 'com.test.app');
  expect(yaml).toContain('openLink:\n    link: "preflight://settings"');
});

test('generateYaml converts empty navigate route to scheme root', () => {
  const yaml = generateYaml({
    id: 'home',
    filePath: 'app/home.tsx',
    steps: [{ navigate: '' }],
  }, 'com.test.app');
  expect(yaml).toContain('openLink:\n    link: "preflight://"');
});

test('generateYaml uses configured scheme for navigate step', () => {
  const yaml = generateYaml({
    id: 'home',
    filePath: 'app/home.tsx',
    steps: [{ navigate: '/settings' }],
  }, 'com.test.app', '.maestro/snapshots', undefined, 'myapp');
  expect(yaml).toContain('openLink:\n    link: "myapp://settings"');
});

test('generateYaml converts openLink step without changing URL', () => {
  const yaml = generateYaml({
    id: 'home',
    filePath: 'app/home.tsx',
    steps: [{ openLink: 'myapp://settings' }],
  }, 'com.test.app');
  expect(yaml).toContain('openLink:\n    link: "myapp://settings"');
});

test('generateFlowYaml converts navigate and openLink steps', () => {
  const { generateFlowYaml } = require('../commands/generate');
  const yaml = generateFlowYaml({
    id: 'signup',
    filePath: 'app/signup.tsx',
    steps: [{ tap: 'submit-btn' }],
    variants: [],
    flow: [
      {
        screen: 'settings',
        steps: [
          { navigate: '/settings' },
          { openLink: 'myapp://help' },
        ],
      },
    ],
    env: {},
  }, 'com.test.app');
  expect(yaml).toContain('openLink:\n    link: "preflight://settings"');
  expect(yaml).toContain('openLink:\n    link: "myapp://help"');
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
yarn test:cli --runTestsByPath cli/__tests__/generate.test.ts
```

Expected: FAIL because `stepToYaml` does not emit YAML for navigation helpers.

- [ ] **Step 3: Add route normalization helper**

In `cli/commands/generate.ts`, add this helper near `escapeYamlString`:

```ts
function routeToLink(route: string, scheme: string): string {
  const normalized = route.startsWith('/') ? route.slice(1) : route;
  return `${scheme}://${normalized}`;
}
```

- [ ] **Step 4: Thread scheme through step YAML generation**

Change `stepToYaml` signature:

```ts
function stepToYaml(step: TestStep, scheme: string = 'preflight'): string {
```

Add cases before `raw`:

```ts
  if (step.navigate !== undefined) {
    return `- openLink:\n    link: ${escapeYamlString(routeToLink(step.navigate, scheme))}`;
  }
  if (step.openLink !== undefined) {
    return `- openLink:\n    link: ${escapeYamlString(step.openLink)}`;
  }
```

Update calls inside `generateYaml` and `generateFlowYaml`:

```ts
const yaml = stepToYaml(step, scheme);
```

- [ ] **Step 5: Add scheme parameters to generators**

Change `generateYaml` signature:

```ts
export function generateYaml(
  scenario: ScannedScenario,
  appId: AppId,
  snapshotsDir: string = '.maestro/snapshots',
  env?: Record<string, string>,
  scheme: string = 'preflight',
): string {
```

Change `generateFlowYaml` signature:

```ts
export function generateFlowYaml(
  scenario: ScannedScenarioWithVariants,
  appId: AppId,
  snapshotsDir: string = '.maestro/snapshots',
  env?: Record<string, string>,
  scheme: string = 'preflight',
): string {
```

- [ ] **Step 6: Pass configured scheme from `runGenerate`**

In `runGenerate`, update generator calls:

```ts
const yaml = generateYaml(s, config.appId, config.snapshotsDir, s.env, config.scheme);
```

and:

```ts
const yaml = generateFlowYaml(s, config.appId, config.snapshotsDir, env, config.scheme);
```

- [ ] **Step 7: Run CLI tests to verify pass**

Run:

```bash
yarn test:cli --runTestsByPath cli/__tests__/generate.test.ts
```

Expected: PASS for scanner and YAML generation tests.

- [ ] **Step 8: Commit YAML generation changes**

Run:

```bash
git add cli/commands/generate.ts cli/__tests__/generate.test.ts
git commit -m "feat: generate navigation helper yaml"
```

---

### Task 4: Full Verification

**Files:**
- Verify: `src/types.ts`
- Verify: `cli/commands/generate.ts`
- Verify: `src/__tests__/scenario.test.tsx`
- Verify: `cli/__tests__/generate.test.ts`

- [ ] **Step 1: Run package tests**

Run:

```bash
yarn test
```

Expected: PASS.

- [ ] **Step 2: Run CLI tests**

Run:

```bash
yarn test:cli
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript lint**

Run:

```bash
yarn lint:ts
```

Expected: PASS.

- [ ] **Step 4: Review final diff**

Run:

```bash
git diff --stat HEAD
git diff HEAD -- src/types.ts src/__tests__/scenario.test.tsx cli/commands/generate.ts cli/__tests__/generate.test.ts
```

Expected: diff contains only navigation-helper changes and does not revert pre-existing user edits.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required code changes, run:

```bash
git add src/types.ts src/__tests__/scenario.test.tsx cli/commands/generate.ts cli/__tests__/generate.test.ts
git commit -m "fix: stabilize navigation helper tests"
```

If no changes were required, do not create an empty commit.
