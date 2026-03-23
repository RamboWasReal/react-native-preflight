import { registerScenario, getScenario, getAllScenarios, clearRegistry } from '../registry';
import type { ScenarioEntry } from '../types';

afterEach(() => {
  clearRegistry();
});

test('registers and retrieves a scenario by id', () => {
  const entry: ScenarioEntry = {
    id: 'test-screen',
    route: '/test-screen',
    description: 'A test screen',
    inject: undefined,
  };
  registerScenario(entry);
  expect(getScenario('test-screen')).toEqual(entry);
});

test('returns undefined for unknown id', () => {
  expect(getScenario('nonexistent')).toBeUndefined();
});

test('getAllScenarios returns all registered', () => {
  registerScenario({ id: 'a', route: '/a' });
  registerScenario({ id: 'b', route: '/b' });
  expect(getAllScenarios()).toHaveLength(2);
});

test('warns on duplicate id registration', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  registerScenario({ id: 'dup', route: '/dup' });
  registerScenario({ id: 'dup', route: '/dup2' });
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('dup')
  );
  warn.mockRestore();
});
