import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({ controllers: [AdminUsersController], providers: [AdminUsersService] })
export class AdminUsersModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly users: AdminUsersService,
  ) {}

  onModuleInit(): void {
    this.audit.registerLoader('users', (id) => (id ? this.users.get(id) : Promise.resolve(null)));
  }
}
