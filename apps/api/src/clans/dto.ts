import type { ClanRole } from '@ancestors-tree/shared';
import type { ClanDocument } from '../models/Clan.ts';

export function toClan(clan: ClanDocument, role: ClanRole, memberCount: number) {
  return {
    id: clan.id as string,
    name: clan.name,
    hometown: clan.hometown,
    description: clan.description,
    role,
    memberCount,
    createdAt: clan.createdAt.toISOString(),
  };
}
