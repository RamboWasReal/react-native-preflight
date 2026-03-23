import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { getAllScenarios, getScenario } from './registry';
import type { PreflightProps, ScenarioEntry } from './types';

let expoRouter: { router: { push: (route: string) => void } } | null = null;
try {
  expoRouter = require('expo-router');
} catch {
  // expo-router not available
}

function ScenarioItem({
  entry,
  onPreview,
}: {
  entry: ScenarioEntry;
  onPreview: (id: string) => void;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemId}>{entry.id}</Text>
        {entry.description ? (
          <Text style={styles.itemDescription}>{entry.description}</Text>
        ) : null}
      </View>
      <Pressable
        style={styles.previewButton}
        onPress={() => onPreview(entry.id)}
      >
        <Text style={styles.previewButtonText}>Preview</Text>
      </Pressable>
    </View>
  );
}

export function Preflight({ onNavigate }: PreflightProps) {
  const scenarios = getAllScenarios();

  const handlePreview = useCallback(
    async (id: string) => {
      if (onNavigate) {
        onNavigate(id);
        return;
      }

      const entry = getScenario(id);
      if (!entry) {
        console.warn(`[preflight] Scenario "${id}" not found in registry.`);
        return;
      }

      if (!expoRouter) {
        console.error('[preflight] expo-router not available. Provide an onNavigate prop to <Preflight />.');
        return;
      }

      if (entry.inject) {
        try {
          await entry.inject(undefined);
        } catch (error) {
          console.error(`[preflight] inject() failed for scenario "${id}":`, error);
          return;
        }
      }

      expoRouter.router.push(entry.route);
    },
    [onNavigate],
  );

  if (scenarios.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No scenarios registered</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Preflight</Text>
      <FlatList
        data={scenarios}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ScenarioItem entry={item} onPreview={handlePreview} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  itemInfo: { flex: 1 },
  itemId: { fontSize: 16, fontWeight: '600' },
  itemDescription: { fontSize: 14, color: '#666', marginTop: 2 },
  previewButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  previewButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
