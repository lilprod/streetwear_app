import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AdminLoginInputSchema,
  AdminTotpInputSchema,
  RefreshInputSchema,
  type RefreshInput,
  type AdminLoginInput,
  type AdminTotpInput,
} from '@streetwear/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { AdminAuthService } from './admin-auth.service';
import { Public } from './roles.decorator';

const loginThrottle = {
  default: { limit: () => (process.env.NODE_ENV === 'test' ? 1000 : 20), ttl: 60_000 },
};

@ApiTags('admin-auth')
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle(loginThrottle)
  login(@Body(new ZodPipe(AdminLoginInputSchema)) body: AdminLoginInput) {
    return this.auth.login(body.email, body.password);
  }

  @Post('totp')
  @HttpCode(200)
  @Throttle(loginThrottle)
  totp(@Body(new ZodPipe(AdminTotpInputSchema)) body: AdminTotpInput) {
    return this.auth.verifyTotp(body.challenge, body.code);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(loginThrottle)
  refresh(@Body(new ZodPipe(RefreshInputSchema)) body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshInputSchema)) body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
