import mongoose, { type ClientSession } from 'mongoose';

/**
 * Every model with a clanId. Deleting a clan deletes their documents too; scoped.test.ts fails
 * when a new clan-scoped model is missing here.
 */
export const CLAN_SCOPED_MODEL_NAMES = [
  'Person',
  'Union',
  'Operation',
  'Invite',
  'ClanRemoval',
  'Membership',
] as const;

export async function deleteClanData(clanId: string, session: ClientSession): Promise<void> {
  // One after another: a session runs one operation at a time.
  for (const name of CLAN_SCOPED_MODEL_NAMES) {
    await mongoose.model(name).deleteMany({ clanId }, { session });
  }
}
