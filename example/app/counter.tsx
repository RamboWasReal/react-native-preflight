import { scenario } from 'react-native-preflight';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useCounterStore } from '../src/stores/counter-store';

export default scenario({
  id: 'counter',
  route: '/counter',
  description: 'Simple counter demo',
  inject: (overrides) => {
    const count = (overrides?.count as number) ?? 42;
    useCounterStore.setState({ count });
  },
  test: ({ tap, see }) => [
    see('42'),
    tap('counter-increment'),
    tap('counter-increment'),
    tap('counter-increment'),
    see('45'),
    tap('counter-decrement'),
    see('44'),
  ],
}, function CounterScreen() {
  const { count, increment, decrement } = useCounterStore();
  return (
    <View style={styles.container}>
      <Text testID="counter-value" style={styles.count}>{count}</Text>
      <View style={styles.buttons}>
        <Button testID="counter-decrement" title="-" onPress={decrement} />
        <Button testID="counter-increment" title="+" onPress={increment} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  count: { fontSize: 64, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 16, marginTop: 24 },
});
