import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker/400Regular';
import { initSentry } from '../src/sentry';

initSentry(process.env.EXPO_PUBLIC_SENTRY_DSN, process.env.EXPO_PUBLIC_APP_ENV);

export default function RootLayout() {
  const [loaded] = useFonts({
    Geist_400Regular,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
    BebasNeue_400Regular,
    Anton_400Regular,
    PermanentMarker_400Regular,
  });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
