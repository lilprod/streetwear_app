import { Global, Module } from '@nestjs/common';
import { StockModule } from '../modules/stock/stock.module';
import { StockService } from '../modules/stock/stock.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PricingRulesService } from './pricing-rules.service';
import { STOCK_READER } from './stock-reader';

@Global()
@Module({
  imports: [StockModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PricingRulesService,
    { provide: STOCK_READER, useExisting: StockService },
  ],
  exports: [CatalogService, PricingRulesService, STOCK_READER],
})
export class CatalogModule {}
