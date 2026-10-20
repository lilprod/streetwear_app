import { Global, Module } from '@nestjs/common';
import { ConsoleSmsProvider, SMS_PROVIDER } from './sms.provider';

@Global()
@Module({
  providers: [ConsoleSmsProvider, { provide: SMS_PROVIDER, useExisting: ConsoleSmsProvider }],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
