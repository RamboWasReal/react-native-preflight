import { View, Text, StyleSheet } from 'react-native';
import { scenario, testHelpers } from 'react-native-preflight';

const { see } = testHelpers;

function ProfileScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>JD</Text>
      </View>
      <Text testID="profile-name" style={styles.name}>
        Jane Doe
      </Text>
      <Text testID="profile-email" style={styles.email}>
        jane@example.com
      </Text>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>42</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>128</Text>
          <Text style={styles.statLabel}>Tasks</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>96%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
      </View>
    </View>
  );
}

export default scenario(
  {
    id: 'profile',
    route: '/profile',
    description: 'Static profile screen',
    test: () => [
      see({ id: 'profile-name', text: 'Jane Doe' }),
      see({ id: 'profile-email', text: 'jane@example.com' }),
    ],
  },
  ProfileScreen,
);

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 32 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 14, color: '#666', marginTop: 4 },
});
