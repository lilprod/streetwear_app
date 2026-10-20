import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValues,
} from './settings.schemas';

const TTL_MS = 60_000;

@Injectable()
export class SettingsService {
  private readonly cache = new Map<SettingKey, { value: unknown; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as SettingValues[K];
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const parsed = row ? SETTING_SCHEMAS[key].safeParse(row.value) : null;
    const value = parsed?.success ? parsed.data : SETTING_DEFAULTS[key];
    this.cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value as SettingValues[K];
  }

  async getAll(): Promise<SettingValues> {
    const entries = await Promise.all(SETTING_KEYS.map(async (k) => [k, await this.get(k)]));
    return Object.fromEntries(entries) as unknown as SettingValues;
  }

  async update(patch: Partial<SettingValues>): Promise<SettingValues> {
    const keys = (Object.keys(patch) as SettingKey[]).filter((k) => patch[k] !== undefined);
    await this.prisma.$transaction(
      keys.map((key) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: patch[key] as never },
          update: { value: patch[key] as never },
        }),
      ),
    );
    this.clearCache();
    return this.getAll();
  }

  clearCache(): void {
    this.cache.clear();
  }
}
