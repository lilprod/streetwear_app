import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/** Adaptateur factice : mémorise les e-mails, ne journalise ni destinataire ni corps. */
@Injectable()
export class FakeEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email');
  readonly outbox: EmailMessage[] = [];
  failing = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failing) throw new Error('EMAIL_PROVIDER_DOWN');
    this.outbox.push(message);
    this.logger.log(`E-mail factice : « ${message.subject} »`);
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    transport?: Transporter,
  ) {
    this.transport = transport ?? createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
