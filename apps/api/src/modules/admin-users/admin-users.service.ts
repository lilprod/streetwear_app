import { Injectable } from '@nestjs/common';
import { AdminRoleSchema, PageQuerySchema } from '@streetwear/shared';
import type { AdminUser } from '@prisma/client';
import { z } from 'zod';
import { apiError } from '../../common/api-error';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../../common/password';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';

const password = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  )
  .max(200);

export const CreateAdminUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(1).max(100).optional(),
    password,
    role: AdminRoleSchema,
  })
  .strict();
export const UpdateAdminUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).nullable().optional(),
    role: AdminRoleSchema.optional(),
    active: z.boolean().optional(),
    password: password.optional(),
    resetTotp: z.literal(true).optional(),
  })
  .strict();
export const AdminUsersQuerySchema = PageQuerySchema;

export type CreateAdminUserInput = z.infer<typeof CreateAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof UpdateAdminUserSchema>;

export function toAdminUserDto(a: AdminUser) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    active: a.active,
    totpEnabled: a.totpSecret !== null,
    createdAt: a.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(cursor: string | undefined, limit: number) {
    const rows = await this.prisma.adminUser.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toAdminUserDto),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async get(id: string) {
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    return row ? toAdminUserDto(row) : null;
  }

  async create(input: CreateAdminUserInput) {
    const exists = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    if (exists)
      throw apiError(409, 'EMAIL_ALREADY_USED', 'Cette adresse e-mail est déjà utilisée.');
    const row = await this.prisma.adminUser.create({
      data: {
        id: uuidv7(),
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      },
    });
    return toAdminUserDto(row);
  }

  async update(actorId: string, id: string, input: UpdateAdminUserInput) {
    const current = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!current) throw apiError(404, 'NOT_FOUND', 'Ressource introuvable.');
    if (id === actorId && (input.active === false || (input.role && input.role !== current.role))) {
      throw apiError(
        409,
        'CANNOT_MODIFY_SELF',
        'Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.',
      );
    }
    const row = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.active !== undefined && { active: input.active }),
        ...(input.resetTotp && { totpSecret: null }),
        ...(input.password !== undefined && {
          passwordHash: await hashPassword(input.password),
          failedLogins: 0,
          lockedUntil: null,
        }),
      },
    });
    return toAdminUserDto(row);
  }
}
