import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AddCartItemInputSchema,
  QuoteInputSchema,
  UpdateCartItemInputSchema,
} from '@streetwear/shared';
import { UuidParam } from '../../common/uuid-param';
import { ZodPipe } from '../../common/zod.pipe';
import type { CustomerPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/current.decorators';
import { CustomerAuthGuard } from '../auth/guards';
import { CartService } from './cart.service';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(CustomerAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() me: CustomerPrincipal) {
    return this.cart.get(me.id);
  }

  @Post('items')
  @HttpCode(200)
  add(
    @CurrentUser() me: CustomerPrincipal,
    @Body(new ZodPipe(AddCartItemInputSchema)) body: typeof AddCartItemInputSchema._output,
  ) {
    return this.cart.add(me.id, body);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() me: CustomerPrincipal,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(UpdateCartItemInputSchema)) body: typeof UpdateCartItemInputSchema._output,
  ) {
    return this.cart.update(me.id, id, body);
  }

  @Delete('items/:id')
  remove(@CurrentUser() me: CustomerPrincipal, @Param('id', UuidParam) id: string) {
    return this.cart.remove(me.id, id);
  }

  @Post('quote')
  @HttpCode(200)
  quote(
    @CurrentUser() me: CustomerPrincipal,
    @Body(new ZodPipe(QuoteInputSchema)) body: typeof QuoteInputSchema._output,
  ) {
    return this.cart.quote(me.id, body.reception);
  }
}
