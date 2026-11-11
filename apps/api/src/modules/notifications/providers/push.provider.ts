import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type PushTicket = { to: string } & ({ ok: true; id: string } | { ok: false; error: string });

export type PushReceipt = { ok: true } | { ok: false; error: string };

export interface PushProvider {
  /** Un ticket par message, dans l'ordre. Lève si le fournisseur est injoignable (le job sera rejoué). */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts(ids: string[]): Promise<Record<string, PushReceipt>>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Adaptateur factice : aucun réseau. Un jeton commençant par `invalid` est refusé (DeviceNotRegistered). */
@Injectable()
export class FakePushProvider implements PushProvider {
  private readonly logger = new Logger('Push');
  readonly outbox: PushMessage[] = [];
  readonly receiptErrors = new Map<string, string>();
  failing = false;
  private seq = 0;

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (this.failing) throw new Error('PUSH_PROVIDER_DOWN');
    const tickets = messages.map((m): PushTicket => {
      if (m.to.startsWith('invalid')) {
        return { to: m.to, ok: false, error: 'DeviceNotRegistered' };
      }
      this.outbox.push(m);
      return { to: m.to, ok: true, id: `fake-ticket-${++this.seq}` };
    });
    this.logger.log(
      `Push factice : « ${messages[0]?.title ?? ''} » vers ${messages.length} appareil(s)`,
    );
    return tickets;
  }

  async receipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    return Object.fromEntries(
      ids.map((id): [string, PushReceipt] => {
        const error = this.receiptErrors.get(id);
        return [id, error ? { ok: false, error } : { ok: true }];
      }),
    );
  }
}
