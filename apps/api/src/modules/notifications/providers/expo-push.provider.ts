import { Logger } from '@nestjs/common';
import type { PushMessage, PushProvider, PushReceipt, PushTicket } from './push.provider';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const BASE = 'https://exp.host/--/api/v2/push';
export const EXPO_SEND_BATCH = 100;
export const EXPO_RECEIPT_BATCH = 1000;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Expo Push : envoi par lots de 100, reçus par lots de 1000. Les corps ne sont jamais journalisés. */
export class ExpoPushProvider implements PushProvider {
  private readonly logger = new Logger('ExpoPush');

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {}

  private async post(path: string, payload: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    const res = await this.fetchFn(`${BASE}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`EXPO_HTTP_${res.status}`);
    return ((await res.json()) as { data?: unknown }).data;
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (const batch of chunks(messages, EXPO_SEND_BATCH)) {
      const data = (await this.post(
        'send',
        batch.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: 'default',
        })),
      )) as ExpoTicket[] | undefined;
      if (!Array.isArray(data) || data.length !== batch.length)
        throw new Error('EXPO_BAD_RESPONSE');
      batch.forEach((m, i) => {
        const t = data[i] as ExpoTicket;
        tickets.push(
          t.status === 'ok' && t.id
            ? { to: m.to, ok: true, id: t.id }
            : { to: m.to, ok: false, error: t.details?.error ?? 'Unknown' },
        );
      });
    }
    this.logger.log(`Expo : ${messages.length} message(s) envoyé(s)`);
    return tickets;
  }

  async receipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    const out: Record<string, PushReceipt> = {};
    for (const batch of chunks(ids, EXPO_RECEIPT_BATCH)) {
      const data = (await this.post('getReceipts', { ids: batch })) as
        Record<string, ExpoTicket> | undefined;
      for (const [id, r] of Object.entries(data ?? {})) {
        out[id] =
          r.status === 'ok' ? { ok: true } : { ok: false, error: r.details?.error ?? 'Unknown' };
      }
    }
    return out;
  }
}
