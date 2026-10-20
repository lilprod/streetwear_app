import { Global, Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PricingRulesService } from './pricing-rules.service';
import { AllAvailableStockReader, STOCK_READER } from './stock-reader';

/** SP04 remplace le fournisseur STOCK_READER par la lecture du stock réel. */
@Global()
@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PricingRulesService,
    { provide: STOCK_READER, useClass: AllAvailableStockReader },
  ],
  exports: [CatalogService, PricingRulesService, STOCK_READER],
})
export class CatalogModule {}
