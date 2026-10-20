import { Global, Module } from '@nestjs/common';
import { AUTH_VERIFIER } from './auth.types';
import { AdminAuthGuard, CustomerAuthGuard } from './guards';
import { TestAuthVerifier } from './test-auth.verifier';

/** SP02 remplace le fournisseur AUTH_VERIFIER par la vérification JWT réelle. */
@Global()
@Module({
  providers: [
    { provide: AUTH_VERIFIER, useClass: TestAuthVerifier },
    CustomerAuthGuard,
    AdminAuthGuard,
  ],
  exports: [AUTH_VERIFIER, CustomerAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
