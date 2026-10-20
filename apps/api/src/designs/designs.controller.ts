import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Headers,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateDesignInputSchema,
  DesignPreviewsInputSchema,
  DesignsQuerySchema,
  UpdateDesignInputSchema,
} from '@streetwear/shared';
import type { CustomerPrincipal } from '../modules/auth/auth.types';
import { CurrentUser } from '../modules/auth/current.decorators';
import { CustomerAuthGuard } from '../modules/auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { DesignsService } from './designs.service';

const IdempotencyKeySchema = z.string().uuid();

@ApiTags('designs')
@ApiBearerAuth()
@Controller('designs')
@UseGuards(CustomerAuthGuard)
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  list(
    @CurrentUser() me: CustomerPrincipal,
    @Query(new ZodPipe(DesignsQuerySchema)) query: typeof DesignsQuerySchema._output,
  ) {
    return this.designs.list(me.id, query);
  }

  @Post()
  async create(
    @CurrentUser() me: CustomerPrincipal,
    @Body(new ZodPipe(CreateDesignInputSchema)) body: typeof CreateDesignInputSchema._output,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const idempotencyKey =
      key === undefined ? undefined : new ZodPipe(IdempotencyKeySchema).transform(key);
    const { design, replayed } = await this.designs.create(me.id, body, idempotencyKey);
    if (replayed) res.status(200);
    return design;
  }

  @Get(':id')
  get(@CurrentUser() me: CustomerPrincipal, @Param('id') id: string) {
    return this.designs.get(me.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() me: CustomerPrincipal,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateDesignInputSchema)) body: typeof UpdateDesignInputSchema._output,
  ) {
    return this.designs.update(me.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: CustomerPrincipal, @Param('id') id: string): Promise<void> {
    await this.designs.remove(me.id, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() me: CustomerPrincipal, @Param('id') id: string) {
    return this.designs.duplicate(me.id, id);
  }

  @Post(':id/previews')
  previews(
    @CurrentUser() me: CustomerPrincipal,
    @Param('id') id: string,
    @Body(new ZodPipe(DesignPreviewsInputSchema)) body: typeof DesignPreviewsInputSchema._output,
  ) {
    return this.designs.setPreviews(me.id, id, body);
  }
}
