import { scanScenarios, generateYaml } from '../commands/generate';

test('scanScenarios finds scenario() calls in source code', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'my-screen',
      route: '/my-screen',
      description: 'My screen',
    }, function MyScreen() { return null; });
  `;
  const results = scanScenarios(source, 'app/my-screen.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe('my-screen');
  expect(results[0]!.steps).toEqual([]);
});

test('generateYaml creates valid Maestro YAML without steps', () => {
  const yaml = generateYaml({ id: 'my-screen', filePath: 'app/my-screen.tsx', steps: [] }, 'com.test.app');
  expect(yaml).toContain('appId: "com.test.app"');
  expect(yaml).toContain('launchApp:\n    stopApp: false');
  expect(yaml).toContain('preflight://scenario/my-screen');
  expect(yaml).toContain('takeScreenshot: ".maestro/snapshots/my-screen/current"');
  expect(yaml).toContain('# Add your test steps below');
  expect(yaml).toContain('waitForAnimationToEnd');
});

test('generateYaml includes waitForAnimationToEnd before screenshot', () => {
  const yaml = generateYaml({ id: 'test', filePath: 'app/test.tsx', steps: [] }, 'com.test.app');
  const lines = yaml.split('\n');
  const waitIdx = lines.findIndex(l => l.includes('waitForAnimationToEnd'));
  const screenshotIdx = lines.findIndex(l => l.includes('takeScreenshot'));
  expect(waitIdx).toBeGreaterThan(-1);
  expect(screenshotIdx).toBeGreaterThan(waitIdx);
});

test('generateYaml includes test steps in YAML', () => {
  const yaml = generateYaml({
    id: 'counter',
    filePath: 'app/counter.tsx',
    steps: [
      { see: '42' },
      { tap: 'increment' },
      { see: '43' },
    ],
  }, 'com.test.app');
  expect(yaml).toContain('assertVisible:\n    text: "42"');
  expect(yaml).toContain('tapOn:\n    id: "increment"');
  expect(yaml).toContain('assertVisible:\n    text: "43"');
  expect(yaml).not.toContain('# Add your test steps below');
});

test('scanScenarios extracts test steps from source', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'demo',
      route: '/demo',
      test: ({ tap, see }) => [
        see('hello'),
        tap('btn'),
        see('world'),
      ],
    }, function Demo() { return null; });
  `;
  const results = scanScenarios(source, 'app/demo.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.steps).toEqual([
    { see: 'hello' },
    { tap: 'btn' },
    { see: 'world' },
  ]);
});

test('scanScenarios extracts test steps from shorthand method syntax', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'account',
      route: '/account',
      test({ see, tap }) {
        return [
          see('screen-account'),
          tap('logout-btn'),
        ];
      },
    }, function Account() { return null; });
  `;
  const results = scanScenarios(source, 'app/account.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.steps).toEqual([
    { see: 'screen-account' },
    { tap: 'logout-btn' },
  ]);
});

test('scanScenarios extracts variants', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'profile',
      route: '/profile',
      variants: {
        'logged-in': {
          test: ({ see }) => [see('Alice')],
        },
        'logged-out': {
          test: ({ see }) => [see('Sign in')],
        },
      },
    }, function Profile() { return null; });
  `;
  const results = scanScenarios(source, 'app/profile.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.variants).toHaveLength(2);
  expect(results[0]!.variants[0]!.key).toBe('logged-in');
  expect(results[0]!.variants[0]!.steps).toEqual([{ see: 'Alice' }]);
  expect(results[0]!.variants[1]!.key).toBe('logged-out');
  expect(results[0]!.variants[1]!.steps).toEqual([{ see: 'Sign in' }]);
});

test('generateYaml for variant uses base ID as testID and variant in tags', () => {
  const yaml = generateYaml({
    id: 'profile/logged-in',
    filePath: 'app/profile.tsx',
    steps: [{ see: 'Alice' }],
  }, 'com.test.app');
  expect(yaml).toContain('preflight://scenario/profile/logged-in');
  expect(yaml).toContain('id: "profile"');
  expect(yaml).toContain('- "logged-in"');
  expect(yaml).toContain('takeScreenshot: ".maestro/snapshots/profile/logged-in/current"');
});

test('scanScenarios extracts flow steps', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'signup',
      route: '/signup',
      test: ({ type, tap }) => [
        type('name-input', 'Alice'),
        tap('submit-btn'),
      ],
      flow: [
        { screen: 'onboarding', actions: ({ tap }) => [tap('skip-btn')] },
        { screen: 'home' },
      ],
    }, function Signup() { return null; });
  `;
  const results = scanScenarios(source, 'app/signup.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.flow).toHaveLength(2);
  expect(results[0]!.flow[0]!.screen).toBe('onboarding');
  expect(results[0]!.flow[0]!.steps).toEqual([{ tap: 'skip-btn' }]);
  expect(results[0]!.flow[1]!.screen).toBe('home');
  expect(results[0]!.flow[1]!.steps).toEqual([]);
});

test('generateFlowYaml creates multi-screen YAML', () => {
  const { generateFlowYaml } = require('../commands/generate');
  const yaml = generateFlowYaml({
    id: 'signup',
    filePath: 'app/signup.tsx',
    steps: [{ tap: 'submit-btn' }],
    variants: [],
    flow: [
      { screen: 'onboarding', steps: [{ tap: 'skip-btn' }] },
      { screen: 'home', steps: [] },
    ],
  }, 'com.test.app');
  expect(yaml).toContain('- flow');
  expect(yaml).toContain('preflight://scenario/signup');
  expect(yaml).toContain('id: "onboarding"');
  expect(yaml).toContain('id: "home"');
  expect(yaml).toContain('tapOn:\n    id: "skip-btn"');
  expect(yaml).toContain('takeScreenshot: ".maestro/snapshots/flow-signup/current"');
});

test('generateYaml includes env variables block', () => {
  const yaml = generateYaml(
    { id: 'login', filePath: 'app/login.tsx', steps: [] },
    'com.test.app',
    '.maestro/snapshots',
    { TEST_EMAIL: 'alice@test.com', TEST_PASSWORD: 'secret' },
  );
  expect(yaml).toContain('env:');
  expect(yaml).toContain('TEST_EMAIL: "alice@test.com"');
  expect(yaml).toContain('TEST_PASSWORD: "secret"');
});

test('generateYaml includes isE2E launch argument', () => {
  const yaml = generateYaml({ id: 'test', filePath: 'app/test.tsx', steps: [] }, 'com.test.app');
  expect(yaml).toContain('isE2E: "true"');
});

test('generateFlowYaml handles skipIf with notVisible condition', () => {
  const { generateFlowYaml } = require('../commands/generate');
  const yaml = generateFlowYaml({
    id: 'login-flow',
    filePath: 'app/login.tsx',
    steps: [],
    variants: [],
    flow: [
      { screen: 'onboarding', steps: [{ tap: 'skip-btn' }], skipIf: 'home' },
      { screen: 'home', steps: [] },
    ],
    env: {},
  }, 'com.test.app');
  expect(yaml).toContain('notVisible: "home"');
  expect(yaml).not.toContain('visible: "home"');
  expect(yaml).toContain('id: "onboarding"');
});

test('scanScenarios extracts env from scenario config', () => {
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'login',
      route: '/login',
      env: { TEST_EMAIL: 'test@test.com' },
    }, function Login() { return null; });
  `;
  const results = scanScenarios(source, 'app/login.tsx');
  expect(results).toHaveLength(1);
  expect(results[0]!.env).toEqual({ TEST_EMAIL: 'test@test.com' });
});

test('generateYaml supports multi-platform appId', () => {
  const yaml = generateYaml(
    { id: 'test', filePath: 'app/test.tsx', steps: [] },
    { ios: 'com.example.ios', android: 'com.example.android' },
  );
  expect(yaml).toContain('appId:');
  expect(yaml).toContain('ios: "com.example.ios"');
  expect(yaml).toContain('android: "com.example.android"');
  expect(yaml).not.toContain('appId: "');
});

test('scanScenarios skips invalid IDs', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  const source = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'invalid id with spaces',
      route: '/test',
    }, function Test() { return null; });
  `;
  const results = scanScenarios(source, 'app/test.tsx');
  expect(results).toHaveLength(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid'));
  warn.mockRestore();
});

test('generateYaml handles type step', () => {
  const yaml = generateYaml({
    id: 'form',
    filePath: 'app/form.tsx',
    steps: [{ type: ['email-input', 'test@test.com'] }],
  }, 'com.test.app');
  expect(yaml).toContain('tapOn:\n    id: "email-input"');
  expect(yaml).toContain('inputText: "test@test.com"');
});
