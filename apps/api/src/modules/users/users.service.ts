import { Inject, Injectable } from '@nestjs/common';
import type { Address as DbAddress } from '@prisma/client';
import type { Address, AddressInput, PushTokenInput, UpdateMeInput } from '@streetwear/shared';
import { apiError } from '../../common/api-error';
import { sha256 } from '../../common/crypto';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { TokensService } from '../auth/tokens.service';
import { toUserDto } from './user.mapper';
import { ZONE_RESOLVER, type ZoneResolver } from './zone-resolver';

const notFound = (): Error => apiError(404, 'NOT_FOUND', 'Ressource introuvable.');

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    @Inject(ZONE_RESOLVER) private readonly zones: ZoneResolver,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw notFound();
    return toUserDto(user);
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
      },
    });
    return toUserDto(user);
  }

  async deleteMe(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          phone: `deleted:${sha256(`${user.phone ?? user.id}:${user.id}`)}`,
          name: null,
          email: null,
          appleSub: null,
          googleSub: null,
          deletedAt: new Date(),
        },
      }),
      this.prisma.address.deleteMany({ where: { userId } }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
    ]);
    await this.tokens.revokeAllForUser(userId);
  }

  private async toAddress(a: DbAddress): Promise<Address> {
    return {
      id: a.id,
      label: a.label,
      lat: a.lat,
      lng: a.lng,
      district: a.district,
      landmark: a.landmark,
      recipientPhone: a.recipientPhone,
      zone: a.zoneId ? await this.zones.summarize(a.zoneId) : null,
    };
  }

  async listAddresses(userId: string): Promise<Address[]> {
    const rows = await this.prisma.address.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    return Promise.all(rows.map((r) => this.toAddress(r)));
  }

  async createAddress(userId: string, input: AddressInput): Promise<Address> {
    const zone = await this.zones.resolve(input.lat, input.lng);
    const row = await this.prisma.address.create({
      data: { id: uuidv7(), userId, ...input, zoneId: zone?.id ?? null },
    });
    return this.toAddress(row);
  }

  async updateAddress(userId: string, id: string, input: Partial<AddressInput>): Promise<Address> {
    const current = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!current) throw notFound();
    const moved = input.lat !== undefined || input.lng !== undefined;
    const zone = moved
      ? await this.zones.resolve(input.lat ?? current.lat, input.lng ?? current.lng)
      : undefined;
    const row = await this.prisma.address.update({
      where: { id },
      data: { ...input, ...(zone !== undefined && { zoneId: zone?.id ?? null }) },
    });
    return this.toAddress(row);
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound();
  }

  async registerPushToken(userId: string, input: PushTokenInput): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { id: uuidv7(), userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform },
    });
  }
}
