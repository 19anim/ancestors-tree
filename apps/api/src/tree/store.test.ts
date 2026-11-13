import {
  applyOp,
  EMPTY_TREE,
  newObjectId,
  type Op,
  type Person,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Clan } from '../models/Clan.ts';
import { PersonModel } from '../models/Person.ts';
import { UnionModel } from '../models/Union.ts';
import { useTestDatabase } from '../test/database.ts';
import { diffRecords, findClan, loadTreeState, saveTreeChanges } from './store.ts';

useTestDatabase();

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: newObjectId(),
    fullName: 'Nguyễn Văn Tư',
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

async function newClan() {
  return Clan.create({ name: 'Họ Nguyễn', ownerId: new Types.ObjectId() });
}

function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(fn);
}

/** Applies ops one after another to a tree. */
function applyAll(tree: TreeState, ops: Op[]): TreeState {
  return ops.reduce((current, op) => applyOp(current, op).tree, tree);
}

describe('Clan tree fields', () => {
  it('start at version 0 without a progenitor', async () => {
    const clan = await newClan();
    expect(clan.version).toBe(0);
    expect(clan.progenitorId).toBeNull();
  });
});

describe('diffRecords', () => {
  it('finds changed objects by reference and removed ids', () => {
    const a = { n: 1 };
    const b = { n: 2 };
    expect(diffRecords({ a, b }, { a, b: { n: 2 }, c: { n: 3 } })).toEqual({
      changed: [{ n: 2 }, { n: 3 }],
      removed: [],
    });
    expect(diffRecords({ a, b }, { a })).toEqual({ changed: [], removed: ['b'] });
  });
});

describe('tree store', () => {
  it('saves a tree and loads it back exactly', async () => {
    const clan = await newClan();
    const father = person({
      birth: { source: 'lunar', lunar: { day: 15, month: 10, year: 1931, isLeap: false } },
      death: { isDeceased: true, date: { source: 'approx', approxYear: 1990 } },
      branch: 'Chi trưởng',
      birthFamily: { surname: 'Nguyễn', hometown: 'Nam Định' },
      bio: 'Trưởng họ',
      burialPlace: 'Nghĩa trang làng',
      aliases: ['Cụ Tư'],
    });
    const unionId = newObjectId();
    const child = person({ fullName: 'Nguyễn Văn Năm', siblingOrder: 1 });
    const after = applyAll(EMPTY_TREE, [
      { type: 'addPerson', payload: father },
      {
        type: 'addUnion',
        payload: { id: unionId, partnerIds: [father.id], order: 1, status: 'married' },
      },
      { type: 'addPerson', payload: { ...child, parentUnionId: unionId } },
      { type: 'setProgenitor', payload: { personId: father.id } },
    ]);

    await inTransaction((session) =>
      saveTreeChanges(clan.id as string, EMPTY_TREE, after, session),
    );
    clan.progenitorId = new Types.ObjectId(father.id);
    await clan.save();

    const loaded = await inTransaction(async (session) =>
      loadTreeState(await findClan(clan.id as string, session), session),
    );
    expect(loaded).toEqual(after);
  });

  it('updates, clears and deletes only what changed', async () => {
    const clan = await newClan();
    const kept = person({ fullName: 'Người giữ nguyên' });
    const edited = person({ bio: 'Sẽ bị xoá' });
    const removed = person();
    const first = applyAll(EMPTY_TREE, [
      { type: 'addPerson', payload: kept },
      { type: 'addPerson', payload: edited },
      { type: 'addPerson', payload: removed },
    ]);
    await inTransaction((session) =>
      saveTreeChanges(clan.id as string, EMPTY_TREE, first, session),
    );
    const keptBefore = await PersonModel.findById(kept.id).lean();

    const second = applyAll(first, [
      {
        type: 'updatePerson',
        payload: { id: edited.id, changes: { bio: null, fullName: 'Đã sửa' } },
      },
      { type: 'deletePerson', payload: { id: removed.id } },
    ]);
    await inTransaction((session) => saveTreeChanges(clan.id as string, first, second, session));

    expect(await PersonModel.countDocuments()).toBe(2);
    const editedDoc = await PersonModel.findById(edited.id).lean();
    expect(editedDoc?.fullName).toBe('Đã sửa');
    expect(editedDoc && 'bio' in editedDoc).toBe(false);
    // The untouched document was not written again.
    expect((await PersonModel.findById(kept.id).lean())?.updatedAt).toEqual(keptBefore?.updatedAt);
  });

  it('loads only the people and unions of the requested family tree', async () => {
    const mine = await newClan();
    const other = await newClan();
    const stranger = person();
    const tree = applyAll(EMPTY_TREE, [
      { type: 'addPerson', payload: stranger },
      {
        type: 'addUnion',
        payload: { id: newObjectId(), partnerIds: [stranger.id], order: 1, status: 'married' },
      },
    ]);
    await inTransaction((session) =>
      saveTreeChanges(other.id as string, EMPTY_TREE, tree, session),
    );

    const loaded = await inTransaction((session) => loadTreeState(mine, session));
    expect(loaded).toEqual(EMPTY_TREE);
    expect(await UnionModel.countDocuments({ clanId: other._id })).toBe(1);
  });

  it('says NOT_FOUND for a missing family tree', async () => {
    await expect(
      inTransaction((session) => findClan(new Types.ObjectId().toString(), session)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
