import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { Types, type ClientSession } from 'mongoose';
import { AppError } from '../http/AppError.ts';
import { Clan, type ClanDocument } from '../models/Clan.ts';
import { PersonModel } from '../models/Person.ts';
import { UnionModel } from '../models/Union.ts';
import {
  personWrite,
  toPerson,
  toUnion,
  unionWrite,
  type PersonRecord,
  type UnionRecord,
} from './dto.ts';

export async function findClan(clanId: string, session: ClientSession): Promise<ClanDocument> {
  const clan = await Clan.findById(clanId).session(session);
  if (!clan) throw new AppError('NOT_FOUND', 'Family tree not found');
  return clan;
}

/** The whole tree of a clan. Call inside the transaction that also read the clan's version. */
export async function loadTreeState(
  clan: ClanDocument,
  session: ClientSession,
): Promise<TreeState> {
  // One after another: a session runs one operation at a time.
  const persons = await PersonModel.find({ clanId: clan._id })
    .sort({ _id: 1 })
    .session(session)
    .lean<PersonRecord[]>();
  const unions = await UnionModel.find({ clanId: clan._id })
    .sort({ _id: 1 })
    .session(session)
    .lean<UnionRecord[]>();
  return treeStateFromLists(
    clan.progenitorId ? clan.progenitorId.toString() : null,
    persons.map(toPerson),
    unions.map(toUnion),
  );
}

/** What applyOp changed: new or replaced objects (by reference) and removed ids. */
export function diffRecords<T>(
  before: Readonly<Record<string, T>>,
  after: Readonly<Record<string, T>>,
): { changed: T[]; removed: string[] } {
  const changed: T[] = [];
  for (const [id, value] of Object.entries(after)) {
    if (before[id] !== value) changed.push(value);
  }
  const removed = Object.keys(before).filter((id) => !Object.hasOwn(after, id));
  return { changed, removed };
}

/** Writes the documents that differ between two trees. The progenitor lives on the Clan. */
export async function saveTreeChanges(
  clanId: string,
  before: TreeState,
  after: TreeState,
  session: ClientSession,
): Promise<void> {
  const clan = new Types.ObjectId(clanId);
  const persons = diffRecords(before.persons, after.persons);
  const unions = diffRecords(before.unions, after.unions);
  if (persons.removed.length > 0) {
    await PersonModel.deleteMany({ clanId: clan, _id: { $in: persons.removed } }, { session });
  }
  if (unions.removed.length > 0) {
    await UnionModel.deleteMany({ clanId: clan, _id: { $in: unions.removed } }, { session });
  }
  if (persons.changed.length > 0) {
    await PersonModel.bulkWrite<Record<string, unknown>>(
      persons.changed.map((person) => personWrite(clan, person)),
      { session },
    );
  }
  if (unions.changed.length > 0) {
    await UnionModel.bulkWrite<Record<string, unknown>>(
      unions.changed.map((union) => unionWrite(clan, union)),
      { session },
    );
  }
}
