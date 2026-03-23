import { Stack } from 'expo-router';
import { StateInjector } from 'react-native-preflight';

export default function RootLayout() {
  return (
    <StateInjector>
      <Stack />
    </StateInjector>
  );
}
