import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import { Roles } from '../auth/roles.decorator';
import {
  NotificationTemplatesService,
  UpdateTemplateInputSchema,
  type UpdateTemplateInput,
} from './notification-templates.service';

@ApiTags('admin-notification-templates')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/notification-templates')
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Patch()
  update(@Body(new ZodPipe(UpdateTemplateInputSchema)) body: UpdateTemplateInput) {
    return this.templates.update(body);
  }
}
