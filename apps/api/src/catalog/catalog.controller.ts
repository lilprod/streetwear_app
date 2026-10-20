import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AvailabilityQuerySchema, PatternsQuerySchema } from '@streetwear/shared';
import { HttpCache, HttpCacheInterceptor } from '../common/http-cache';
import { ZodPipe } from '../common/zod.pipe';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
@UseInterceptors(HttpCacheInterceptor)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @HttpCache(300)
  categories() {
    return this.catalog.categories();
  }

  @Get('patterns')
  @HttpCache(300)
  patterns(@Query(new ZodPipe(PatternsQuerySchema)) query: typeof PatternsQuerySchema._output) {
    return this.catalog.patterns(query);
  }

  @Get('patterns/:id')
  @HttpCache(300)
  pattern(@Param('id') id: string) {
    return this.catalog.pattern(id);
  }

  @Get('colors')
  @HttpCache(300)
  colors() {
    return this.catalog.colors();
  }

  @Get('fonts')
  @HttpCache(300)
  fonts() {
    return this.catalog.fonts();
  }

  @Get('pricing')
  @HttpCache(300)
  pricing() {
    return this.catalog.pricingRules();
  }

  @Get('availability')
  @HttpCache(30)
  availability(
    @Query(new ZodPipe(AvailabilityQuerySchema)) query: typeof AvailabilityQuerySchema._output,
  ) {
    return this.catalog.availability(query.colorId);
  }
}
