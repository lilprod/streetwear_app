import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockAdminController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [StockAdminController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.audit.registerLoader('stock', (id) =>
      id ? this.prisma.stockItem.findUnique({ where: { id } }) : Promise.resolve(null),
    );
  }
}
