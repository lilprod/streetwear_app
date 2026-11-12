import type { OrderStatus } from '@streetwear/shared';
import type { KeyValueStorage } from '../../storage/storage';

type Store = Pick<KeyValueStorage, 'getString' | 'set' | 'remove'>;

const KEY = 'order-codes';

/**
 * Code de retrait ou de remise tel que reçu par notification. Il est rattaché au statut de la
 * notification : SP07 réémet un nouveau code à chaque passage en `ready_for_pickup` / `shipped`,
 * et l'API ne renvoie jamais le code dans `GET /orders/:id`.
 */
export type ReceivedCode = {
  orderId: string;
  status: OrderStatus;
  code: string;
  receivedAt: string;
};

export const CODE_STATUSES: readonly OrderStatus[] = ['ready_for_pickup', 'shipped'];

function readAll(storage: Store): Record<string, ReceivedCode> {
  try {
    return JSON.parse(storage.getString(KEY) ?? '{}') as Record<string, ReceivedCode>;
  } catch {
    return {};
  }
}

/** Mémorise le dernier code reçu pour la commande ; un push plus ancien n'écrase pas un plus récent. */
export function recordCode(storage: Store, entry: ReceivedCode): void {
  const all = readAll(storage);
  const previous = all[entry.orderId];
  if (previous && previous.receivedAt > entry.receivedAt) return;
  storage.set(KEY, JSON.stringify({ ...all, [entry.orderId]: entry }));
}

/** Code à afficher : uniquement celui reçu pour le statut courant de la commande, jamais un code d'une étape précédente. */
export function codeFor(storage: Store, orderId: string, status: OrderStatus): string | null {
  if (!CODE_STATUSES.includes(status)) return null;
  const entry = readAll(storage)[orderId];
  return entry && entry.status === status ? entry.code : null;
}

export const clearCodes = (storage: Store): void => storage.remove(KEY);

export type PushContent = {
  body?: string | null;
  data?: Record<string, unknown> | null;
};

/** Enregistre le code contenu dans une notification (`data.code`, toujours présent pour `ready_for_pickup` et `shipped`). */
export function recordFromNotification(
  storage: Store,
  content: PushContent,
  receivedAt: Date = new Date(),
): { orderId: string; status: string } | null {
  const data = content.data ?? {};
  const orderId = typeof data.orderId === 'string' ? data.orderId : null;
  const status = typeof data.status === 'string' ? data.status : null;
  if (!orderId || !status) return null;
  const code = typeof data.code === 'string' ? data.code : null;
  if (code && CODE_STATUSES.includes(status as OrderStatus)) {
    recordCode(storage, {
      orderId,
      status: status as OrderStatus,
      code,
      receivedAt: receivedAt.toISOString(),
    });
  }
  return { orderId, status };
}

/** Affichage `123 456`. */
export const formatCode = (code: string): string =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
