import * as Sentry from '@sentry/react-native';
import { scrub } from './scrub';

export function initSentry(dsn: string | undefined, environment: string | undefined): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    beforeSend: (event) => scrub(event) as typeof event,
  });
}
