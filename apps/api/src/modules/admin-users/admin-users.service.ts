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

const phone = z.string().regex(/^\+228\d{8}$/, 'Numéro attendu au format +228XXXXXXXX.');
const phoneRequired = (v: { role: string; phone?: string }, ctx: z.RefinementCtx): void => {
  if (v.role === 'courier' && !v.phone) {
    ctx.addIssue({
      code: 'custom',
      path: ['phone'],
      message: 'Le téléphone est obligatoire pour un livreur.',
    });
  }
};

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
    phone: phone.optional(),
  })
  .strict()
  .superRefine(phoneRequired);
export const UpdateAdminUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).nullable().optional(),
    role: AdminRoleSchema.optional(),
    active: z.boolean().optional(),
    password: password.optional(),
    resetTotp: z.literal(true).optional(),
    phone: phone.optional(),
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
    const passwordHash = await hashPassword(input.password);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          id: uuidv7(),
          email: input.email,
          name: input.name ?? null,
          role: input.role,
          passwordHash,
        },
      });
      if (input.role === 'courier' && input.phone) {
        await tx.courier.create({
          data: { id: uuidv7(), adminUserId: created.id, phone: input.phone },
        });
      }
      return created;
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
    const profile = await this.prisma.courier.findUnique({ where: { adminUserId: id } });
    const role = input.role ?? current.role;
    if (role === 'courier' && !input.phone && !profile) {
      throw apiError(400, 'VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
        formErrors: [],
        fieldErrors: { phone: ['Le téléphone est obligatoire pour un livreur.'] },
      });
    }
    const passwordHash = input.password !== undefined ? await hashPassword(input.password) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.role !== undefined && { role: input.role }),
          ...(input.active !== undefined && { active: input.active }),
          ...(input.resetTotp && { totpSecret: null }),
          ...(passwordHash !== null && { passwordHash, failedLogins: 0, lockedUntil: null }),
        },
      });
      if (role === 'courier') {
        const phoneValue = input.phone ?? profile?.phone ?? '';
        await tx.courier.upsert({
          where: { adminUserId: id },
          create: { id: uuidv7(), adminUserId: id, phone: phoneValue, active: updated.active },
          update: { phone: phoneValue, active: updated.active },
        });
      } else if (profile) {
        await tx.courier.update({ where: { adminUserId: id }, data: { active: false } });
      }
      return updated;
    });
    return toAdminUserDto(row);
  }
}
