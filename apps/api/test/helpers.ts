import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { seedCatalog } from '../src/catalog/seed';
import type { AdminRole } from '../src/common/auth/auth.types';
import { setupApp } from '../src/setup-app';

export async function buildApp(): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ bufferLogs: true });
  setupApp(app);
  await app.init();
  const prisma = new PrismaClient();
  await seedCatalog(prisma);
  return { app, prisma };
}

export const newUserId = (): string => randomUUID();
export const customerAuth = (userId: string): [string, string] => [
  'Authorization',
  `Bearer test-customer.${userId}`,
];
export const adminAuth = (role: AdminRole): [string, string] => [
  'Authorization',
  `Bearer test-admin.${role}.${randomUUID()}`,
];

export type Method = 'get' | 'post' | 'patch' | 'delete';
export function call(app: INestApplication, method: Method, url: string): request.Test {
  return request(app.getHttpServer())[method](url);
}
