import * as Sentry from '@sentry/node';

const MASKED_KEY =
  /phone|e-?mail|^(user)?name$|^(first|last|full)_?name$|address|landmark|^lat$|^lng$|^code$|[a-z]Code$|token|secret|pass(word)?|authorization|cookie|signature|ip_address/i;
const E164 = /\+\d{8,15}/g;
const BEARER = /Bearer\s+[\w.~+/=-]+/gi;

function scrubString(value: string): string {
  return value.replace(BEARER, 'Bearer [masqué]').replace(E164, '[téléphone masqué]');
}

/** Masque les champs personnels ou secrets (par nom, sans tenir compte de la casse) et les numéros E.164 dans les textes. */
export function scrub(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, MASKED_KEY.test(k) ? '[masqué]' : scrub(v)]),
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
