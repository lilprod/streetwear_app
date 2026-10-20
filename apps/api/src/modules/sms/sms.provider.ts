import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../../common/redact';

export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Adaptateur factice : ne journalise jamais le texte (il contient les codes OTP). */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');
  readonly outbox: { phone: string; text: string }[] = [];

  async send(phone: string, text: string): Promise<void> {
    this.outbox.push({ phone, text });
    this.logger.log(`SMS envoyé à ${maskPhone(phone)}`);
  }
}
