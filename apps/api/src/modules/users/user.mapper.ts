import type { User as DbUser } from '@prisma/client';

export interface UserDto {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  createdAt: string;
}

export function toUserDto(u: DbUser): UserDto {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
  };
}
