import {
  ClanListSchema,
  ClanSchema,
  CreateClanRequestSchema,
  IdSchema,
  UpdateClanRequestSchema,
  type ClanRole,
} from '@ancestors-tree/shared';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { toClan } from '../clans/dto.ts';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { Clan } from '../models/Clan.ts';
import { Membership } from '../models/Membership.ts';

const ClanParamsSchema = z.object({ id: IdSchema });

async function memberCounts(clanIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const counts = await Membership.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { clanId: { $in: clanIds } } },
    { $group: { _id: '$clanId', count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((row) => [row._id.toString(), row.count]));
}

async function loadClan(clanId: string) {
  const clan = await Clan.findById(clanId);
  if (!clan) throw new AppError('NOT_FOUND', 'Clan not found');
  return clan;
}

export function registerClanRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans',
    summary: 'The clans you belong to',
    tags: ['Clans'],
    access: 'signedIn',
    responses: { 200: { description: 'Your clans, by name', schema: ClanListSchema } },
    handler: async ({ userId }) => {
      const memberships = await Membership.find({ userId: userId() });
      const roles = new Map(memberships.map((m) => [m.clanId.toString(), m.role as ClanRole]));
      const clanIds = memberships.map((m) => m.clanId);
      const [clans, counts] = await Promise.all([
        Clan.find({ _id: { $in: clanIds } }),
        memberCounts(clanIds),
      ]);
      const body = clans
        .map((clan) =>
          toClan(
            clan,
            roles.get(clan.id as string) ?? 'viewer',
            counts.get(clan.id as string) ?? 1,
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      return { status: 200, body };
    },
  });

  api.define({
    method: 'post',
    path: '/clans',
    summary: 'Create a clan; you become its owner',
    tags: ['Clans'],
    access: 'signedIn',
    request: { body: CreateClanRequestSchema },
    responses: { 201: { description: 'The new clan', schema: ClanSchema } },
    handler: async ({ userId, body }) => {
      const clan = new Clan({ ...body, ownerId: userId() });
      const membership = new Membership({ clanId: clan._id, userId: userId(), role: 'owner' });
      // Both or neither. connection.transaction() also resets the documents if it retries.
      await mongoose.connection.transaction(async (session) => {
        await clan.save({ session });
        await membership.save({ session });
      });
      return { status: 201, body: toClan(clan, 'owner', 1) };
    },
  });

  api.define({
    method: 'get',
    path: '/clans/:id',
    summary: 'One clan',
    tags: ['Clans'],
    access: { clanRole: 'viewer' },
    request: { params: ClanParamsSchema },
    responses: { 200: { description: 'The clan', schema: ClanSchema } },
    handler: async ({ params, membership }) => {
      const [clan, counts] = await Promise.all([
        loadClan(params.id),
        memberCounts([new Types.ObjectId(params.id)]),
      ]);
      return { status: 200, body: toClan(clan, membership().role, counts.get(params.id) ?? 1) };
    },
  });

  api.define({
    method: 'patch',
    path: '/clans/:id',
    summary: 'Change the clan name, hometown or description',
    tags: ['Clans'],
    access: { clanRole: 'owner' },
    request: { params: ClanParamsSchema, body: UpdateClanRequestSchema },
    responses: { 200: { description: 'The updated clan', schema: ClanSchema } },
    handler: async ({ params, body, membership }) => {
      const clan = await loadClan(params.id);
      clan.set(body);
      await clan.save();
      const counts = await memberCounts([clan._id]);
      return { status: 200, body: toClan(clan, membership().role, counts.get(params.id) ?? 1) };
    },
  });
}
