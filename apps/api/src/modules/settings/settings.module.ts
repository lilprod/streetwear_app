import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.audit.registerLoader('settings', () => this.settings.getAll());
  }
}
