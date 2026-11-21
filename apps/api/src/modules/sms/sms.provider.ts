import { appendFile } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../../common/redact';
import { ENV, type Env } from '../../config/env';

export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/**
 * Adaptateur factice : ne journalise jamais le texte (il contient les codes OTP).
 * Pour les tests bout en bout, `TEST_SMS_OUTBOX_FILE` ajoute chaque envoi (JSON par ligne) à un
 * fichier ; la variable est refusée au démarrage en production.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');
  readonly outbox: { phone: string; text: string }[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(phone: string, text: string): Promise<void> {
    this.outbox.push({ phone, text });
    if (this.env.NODE_ENV !== 'production' && this.env.TEST_SMS_OUTBOX_FILE) {
      await appendFile(
        this.env.TEST_SMS_OUTBOX_FILE,
        `${JSON.stringify({ phone, text, at: new Date().toISOString() })}\n`,
      );
    }
    this.logger.log(`SMS envoyé à ${maskPhone(phone)}`);
  }
}
