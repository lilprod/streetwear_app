import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../modules/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';

@Module({ controllers: [AdminCatalogController], providers: [AdminCatalogService] })
export class AdminCatalogModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const p = this.prisma;
    const byId =
      (find: (id: string) => Promise<unknown>) =>
      (id: string | undefined): Promise<unknown> =>
        id ? find(id) : Promise.resolve(null);
    this.audit.registerLoader(
      'patterns',
      byId((id) => p.pattern.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'pattern-categories',
      byId((id) => p.patternCategory.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'colors',
      byId((id) => p.tshirtColor.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'fonts',
      byId((id) => p.font.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'banned-words',
      byId((id) => p.bannedWord.findUnique({ where: { id } })),
    );
    this.audit.registerLoader('price-rules', () =>
      p.priceRule.findMany({ orderBy: { key: 'asc' } }),
    );
  }
}
