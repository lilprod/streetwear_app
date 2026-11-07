import { Module } from '@nestjs/common';
import { DesignsModule } from '../../designs/designs.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { StockModule } from '../stock/stock.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [DesignsModule, StockModule, DeliveryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
