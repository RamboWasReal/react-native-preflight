import { scenario } from 'react-native-preflight';
import { View, Text, Image, StyleSheet } from 'react-native';
import { create } from 'zustand';

interface ProfileState {
  name: string;
  email: string;
  avatar: string;
  bio: string;
}

const useProfileStore = create<ProfileState>(() => ({
  name: '',
  email: '',
  avatar: '',
  bio: '',
}));

export default scenario(
  {
    id: 'profile',
    route: '/profile',
    description: 'User profile with injected data',
    inject: (overrides) => {
      useProfileStore.setState({
        name: (overrides?.name as string) ?? 'Jane Doe',
        email: (overrides?.email as string) ?? 'jane@example.com',
        avatar: (overrides?.avatar as string) ?? 'https://i.pravatar.cc/150?img=5',
        bio: (overrides?.bio as string) ?? 'React Native developer who loves building great apps.',
      });
    },
    test: ({ see }) => [
      see({ id: 'profile-name', text: 'Jane Doe' }),
      see({ id: 'profile-email', text: 'jane@example.com' }),
      see({ id: 'profile-bio' }),
    ],
  },
  function ProfileScreen() {
    const { name, email, avatar, bio } = useProfileStore();

    return (
      <View style={styles.container}>
        {avatar ? (
          <Image testID="profile-avatar" source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{name.charAt(0)}</Text>
          </View>
        )}
        <Text testID="profile-name" style={styles.name}>{name}</Text>
        <Text testID="profile-email" style={styles.email}>{email}</Text>
        <Text testID="profile-bio" style={styles.bio}>{bio}</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 80, padding: 24, backgroundColor: '#fff' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 20 },
  avatarPlaceholder: { backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 48, fontWeight: '700', color: '#fff' },
  name: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 16 },
  bio: { fontSize: 16, color: '#333', textAlign: 'center', lineHeight: 24 },
});
