import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQuerySchema } from '@streetwear/shared';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';

const AuditQuerySchema = PageQuerySchema.extend({
  entity: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
});

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodPipe(AuditQuerySchema)) q: z.infer<typeof AuditQuerySchema>) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(q.entity && { entity: q.entity }),
        ...(q.entityId && { entityId: q.entityId }),
        ...(q.cursor && { id: { lt: q.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      include: { adminUser: { select: { email: true } } },
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        adminUserId: r.adminUserId,
        adminEmail: r.adminUser?.email ?? null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
