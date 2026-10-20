import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiError } from '../../common/api-error';
import { ZodPipe } from '../../common/zod.pipe';
import type { AdminPrincipal } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current.decorators';
import { Roles } from '../auth/roles.decorator';
import {
  AdminUsersQuerySchema,
  AdminUsersService,
  CreateAdminUserSchema,
  UpdateAdminUserSchema,
  type CreateAdminUserInput,
  type UpdateAdminUserInput,
} from './admin-users.service';
import type { z } from 'zod';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => apiError(404, 'NOT_FOUND', 'Ressource introuvable.'),
});

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query(new ZodPipe(AdminUsersQuerySchema)) q: z.infer<typeof AdminUsersQuerySchema>) {
    return this.users.list(q.cursor, q.limit);
  }

  @Post()
  create(@Body(new ZodPipe(CreateAdminUserSchema)) body: CreateAdminUserInput) {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(UpdateAdminUserSchema)) body: UpdateAdminUserInput,
  ) {
    return this.users.update(admin.id, id, body);
  }
}
