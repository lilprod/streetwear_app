import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { redact } from '../../common/redact';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';

export type SnapshotLoader = (entityId: string | undefined) => Promise<unknown>;

export interface AuditEntry {
  adminUserId: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

const json = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === undefined || v === null
    ? Prisma.JsonNull
    : (JSON.parse(JSON.stringify(redact(v))) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  private readonly loaders = new Map<string, SnapshotLoader>();

  constructor(private readonly prisma: PrismaService) {}

  /** Les modules enregistrent un chargeur d'état « avant » pour leur entité (segment d'URL après /admin/). */
  registerLoader(entity: string, loader: SnapshotLoader): void {
    this.loaders.set(entity, loader);
  }

  async snapshot(entity: string, entityId: string | undefined): Promise<unknown> {
    const loader = this.loaders.get(entity);
    if (!loader) return null;
    try {
      return await loader(entityId);
    } catch {
      return null;
    }
  }

  async record(e: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: uuidv7(),
        adminUserId: e.adminUserId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        before: json(e.before),
        after: json(e.after),
      },
    });
  }
}
