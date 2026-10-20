import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateDesignInputSchema,
  DesignPreviewsInputSchema,
  DesignsQuerySchema,
  UpdateDesignInputSchema,
} from '@streetwear/shared';
import { CurrentCustomer, CustomerAuthGuard } from '../common/auth/guards';
import type { CustomerIdentity } from '../common/auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { DesignsService } from './designs.service';

@ApiTags('designs')
@ApiBearerAuth()
@Controller('designs')
@UseGuards(CustomerAuthGuard)
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  list(
    @CurrentCustomer() me: CustomerIdentity,
    @Query(new ZodPipe(DesignsQuerySchema)) query: typeof DesignsQuerySchema._output,
  ) {
    return this.designs.list(me.userId, query);
  }

  @Post()
  create(
    @CurrentCustomer() me: CustomerIdentity,
    @Body(new ZodPipe(CreateDesignInputSchema)) body: typeof CreateDesignInputSchema._output,
  ) {
    return this.designs.create(me.userId, body);
  }

  @Get(':id')
  get(@CurrentCustomer() me: CustomerIdentity, @Param('id') id: string) {
    return this.designs.get(me.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentCustomer() me: CustomerIdentity,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateDesignInputSchema)) body: typeof UpdateDesignInputSchema._output,
  ) {
    return this.designs.update(me.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentCustomer() me: CustomerIdentity, @Param('id') id: string): Promise<void> {
    await this.designs.remove(me.userId, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentCustomer() me: CustomerIdentity, @Param('id') id: string) {
    return this.designs.duplicate(me.userId, id);
  }

  @Post(':id/previews')
  previews(
    @CurrentCustomer() me: CustomerIdentity,
    @Param('id') id: string,
    @Body(new ZodPipe(DesignPreviewsInputSchema)) body: typeof DesignPreviewsInputSchema._output,
  ) {
    return this.designs.setPreviews(me.userId, id, body);
  }
}
