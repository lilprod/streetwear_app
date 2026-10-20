import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { AdminAuthGuard, CustomerAuthGuard } from './guards';
import { JoseOAuthVerifier, OAUTH_VERIFIER } from './oauth.verifier';
import { TokensService } from './tokens.service';

@Global()
@Module({
  controllers: [CustomerAuthController, AdminAuthController],
  providers: [
    TokensService,
    CustomerAuthService,
    AdminAuthService,
    CustomerAuthGuard,
    AdminAuthGuard,
    JoseOAuthVerifier,
    { provide: OAUTH_VERIFIER, useExisting: JoseOAuthVerifier },
  ],
  exports: [TokensService, CustomerAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
