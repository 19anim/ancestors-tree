import type { ClanRole } from '@ancestors-tree/shared';
import type { Response } from 'express';

export interface ClanMembership {
  clanId: string;
  userId: string;
  role: ClanRole;
}

/** What access middleware stores on res.locals for the route handler. */
export interface RequestLocals {
  userId?: string;
  membership?: ClanMembership;
}

export function getLocals(res: Response): RequestLocals {
  return res.locals as RequestLocals;
}
