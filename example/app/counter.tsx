import { View, Text, Pressable, StyleSheet } from 'react-native';
import { scenario, testHelpers } from 'react-native-preflight';
import { useCounterStore } from '../src/stores/counter-store';

const { tap, see } = testHelpers;

function CounterScreen() {
  const { count, increment, decrement } = useCounterStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Counter</Text>
      <Text testID="count" style={styles.count}>
        {count}
      </Text>
      <View style={styles.row}>
        <Pressable testID="decrement" onPress={decrement} style={styles.button}>
          <Text style={styles.buttonText}>-</Text>
        </Pressable>
        <Pressable testID="increment" onPress={increment} style={styles.button}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default scenario(
  {
    id: 'counter',
    route: '/counter',
    description: 'Counter with increment/decrement',
    inject: () => {
      useCounterStore.setState({ count: 0 });
    },
    test: () => [
      see({ id: 'count', text: '0' }),
      tap('increment'),
      see({ id: 'count', text: '1' }),
      tap('increment'),
      see({ id: 'count', text: '2' }),
      tap('decrement'),
      see({ id: 'count', text: '1' }),
    ],
    variants: {
      'high-value': {
        description: 'Counter starting at 99',
        inject: () => {
          useCounterStore.setState({ count: 99 });
        },
        test: () => [
          see({ id: 'count', text: '99' }),
          tap('increment'),
          see({ id: 'count', text: '100' }),
        ],
      },
    },
  },
  CounterScreen,
);

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  count: { fontSize: 64, fontWeight: '700', marginBottom: 24 },
  row: { flexDirection: 'row', gap: 16 },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 28, fontWeight: '700' },
});
