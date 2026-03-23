import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Preflight Example</Text>
      <Text style={styles.subtitle}>3 scenarios registered</Text>

      <Link href="/counter" style={styles.link}>
        <Text style={styles.linkText}>Counter</Text>
      </Link>
      <Link href="/todos" style={styles.link}>
        <Text style={styles.linkText}>Todos</Text>
      </Link>
      <Link href="/profile" style={styles.link}>
        <Text style={styles.linkText}>Profile</Text>
      </Link>

      <Link href="/__dev/preflight" style={[styles.link, styles.catalogLink]}>
        <Text style={styles.linkText}>Open Preflight Catalog</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 32 },
  link: { marginVertical: 6, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#007AFF', borderRadius: 8, width: 240, alignItems: 'center' },
  catalogLink: { marginTop: 24, backgroundColor: '#34C759' },
  linkText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
