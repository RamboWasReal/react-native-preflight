import type { ScenarioEntry } from './types';

const registry = new Map<string, ScenarioEntry>();

export function registerScenario(entry: ScenarioEntry): void {
  if (registry.has(entry.id)) {
    console.warn(`[preflight] Scenario "${entry.id}" is already registered. Overwriting.`);
  }
  registry.set(entry.id, entry);
}

export function getScenario(id: string): ScenarioEntry | undefined {
  return registry.get(id);
}

export function getAllScenarios(): ScenarioEntry[] {
  return Array.from(registry.values());
}

export function clearRegistry(): void {
  registry.clear();
}
