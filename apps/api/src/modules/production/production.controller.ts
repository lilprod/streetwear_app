import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { UuidParam } from '../../common/uuid-param';
import { ZodPipe } from '../../common/zod.pipe';
import type { AdminPrincipal } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current.decorators';
import { AdminAuthGuard } from '../auth/guards';
import { Roles } from '../auth/roles.decorator';
import { ProductionService } from './production.service';

const AssignOperatorSchema = z.object({ operatorId: z.string().uuid() }).strict();

@ApiTags('admin-production')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminAuthGuard)
@Roles('production', 'super_admin')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post('orders/:id/assign-operator')
  @HttpCode(200)
  assignOperator(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(AssignOperatorSchema)) body: z.infer<typeof AssignOperatorSchema>,
  ) {
    return this.production.assignOperator(id, body.operatorId, {
      type: 'admin',
      role: admin.role,
      id: admin.id,
    });
  }

  @Get('orders/:id/production-sheet.pdf')
  async sheet(@Param('id', UuidParam) id: string, @Res() res: Response): Promise<void> {
    const { number, pdf } = await this.production.productionSheet(id);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fiche-${number}.pdf"`,
        'Cache-Control': 'private, no-store',
      })
      .send(pdf);
  }

  @Get('order-items/:id/print-files')
  printFiles(@Param('id', UuidParam) id: string) {
    return this.production.printFiles(id);
  }

  @Post('order-items/:id/print-files/regenerate')
  @HttpCode(202)
  regenerate(@Param('id', UuidParam) id: string) {
    return this.production.regenerate(id);
  }
}
