export type TestStep =
  | { tap: string }
  | { see: string | { id: string; text?: string } }
  | { notSee: string }
  | { type: [id: string, text: string] }
  | { wait: number }
  | { scroll: [id: string, direction: 'up' | 'down' | 'left' | 'right', duration?: number] };

export interface TestHelpers {
  tap: (id: string) => TestStep;
  see: (target: string | { id: string; text?: string }) => TestStep;
  notSee: (text: string) => TestStep;
  type: (id: string, text: string) => TestStep;
  wait: (ms: number) => TestStep;
  scroll: (id: string, direction: 'up' | 'down' | 'left' | 'right', duration?: number) => TestStep;
}

export const testHelpers: TestHelpers = {
  tap: (id) => ({ tap: id }),
  see: (target) => ({ see: target }),
  notSee: (text) => ({ notSee: text }),
  type: (id, text) => ({ type: [id, text] }),
  wait: (ms) => ({ wait: ms }),
  scroll: (id, direction, duration) => ({ scroll: [id, direction, duration] }),
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
}

export type ScenarioEntry = ScenarioConfig & { variantOf?: string };

export interface PreflightProps {
  onNavigate?: (scenarioId: string) => void;
}
