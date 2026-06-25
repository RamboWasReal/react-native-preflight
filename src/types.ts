export type ElementSelector =
  | string
  | {
      text?: string;
      id?: string;
      index?: number;
      enabled?: boolean;
      checked?: boolean;
      focused?: boolean;
      selected?: boolean;
      below?: string | ElementSelector;
      above?: string | ElementSelector;
      leftOf?: string | ElementSelector;
      rightOf?: string | ElementSelector;
      containsChild?: string | ElementSelector;
      containsDescendants?: Array<string | ElementSelector>;
      point?: string;
    };

export type TestStep =
  | { tap: string | ElementSelector }
  | { see: string | ElementSelector }
  | { notSee: string | ElementSelector }
  | { type: [id: string, text: string] }
  | { wait: number }
  | { scroll: [id: string, direction: 'up' | 'down' | 'left' | 'right'] }
  | { swipe: [direction: 'up' | 'down' | 'left' | 'right', duration?: number] }
  | { back: true }
  | { hideKeyboard: true }
  | { longPress: string | ElementSelector }
  | { doubleTap: string | ElementSelector }
  | { navigate: string }
  | { openLink: string }
  | { eraseText?: number }
  | { pressKey: string }
  | { extendedWaitUntil: { visible?: ElementSelector; notVisible?: ElementSelector; timeout?: number } }
  | { assertTrue: string }
  | { setLocation: { latitude: number; longitude: number } }
  | { copyTextFrom: string | ElementSelector }
  | { pasteText: true }
  | { setClipboard: string }
  | { assertScreenshot: string | { path?: string; cropOn?: ElementSelector; thresholdPercentage?: number } }
  | { raw: string };

export interface TestHelpers {
  tap: (target: string | ElementSelector) => TestStep;
  see: (target: string | ElementSelector) => TestStep;
  notSee: (target: string | ElementSelector) => TestStep;
  type: (id: string, text: string) => TestStep;
  wait: (ms: number) => TestStep;
  scroll: (id: string, direction: 'up' | 'down' | 'left' | 'right') => TestStep;
  swipe: (direction: 'up' | 'down' | 'left' | 'right', duration?: number) => TestStep;
  back: () => TestStep;
  hideKeyboard: () => TestStep;
  longPress: (target: string | ElementSelector) => TestStep;
  doubleTap: (target: string | ElementSelector) => TestStep;
  navigate: (route: string) => TestStep;
  openLink: (url: string) => TestStep;
  eraseText: (count?: number) => TestStep;
  pressKey: (key: string) => TestStep;
  extendedWaitUntil: (opts: { visible?: ElementSelector; notVisible?: ElementSelector; timeout?: number }) => TestStep;
  assertTrue: (condition: string) => TestStep;
  setLocation: (lat: number, lng: number) => TestStep;
  copyTextFrom: (target: string | ElementSelector) => TestStep;
  pasteText: () => TestStep;
  setClipboard: (text: string) => TestStep;
  assertScreenshot: (nameOrOpts: string | { path?: string; cropOn?: ElementSelector; thresholdPercentage?: number }) => TestStep;
  raw: (yaml: string) => TestStep;
}

export const testHelpers: TestHelpers = {
  tap: (target) => ({ tap: target }),
  see: (target) => ({ see: target }),
  notSee: (target) => ({ notSee: target }),
  type: (id, text) => ({ type: [id, text] }),
  wait: (ms) => ({ wait: ms }),
  scroll: (id, direction) => ({ scroll: [id, direction] }),
  swipe: (direction, duration) => ({ swipe: [direction, duration] }),
  back: () => ({ back: true }),
  hideKeyboard: () => ({ hideKeyboard: true }),
  longPress: (target) => ({ longPress: target }),
  doubleTap: (target) => ({ doubleTap: target }),
  navigate: (route) => ({ navigate: route }),
  openLink: (url) => ({ openLink: url }),
  eraseText: (count) => ({ eraseText: count }),
  pressKey: (key) => ({ pressKey: key }),
  extendedWaitUntil: (opts) => ({ extendedWaitUntil: opts }),
  assertTrue: (condition) => ({ assertTrue: condition }),
  setLocation: (latitude, longitude) => ({ setLocation: { latitude, longitude } }),
  copyTextFrom: (target) => ({ copyTextFrom: target }),
  pasteText: () => ({ pasteText: true }),
  setClipboard: (text) => ({ setClipboard: text }),
  assertScreenshot: (nameOrOpts) => ({ assertScreenshot: nameOrOpts }),
  raw: (yaml) => ({ raw: yaml }),
};

export interface VariantConfig {
  description?: string;
  inject?: (overrides?: Record<string, unknown>) => void | Promise<void>;
  test?: (helpers: TestHelpers) => TestStep[];
}

export interface FlowStep {
  screen: string;
  actions?: (helpers: TestHelpers) => TestStep[];
  /** Skip this step if the given testID is already visible. */
  skipIf?: string;
}

export interface LaunchOptions {
  clearState?: boolean;
  clearKeychain?: boolean;
  stopApp?: boolean;
  permissions?: Record<string, 'allow' | 'deny' | 'unset'>;
}

export interface ScenarioConfig {
  id: string;
  route: string;
  description?: string;
  inject?: (overrides?: Record<string, unknown>) => void | Promise<void>;
  test?: (helpers: TestHelpers) => TestStep[];
  /** Named variants for testing different states of the same screen. */
  variants?: Record<string, VariantConfig>;
  /** Multi-screen flow continuing from this scenario. */
  flow?: FlowStep[];
  /** Environment variables passed to Maestro YAML. */
  env?: Record<string, string>;
  /** Options passed to launchApp in generated Maestro YAML. */
  launchOptions?: LaunchOptions;
}

export type ScenarioEntry = ScenarioConfig & { variantOf?: string };

export interface PreflightProps {
  onNavigate?: (scenarioId: string) => void;
}
