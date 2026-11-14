import { ClanRoleSchema, hasRoleAtLeast, IdSchema, type ClanRole } from '@ancestors-tree/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../http/AppError.ts';
import { getLocals } from '../http/locals.ts';
import { Membership } from '../models/Membership.ts';

/**
 * The `{ clanRole }` access level (spec §3, §12). Runs after requireAuth. The clan comes only
 * from `:id`, never from the request body.
 */
export function createRequireClanRole(minimum: ClanRole): RequestHandler {
  return async (req, res, next) => {
    const locals = getLocals(res);
    if (!locals.userId) throw new Error('requireClanRole must run after requireAuth');
    const clanId = IdSchema.safeParse(req.params.id);
    const membership = clanId.success
      ? await Membership.findOne({ clanId: clanId.data, userId: locals.userId })
      : null;
    // Non-members cannot tell a clan they are not in from one that does not exist.
    if (!clanId.success || !membership) throw new AppError('NOT_FOUND', 'Clan not found');
    const role = ClanRoleSchema.parse(membership.role);
    if (!hasRoleAtLeast(role, minimum)) {
      throw new AppError('FORBIDDEN', `This needs the ${minimum} role in the clan`);
    }
    locals.membership = { clanId: clanId.data, userId: locals.userId, role };
    next();
  };
}

/**
 * For routes that act for the account the client expects (spec §6.1): a tab may still hold
 * another account's unsent changes after a sign-in in another tab, under the shared cookie.
 * Runs after requireAuth and before the clan role, so the mismatch is never hidden behind a
 * 404 or 403 that would make the client drop those changes. A missing or malformed value is
 * left to body validation (400).
 */
export function createRequireExpectedUser(): RequestHandler {
  return (req, res, next) => {
    const locals = getLocals(res);
    if (!locals.userId) throw new Error('requireExpectedUser must run after requireAuth');
    const body: unknown = req.body;
    const expected =
      typeof body === 'object' && body !== null
        ? (body as { expectedUserId?: unknown }).expectedUserId
        : undefined;
    if (IdSchema.safeParse(expected).success && expected !== locals.userId) {
      throw new AppError('IDENTITY_MISMATCH', 'These changes were made with another account');
    }
    next();
  };
}
