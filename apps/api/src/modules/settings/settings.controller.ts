import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import { Roles } from '../auth/roles.decorator';
import { UpdateSettingsInputSchema } from './settings.schemas';
import { SettingsService } from './settings.service';
import type { SettingValues } from './settings.schemas';

@ApiTags('admin-settings')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.getAll();
  }

  @Patch()
  update(@Body(new ZodPipe(UpdateSettingsInputSchema)) body: Partial<SettingValues>) {
    return this.settings.update(body);
  }
}
