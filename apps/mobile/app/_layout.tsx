import { Stack } from 'expo-router';
import { initSentry } from '../src/sentry';

initSentry(process.env.EXPO_PUBLIC_SENTRY_DSN, process.env.EXPO_PUBLIC_APP_ENV);

export default function RootLayout() {
  return <Stack />;
}
