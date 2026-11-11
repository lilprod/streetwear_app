import { Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationTemplate } from '@prisma/client';
import { z } from 'zod';
import { apiError } from '../../common/api-error';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_MAX_SEPTETS } from './gsm7';
import { render, SPEC_BY_KEY, smsWorstLength, validateTemplate } from './templates';

export const UpdateTemplateInputSchema = z
  .object({
    key: z.string().min(1).max(80),
    channel: z.enum(['push', 'sms', 'email']),
    title: z.string().trim().min(1).max(120).nullable().optional(),
    body: z.string().trim().min(1).max(1000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateInputSchema>;

export interface AdminNotificationTemplate {
  key: string;
  channel: NotificationChannel;
  title: string | null;
  body: string;
  active: boolean;
  /** Variables autorisées (`{{nom}}`). */
  variables: string[];
  /** Rendu avec des valeurs d'exemple (codes factices). */
  preview: { title: string | null; body: string };
  /** SMS : longueur maximale en septets GSM-7 avec des valeurs maximales (limite 160). */
  smsMaxLength: number | null;
  updatedAt: string;
}

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private view(t: NotificationTemplate): AdminNotificationTemplate {
    const spec = SPEC_BY_KEY.get(t.key);
    const sample = spec?.sample ?? {};
    return {
      key: t.key,
      channel: t.channel,
      title: t.title,
      body: t.body,
      active: t.active,
      variables: [...(spec?.vars ?? [])],
      preview: {
        title: t.title === null ? null : render(t.title, sample),
        body: render(t.body, sample),
      },
      smsMaxLength: t.channel === 'sms' && spec ? smsWorstLength(spec, t.body) : null,
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  async list(): Promise<{ items: AdminNotificationTemplate[] }> {
    const rows = await this.prisma.notificationTemplate.findMany({
      orderBy: [{ key: 'asc' }, { channel: 'asc' }],
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  async update(input: UpdateTemplateInput): Promise<AdminNotificationTemplate> {
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { key_channel: { key: input.key, channel: input.channel } },
    });
    const spec = SPEC_BY_KEY.get(input.key);
    if (!row || !spec) {
      throw apiError(404, 'NOT_FOUND', 'Modèle de notification introuvable.');
    }
    const title = input.title === undefined ? row.title : input.title;
    const body = input.body ?? row.body;
    if (row.channel === 'sms' ? title !== null : title === null) {
      throw apiError(400, 'VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
        reasons: [row.channel === 'sms' ? 'SMS_HAS_NO_TITLE' : 'TITLE_REQUIRED'],
      });
    }
    const problems = validateTemplate(spec, row.channel, title, body);
    if (problems.length) {
      throw apiError(400, 'VALIDATION_FAILED', 'Le modèle contient des erreurs.', {
        reasons: problems.map((p) => p.reason),
        problems,
        maxSmsLength: SMS_MAX_SEPTETS,
      });
    }
    const updated = await this.prisma.notificationTemplate.update({
      where: { id: row.id },
      data: { title, body, active: input.active ?? row.active },
    });
    return this.view(updated);
  }
}
