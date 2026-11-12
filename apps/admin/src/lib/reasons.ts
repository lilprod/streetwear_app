import type { FrKey } from '../i18n/fr';
import { fr } from '../i18n/fr';
import { ApiRequestError, errorMessage } from './errors';

/** Libellés des raisons renvoyées par `details.reasons` (ex. `catalog.reason.RIGHTS_HOLDER_MISSING`). */
export function reasonMessages(err: unknown, prefix: string): string[] {
  if (err instanceof ApiRequestError) {
    const d = err.details as { reasons?: unknown } | undefined;
    if (Array.isArray(d?.reasons) && d.reasons.length > 0) {
      return d.reasons.map((r) => {
        const key = `${prefix}.${String(r)}` as FrKey;
        return key in fr ? fr[key] : errorMessage(err);
      });
    }
  }
  return [errorMessage(err)];
}

export const isUnconfigured = (err: unknown): boolean =>
  err instanceof ApiRequestError &&
  (err.code === 'PROVIDER_UNAVAILABLE' || err.code === 'SERVICE_UNAVAILABLE');
