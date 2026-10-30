import { useTypeface } from '@shopify/react-native-skia';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setTypefaces } from '@/canvas/draw';
import { C } from '@/theme';

export default function RootLayout() {
  const regular = useTypeface(require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
  const bold = useTypeface(require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'));
  if (!regular || !bold) return null;
  setTypefaces(regular, bold);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.surface },
            headerTintColor: C.ink,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="bench/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="learn/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="learn/index" options={{ title: 'Learn' }} />
          <Stack.Screen name="challenges" options={{ title: 'Challenges' }} />
          <Stack.Screen name="examples" options={{ title: 'Example circuits' }} />
          <Stack.Screen name="circuits" options={{ title: 'My circuits' }} />
          <Stack.Screen name="library/index" options={{ title: 'Component library' }} />
          <Stack.Screen name="library/[type]" options={{ title: 'Datasheet' }} />
          <Stack.Screen name="glossary" options={{ title: 'Glossary' }} />
          <Stack.Screen name="about" options={{ title: 'About Bench' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
