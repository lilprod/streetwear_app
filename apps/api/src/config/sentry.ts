import * as Sentry from '@sentry/node';

const MASKED_FIELDS = new Set(['phone', 'address', 'landmark']);

export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, MASKED_FIELDS.has(k) ? '[masqué]' : scrub(v)]),
    );
  }
  return value;
}

export function initSentry(dsn: string, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    beforeSend: (event) => scrub(event) as typeof event,
  });
}
