import {
  AcceptInviteResponseSchema,
  ClanRoleSchema,
  CreateInviteRequestSchema,
  IdSchema,
  InviteListSchema,
  InvitePreviewSchema,
  InviteRoleSchema,
  InviteSchema,
} from '@ancestors-tree/shared';
import mongoose from 'mongoose';
import { z } from 'zod';
import { randomToken } from '../auth/tokens.ts';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { Clan } from '../models/Clan.ts';
import { ClanRemoval } from '../models/ClanRemoval.ts';
import { Invite } from '../models/Invite.ts';
import { Membership } from '../models/Membership.ts';
import { namesOf } from '../users/names.ts';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

const TokenParamsSchema = z.object({ token: z.string().max(100) });

interface InviteRecord {
  id: unknown;
  token: string;
  role: string;
  createdBy: { toString(): string };
  createdAt: Date;
  expiresAt: Date;
}

function toInvite(invite: InviteRecord, names: Map<string, string>) {
  return {
    id: invite.id as string,
    token: invite.token,
    role: InviteRoleSchema.parse(invite.role),
    createdByName: names.get(invite.createdBy.toString()) ?? '',
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/** A usable invite, or INVALID_TOKEN (wrong, revoked or expired: the web shows one message). */
async function findUsableInvite(token: string) {
  const invite = await Invite.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!invite) throw new AppError('INVALID_TOKEN', 'This invite link is wrong, expired or revoked');
  return invite;
}

export function registerInviteRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/invites',
    summary: 'Active invite links of the clan',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema }) },
    responses: { 200: { description: 'Newest first', schema: InviteListSchema } },
    handler: async ({ params }) => {
      const invites = await Invite.find({
        clanId: params.id,
        expiresAt: { $gt: new Date() },
      }).sort({
        createdAt: -1,
      });
      const names = await namesOf(invites.map((invite) => invite.createdBy.toString()));
      return { status: 200, body: invites.map((invite) => toInvite(invite, names)) };
    },
  });

  api.define({
    method: 'post',
    path: '/clans/:id/invites',
    summary: 'Create an invite link (multi-use, 7 days)',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema }), body: CreateInviteRequestSchema },
    responses: { 201: { description: 'The new invite', schema: InviteSchema } },
    handler: async ({ params, body, userId }) => {
      const invite = await Invite.create({
        clanId: params.id,
        token: randomToken(24),
        role: body.role,
        createdBy: userId(),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      return { status: 201, body: toInvite(invite, await namesOf([userId()])) };
    },
  });

  api.define({
    method: 'delete',
    path: '/clans/:id/invites/:inviteId',
    summary: 'Revoke an invite link',
    tags: ['Invites'],
    access: { clanRole: 'owner' },
    request: { params: z.object({ id: IdSchema, inviteId: IdSchema }) },
    responses: { 204: { description: 'Revoked' } },
    handler: async ({ params }) => {
      const result = await Invite.deleteOne({ _id: params.inviteId, clanId: params.id });
      if (result.deletedCount === 0) throw new AppError('NOT_FOUND', 'Invite not found');
      return { status: 204 };
    },
  });

  api.define({
    method: 'get',
    path: '/invites/:token',
    summary: 'What an invite link offers (no sign-in needed)',
    tags: ['Invites'],
    access: 'public',
    request: { params: TokenParamsSchema },
    responses: { 200: { description: 'The clan and role on offer', schema: InvitePreviewSchema } },
    handler: async ({ params }) => {
      const invite = await findUsableInvite(params.token);
      const [clan, names] = await Promise.all([
        Clan.findById(invite.clanId),
        namesOf([invite.createdBy.toString()]),
      ]);
      if (!clan)
        throw new AppError('INVALID_TOKEN', 'This invite link is wrong, expired or revoked');
      return {
        status: 200,
        body: {
          clanName: clan.name,
          role: InviteRoleSchema.parse(invite.role),
          invitedByName: names.get(invite.createdBy.toString()) ?? '',
          expiresAt: invite.expiresAt.toISOString(),
        },
      };
    },
  });

  api.define({
    method: 'post',
    path: '/invites/:token/accept',
    summary: 'Join the clan of an invite link',
    tags: ['Invites'],
    access: 'signedIn',
    request: { params: TokenParamsSchema },
    responses: { 200: { description: 'Your membership', schema: AcceptInviteResponseSchema } },
    handler: async ({ params, userId }) => {
      const invite = await findUsableInvite(params.token);
      const clanId = invite.clanId.toString();
      try {
        const body = await mongoose.connection.transaction(async (session) => {
          const existing = await Membership.findOne({ clanId, userId: userId() }, null, {
            session,
          });
          if (existing) {
            // Never change an existing member's role through a link.
            return { clanId, role: ClanRoleSchema.parse(existing.role), alreadyMember: true };
          }
          // Removed by the owner after this link was made: only a newer link lets them back in.
          const removal = await ClanRemoval.findOne({ clanId, userId: userId() }, null, {
            session,
          });
          if (removal && removal.removedAt >= invite.createdAt) {
            throw new AppError(
              'FORBIDDEN',
              'You were removed from this clan. Ask the owner for a new link',
            );
          }
          // Writing the clan document makes this transaction conflict with a delete of the same
          // clan: one of them retries and then sees the other's result, so a membership is
          // never left behind for a deleted clan.
          const touched = await Clan.updateOne(
            { _id: clanId },
            { $currentDate: { updatedAt: true } },
            { session, timestamps: false },
          );
          if (touched.matchedCount === 0) {
            throw new AppError('INVALID_TOKEN', 'This invite link is wrong, expired or revoked');
          }
          await Membership.create([{ clanId, userId: userId(), role: invite.role }], { session });
          if (removal) await ClanRemoval.deleteOne({ _id: removal._id }, { session });
          return { clanId, role: InviteRoleSchema.parse(invite.role), alreadyMember: false };
        });
        return { status: 200, body };
      } catch (error) {
        // The same person accepted twice at the same moment: the unique index keeps one. A
        // duplicate key aborts the transaction, so the stored row is read outside it.
        if ((error as { code?: unknown }).code !== DUPLICATE_KEY) throw error;
        const stored = await Membership.findOne({ clanId, userId: userId() });
        if (!stored) throw error;
        return {
          status: 200,
          body: { clanId, role: ClanRoleSchema.parse(stored.role), alreadyMember: true },
        };
      }
    },
  });
}
