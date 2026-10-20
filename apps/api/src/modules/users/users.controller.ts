import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AddressInputSchema,
  AddressUpdateInputSchema,
  PushTokenInputSchema,
  UpdateMeInputSchema,
  type AddressInput,
  type PushTokenInput,
  type UpdateMeInput,
} from '@streetwear/shared';
import { apiError } from '../../common/api-error';
import { ZodPipe } from '../../common/zod.pipe';
import type { CustomerPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/current.decorators';
import { CustomerAuthGuard } from '../auth/guards';
import { UsersService } from './users.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => apiError(404, 'NOT_FOUND', 'Ressource introuvable.'),
});

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() u: CustomerPrincipal) {
    return this.users.me(u.id);
  }

  @Patch()
  update(
    @CurrentUser() u: CustomerPrincipal,
    @Body(new ZodPipe(UpdateMeInputSchema)) body: UpdateMeInput,
  ) {
    return this.users.updateMe(u.id, body);
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() u: CustomerPrincipal): Promise<void> {
    await this.users.deleteMe(u.id);
  }

  @Get('addresses')
  list(@CurrentUser() u: CustomerPrincipal) {
    return this.users.listAddresses(u.id);
  }

  @Post('addresses')
  create(
    @CurrentUser() u: CustomerPrincipal,
    @Body(new ZodPipe(AddressInputSchema)) body: AddressInput,
  ) {
    return this.users.createAddress(u.id, body);
  }

  @Patch('addresses/:id')
  patch(
    @CurrentUser() u: CustomerPrincipal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(AddressUpdateInputSchema)) body: Partial<AddressInput>,
  ) {
    return this.users.updateAddress(u.id, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  async removeAddress(
    @CurrentUser() u: CustomerPrincipal,
    @Param('id', uuidPipe) id: string,
  ): Promise<void> {
    await this.users.deleteAddress(u.id, id);
  }

  @Post('push-tokens')
  @HttpCode(204)
  async pushToken(
    @CurrentUser() u: CustomerPrincipal,
    @Body(new ZodPipe(PushTokenInputSchema)) body: PushTokenInput,
  ): Promise<void> {
    await this.users.registerPushToken(u.id, body);
  }
}
