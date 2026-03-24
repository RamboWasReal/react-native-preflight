import React from 'react';
import { View } from 'react-native';
import { registerScenario } from './registry';
import type { ScenarioConfig } from './types';

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function scenario<P extends object>(
  config: ScenarioConfig,
  Component: React.ComponentType<P>,
): React.ComponentType<P>;
// eslint-disable-next-line no-redeclare
export function scenario(
  config: ScenarioConfig,
  Component: React.ComponentType<any>,
): React.ComponentType<any>;
// eslint-disable-next-line no-redeclare
export function scenario<P extends object>(
  config: ScenarioConfig,
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  if (!config.id) {
    console.warn('[preflight] scenario() called with empty id. Skipping registration.');
    return Component;
  }
  if (!config.route) {
    console.warn(`[preflight] scenario("${config.id}") called without a route. Skipping registration.`);
    return Component;
  }
  if (!VALID_ID_PATTERN.test(config.id)) {
    console.warn(`[preflight] scenario("${config.id}") has invalid id. Use only letters, numbers, hyphens, and underscores. Skipping registration.`);
    return Component;
  }

  // Register base scenario (when no variants, or as fallback)
  if (!config.variants) {
    registerScenario({
      id: config.id,
      route: config.route,
      description: config.description,
      inject: config.inject,
      test: config.test,
    });
  }

  // Register each variant as a separate scenario
  if (config.variants) {
    for (const [variantKey, variant] of Object.entries(config.variants)) {
      if (!VALID_ID_PATTERN.test(variantKey)) {
        console.warn(`[preflight] scenario("${config.id}") variant "${variantKey}" has invalid key. Skipping.`);
        continue;
      }
      registerScenario({
        id: `${config.id}/${variantKey}`,
        route: config.route,
        description: variant.description ?? config.description,
        inject: variant.inject ?? config.inject,
        test: variant.test ?? config.test,
        variantOf: config.id,
      });
    }
  }

  function ScenarioWrapper(props: P) {
    return (
      <View testID={config.id} style={{ flex: 1 }}>
        <Component {...props} />
      </View>
    );
  }

  ScenarioWrapper.displayName = `Scenario(${Component.displayName || Component.name || 'Component'})`;

  return ScenarioWrapper;
}
