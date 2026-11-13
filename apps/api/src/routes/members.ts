import {
  ClanRoleSchema,
  hasRoleAtLeast,
  IdSchema,
  MemberListSchema,
  MemberSchema,
  UpdateMemberRequestSchema,
  type ClanRole,
} from '@ancestors-tree/shared';
import { z } from 'zod';
import { AppError } from '../http/AppError.ts';
import type { ClanMembership } from '../http/locals.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { ClanRemoval } from '../models/ClanRemoval.ts';
import { Membership } from '../models/Membership.ts';
import { User } from '../models/User.ts';

const MemberParamsSchema = z.object({ id: IdSchema, userId: IdSchema });
const ROLE_ORDER: Record<ClanRole, number> = { owner: 0, editor: 1, viewer: 2 };

interface MemberRow {
  userId: string;
  role: ClanRole;
  joinedAt: Date;
}

async function describeMembers(rows: MemberRow[], caller: ClanMembership) {
  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } });
  const byId = new Map(users.map((user) => [user.id as string, user]));
  const isOwner = caller.role === 'owner';
  return rows
    .map((row) => {
      const user = byId.get(row.userId);
      const isYou = row.userId === caller.userId;
      return {
        userId: row.userId,
        name: user?.name ?? '',
        // Emails are personal: only the owner sees them, and everyone sees their own (spec §3).
        ...(isOwner || isYou ? { email: user?.email ?? '' } : {}),
        role: row.role,
        joinedAt: row.joinedAt.toISOString(),
        isYou,
      };
    })
    .sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt),
    );
}

function toRow(membership: {
  userId: { toString(): string };
  role: string;
  createdAt: Date;
}): MemberRow {
  return {
    userId: membership.userId.toString(),
    role: ClanRoleSchema.parse(membership.role),
    joinedAt: membership.createdAt,
  };
}

export function registerMemberRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/members',
    summary: 'Members of the clan',
    tags: ['Members'],
    access: { clanRole: 'viewer' },
    request: { params: z.object({ id: IdSchema }) },
    responses: {
      200: { description: 'Owner first, then editors, then viewers', schema: MemberListSchema },
    },
    handler: async ({ params, membership }) => {
      const memberships = await Membership.find({ clanId: params.id });
      return { status: 200, body: await describeMembers(memberships.map(toRow), membership()) };
    },
  });

  api.define({
    method: 'patch',
    path: '/clans/:id/members/:userId',
    summary: 'Change a member’s role (editor or viewer)',
    tags: ['Members'],
    access: { clanRole: 'owner' },
    request: { params: MemberParamsSchema, body: UpdateMemberRequestSchema },
    responses: { 200: { description: 'The member with the new role', schema: MemberSchema } },
    handler: async ({ params, body, membership }) => {
      if (params.userId === membership().userId) {
        throw new AppError('FORBIDDEN', 'The owner’s role cannot change');
      }
      // One atomic write: a member who left in the meantime is a 404, not a 500.
      const target = await Membership.findOneAndUpdate(
        { clanId: params.id, userId: params.userId },
        { role: body.role },
        { returnDocument: 'after' },
      );
      if (!target) throw new AppError('NOT_FOUND', 'This person is not a member of the clan');
      const [member] = await describeMembers([toRow(target)], membership());
      if (!member) throw new Error('Member disappeared while updating');
      return { status: 200, body: member };
    },
  });

  api.define({
    method: 'delete',
    path: '/clans/:id/members/:userId',
    summary: 'Leave the clan, or (owner) remove a member',
    tags: ['Members'],
    access: { clanRole: 'viewer' },
    request: { params: MemberParamsSchema },
    responses: { 204: { description: 'Removed' } },
    handler: async ({ params, membership }) => {
      const caller = membership();
      const leaving = params.userId === caller.userId;
      if (leaving && caller.role === 'owner') {
        throw new AppError('FORBIDDEN', 'The owner cannot leave the clan');
      }
      if (!leaving && !hasRoleAtLeast(caller.role, 'owner')) {
        throw new AppError('FORBIDDEN', 'Only the owner can remove members');
      }
      const filter = { clanId: params.id, userId: params.userId };
      if (!(await Membership.exists(filter))) {
        throw new AppError('NOT_FOUND', 'This person is not a member of the clan');
      }
      if (!leaving) {
        // Recorded before the membership goes, so an invite accepted in between is refused.
        // Old invite links must not let them straight back in (see invite accept).
        await ClanRemoval.updateOne(filter, { $set: { removedAt: new Date() } }, { upsert: true });
      }
      await Membership.deleteOne(filter);
      return { status: 204 };
    },
  });
}
