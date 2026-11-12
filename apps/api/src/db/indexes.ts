import { Clan } from '../models/Clan.ts';
import { ClanRemoval } from '../models/ClanRemoval.ts';
import { Invite } from '../models/Invite.ts';
import { Membership } from '../models/Membership.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';

/** Every model: add new ones here, or their unique and TTL indexes are never awaited at boot. */
export const MODELS = [User, Session, PasswordReset, Clan, Membership, Invite, ClanRemoval];

/**
 * Mongoose builds indexes in the background and swallows failures. The race handlers rely on the
 * unique indexes, so startup waits for them and fails when one cannot be built.
 */
export async function ensureIndexes(): Promise<void> {
  await Promise.all(MODELS.map((model) => model.init()));
}
