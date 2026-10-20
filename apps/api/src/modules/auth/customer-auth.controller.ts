import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  OAuthInputSchema,
  OtpRequestInputSchema,
  OtpVerifyInputSchema,
  RefreshInputSchema,
  type OAuthInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RefreshInput,
} from '@streetwear/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CustomerAuthService } from './customer-auth.service';

const otpThrottle = {
  default: { limit: () => (process.env.NODE_ENV === 'test' ? 1000 : 10), ttl: 60_000 },
};

@ApiTags('auth')
@Controller('auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Post('otp/request')
  @HttpCode(204)
  @Throttle(otpThrottle)
  async requestOtp(@Body(new ZodPipe(OtpRequestInputSchema)) body: OtpRequestInput): Promise<void> {
    await this.auth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle(otpThrottle)
  verifyOtp(@Body(new ZodPipe(OtpVerifyInputSchema)) body: OtpVerifyInput) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post('oauth/apple')
  @HttpCode(200)
  apple(@Body(new ZodPipe(OAuthInputSchema)) body: OAuthInput) {
    return this.auth.oauthLogin('apple', body.idToken);
  }

  @Post('oauth/google')
  @HttpCode(200)
  google(@Body(new ZodPipe(OAuthInputSchema)) body: OAuthInput) {
    return this.auth.oauthLogin('google', body.idToken);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(RefreshInputSchema)) body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshInputSchema)) body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
