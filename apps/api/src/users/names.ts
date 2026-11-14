import { User } from '../models/User.ts';

/** Display names by user id; the ids of deleted accounts are missing from the map. */
export async function namesOf(userIds: readonly string[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: [...new Set(userIds)] } });
  return new Map(users.map((user) => [user.id as string, user.name]));
}
