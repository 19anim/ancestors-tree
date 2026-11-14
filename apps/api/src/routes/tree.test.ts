import { OPS_PAGE_SIZE } from '@ancestors-tree/shared';
import { newObjectId, type Op, type Person, type SingleOp } from '@ancestors-tree/shared/tree';
import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Clan } from '../models/Clan.ts';
import { OperationModel } from '../models/Operation.ts';
import { PersonModel } from '../models/Person.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

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

const addPerson = (payload: Person): SingleOp => ({ type: 'addPerson', payload });

type Member = Awaited<ReturnType<typeof signUp>>;

/** Posts an op as this member, for the account the member is signed in with. */
function submit(
  member: Member,
  clanId: string,
  op: Op,
  baseVersion: number,
  extra: Record<string, unknown> = {},
) {
  return member.agent
    .post(`/api/clans/${clanId}/ops`)
    .send({ op, baseVersion, expectedUserId: member.user.id, ...extra });
}

/** An owner with a new family tree, plus an editor and a viewer of it. */
async function setup() {
  const owner = await signUp(app);
  const editor = await signUp(app);
  const viewer = await signUp(app);
  const clan = await createClan(owner.agent);
  await addMember(clan.id, editor.user.id, 'editor');
  await addMember(clan.id, viewer.user.id, 'viewer');
  return { owner, editor, viewer, clanId: clan.id };
}

describe('GET /api/clans/:id/tree', () => {
  it('starts empty at version 0', async () => {
    const { viewer, clanId } = await setup();
    const response = await viewer.agent.get(`/api/clans/${clanId}/tree`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: 0, progenitorId: null, persons: [], unions: [] });
  });

  it('is for members only', async () => {
    const { clanId } = await setup();
    const stranger = await signUp(app);
    expect((await stranger.agent.get(`/api/clans/${clanId}/tree`)).status).toBe(404);
    expect((await request(app).get(`/api/clans/${clanId}/tree`)).status).toBe(401);
  });
});

describe('POST /api/clans/:id/ops', () => {
  it('answers 404, like other clan routes, to a malformed clan id', async () => {
    const { editor } = await setup();
    expect((await submit(editor, 'not-an-id', addPerson(person()), 0)).status).toBe(404);
    expect((await editor.agent.get('/api/clans/not-an-id/tree')).status).toBe(404);
    expect((await editor.agent.get('/api/clans/not-an-id/ops')).status).toBe(404);
  });

  it('treats a family tree saved before versions existed as version 0', async () => {
    const { editor, clanId } = await setup();
    await Clan.collection.updateOne(
      { _id: new Types.ObjectId(clanId) },
      { $unset: { version: '' } },
    );
    expect((await editor.agent.get(`/api/clans/${clanId}/tree`)).body.version).toBe(0);
    expect((await submit(editor, clanId, addPerson(person()), 0)).body).toEqual({ seq: 1 });
    expect((await Clan.findById(clanId))?.version).toBe(1);
  });

  it('saves an op, bumps the version and logs the op with its inverse', async () => {
    const { editor, viewer, clanId } = await setup();
    const tu = person();
    const response = await submit(editor, clanId, addPerson(tu), 0);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ seq: 1 });

    const tree = await viewer.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body).toEqual({ version: 1, progenitorId: null, persons: [tu], unions: [] });
    const logged = await OperationModel.findOne({ clanId }).lean();
    expect(logged).toMatchObject({
      seq: 1,
      type: 'addPerson',
      payload: tu,
      inverse: { type: 'deletePerson', payload: { id: tu.id } },
    });
    expect(logged?.userId.toString()).toBe(editor.user.id);
  });

  it('saves a batch as one change', async () => {
    const { editor, clanId } = await setup();
    const husband = person();
    const wife = person({ fullName: 'Lê Thị Hoa', gender: 'female' });
    const unionId = newObjectId();
    const batch: Op = {
      type: 'batch',
      payload: {
        ops: [
          addPerson(husband),
          addPerson(wife),
          {
            type: 'addUnion',
            payload: {
              id: unionId,
              partnerIds: [husband.id, wife.id],
              order: 1,
              status: 'married',
            },
          },
        ],
      },
    };
    expect((await submit(editor, clanId, batch, 0)).body).toEqual({ seq: 1 });
    const tree = await editor.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.version).toBe(1);
    expect(tree.body.persons).toHaveLength(2);
    expect(tree.body.unions).toEqual([
      { id: unionId, partnerIds: [husband.id, wife.id], order: 1, status: 'married' },
    ]);
  });

  it('updates and clears fields and deletes people', async () => {
    const { editor, clanId } = await setup();
    const tu = person({ bio: 'Trưởng họ' });
    await submit(editor, clanId, addPerson(tu), 0);
    const update: Op = {
      type: 'updatePerson',
      payload: { id: tu.id, changes: { bio: null, fullName: 'Nguyễn Văn Tư (Cụ)' } },
    };
    expect((await submit(editor, clanId, update, 1)).status).toBe(200);
    const tree = await editor.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.persons).toEqual([{ ...person(), id: tu.id, fullName: 'Nguyễn Văn Tư (Cụ)' }]);

    const remove: Op = { type: 'deletePerson', payload: { id: tu.id } };
    expect((await submit(editor, clanId, remove, 2)).status).toBe(200);
    expect(await PersonModel.countDocuments({ clanId })).toBe(0);
  });

  it('answers 409 to a stale base version and changes nothing', async () => {
    const { editor, clanId } = await setup();
    await submit(editor, clanId, addPerson(person()), 0);
    const stale = await submit(editor, clanId, addPerson(person()), 0);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await PersonModel.countDocuments({ clanId })).toBe(1);
    expect((await Clan.findById(clanId))?.version).toBe(1);
  });

  it('lets only one of two simultaneous writers win', async () => {
    const { editor, owner, clanId } = await setup();
    const responses = await Promise.all([
      submit(editor, clanId, addPerson(person()), 0),
      submit(owner, clanId, addPerson(person()), 0),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await PersonModel.countDocuments({ clanId })).toBe(1);
    expect(await OperationModel.countDocuments({ clanId })).toBe(1);
  });

  it('answers 422 with the reason when a rule is broken, and changes nothing', async () => {
    const { owner, clanId } = await setup();
    const father = person();
    const unionId = newObjectId();
    const family: Op = {
      type: 'batch',
      payload: {
        ops: [
          addPerson(father),
          {
            type: 'addUnion',
            payload: { id: unionId, partnerIds: [father.id], order: 1, status: 'married' },
          },
          addPerson(person({ parentUnionId: unionId })),
        ],
      },
    };
    await submit(owner, clanId, family, 0);
    const response = await submit(
      owner,
      clanId,
      { type: 'deletePerson', payload: { id: father.id } },
      1,
    );
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'RULE_VIOLATION',
      reason: 'PERSON_HAS_CHILDREN',
    });
    expect((await Clan.findById(clanId))?.version).toBe(1);
    expect(await PersonModel.countDocuments({ clanId })).toBe(2);
  });

  it('refuses an id that another family tree already uses', async () => {
    const { editor, clanId } = await setup();
    const other = await signUp(app);
    const otherClan = await createClan(other.agent, { name: 'Họ Trần' });
    const shared = person();
    expect((await submit(other, otherClan.id, addPerson(shared), 0)).status).toBe(200);

    const response = await submit(editor, clanId, addPerson(shared), 0);
    expect(response.status).toBe(422);
    expect(response.body.error.reason).toBe('DUPLICATE_ID');
    expect((await Clan.findById(clanId))?.version).toBe(0);
  });

  it('rejects a malformed op with 400', async () => {
    const { editor, clanId } = await setup();
    const response = await submit(editor, clanId, addPerson(person({ id: 'not-an-id' })), 0);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lets viewers read but not write', async () => {
    const { viewer, clanId } = await setup();
    expect((await submit(viewer, clanId, addPerson(person()), 0)).status).toBe(403);
  });

  it('lets only the owner choose the progenitor, also inside a batch', async () => {
    const { owner, editor, clanId } = await setup();
    const tu = person();
    await submit(editor, clanId, addPerson(tu), 0);
    const choose: Op = { type: 'setProgenitor', payload: { personId: tu.id } };

    const denied = await submit(editor, clanId, choose, 1);
    expect(denied.status).toBe(403);
    const hidden: Op = { type: 'batch', payload: { ops: [addPerson(person()), choose] } };
    expect((await submit(editor, clanId, hidden, 1)).status).toBe(403);

    expect((await submit(owner, clanId, choose, 1)).status).toBe(200);
    const tree = await editor.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.progenitorId).toBe(tu.id);
  });
});

describe('GET /api/clans/:id/ops', () => {
  it('lists the ops after `since`, oldest first', async () => {
    const { editor, viewer, clanId } = await setup();
    const first = person();
    const second = person();
    await submit(editor, clanId, addPerson(first), 0);
    await submit(editor, clanId, addPerson(second), 1);

    const all = await viewer.agent.get(`/api/clans/${clanId}/ops`);
    expect(all.status).toBe(200);
    expect(all.body.map((entry: { seq: number }) => entry.seq)).toEqual([1, 2]);
    expect(all.body[0]).toMatchObject({ seq: 1, userId: editor.user.id, op: addPerson(first) });

    const later = await viewer.agent.get(`/api/clans/${clanId}/ops?since=1`);
    expect(later.body).toHaveLength(1);
    expect(later.body[0].op).toEqual(addPerson(second));
  });

  it('validates `since`', async () => {
    const { viewer, clanId } = await setup();
    expect((await viewer.agent.get(`/api/clans/${clanId}/ops?since=-1`)).status).toBe(400);
  });

  it('pages: at most OPS_PAGE_SIZE entries, then the rest from the last seq', async () => {
    const { owner, viewer, clanId } = await setup();
    const clear = { type: 'setProgenitor', payload: { personId: null } };
    await OperationModel.insertMany(
      Array.from({ length: OPS_PAGE_SIZE + 1 }, (_, index) => ({
        clanId,
        seq: index + 1,
        userId: owner.user.id,
        type: clear.type,
        payload: clear.payload,
        inverse: clear,
      })),
    );
    const first = await viewer.agent.get(`/api/clans/${clanId}/ops`);
    expect(first.body).toHaveLength(OPS_PAGE_SIZE);
    expect(first.body.at(-1).seq).toBe(OPS_PAGE_SIZE);
    const rest = await viewer.agent.get(`/api/clans/${clanId}/ops?since=${OPS_PAGE_SIZE}`);
    expect(rest.body.map((entry: { seq: number }) => entry.seq)).toEqual([OPS_PAGE_SIZE + 1]);
  });

  it('answers an empty list when nothing came after `since`', async () => {
    const { editor, viewer, clanId } = await setup();
    await submit(editor, clanId, addPerson(person()), 0);
    expect((await viewer.agent.get(`/api/clans/${clanId}/ops?since=1`)).body).toEqual([]);
    expect((await viewer.agent.get(`/api/clans/${clanId}/ops?since=9`)).body).toEqual([]);
  });

  it('answers 409 and keeps nothing when the seq is already taken', async () => {
    const { editor, clanId } = await setup();
    // A log entry the clan's version does not know about: the unique index is the last guard.
    await OperationModel.create({
      clanId,
      seq: 1,
      userId: editor.user.id,
      type: 'setProgenitor',
      payload: { personId: null },
      inverse: { type: 'setProgenitor', payload: { personId: null } },
    });
    const response = await submit(editor, clanId, addPerson(person()), 0);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
    expect(await PersonModel.countDocuments({ clanId })).toBe(0);
    expect((await Clan.findById(clanId))?.version).toBe(0);
  });

  it('refuses a union id that another family tree already uses', async () => {
    const { editor, clanId } = await setup();
    const other = await signUp(app);
    const otherClan = await createClan(other.agent);
    const unionId = newObjectId();
    const marry = (partner: Person): Op => ({
      type: 'addUnion',
      payload: { id: unionId, partnerIds: [partner.id], order: 1, status: 'married' },
    });
    const theirs = person();
    const ours = person();
    await submit(other, otherClan.id, addPerson(theirs), 0);
    expect((await submit(other, otherClan.id, marry(theirs), 1)).status).toBe(200);
    await submit(editor, clanId, addPerson(ours), 0);
    const response = await submit(editor, clanId, marry(ours), 1);
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: 'RULE_VIOLATION', reason: 'DUPLICATE_ID' });
  });

  it('answers 404 for a family tree the member is not in', async () => {
    const { editor } = await setup();
    const other = await signUp(app);
    const otherClan = await createClan(other.agent);
    expect((await submit(editor, otherClan.id, addPerson(person()), 0)).status).toBe(404);
    expect((await editor.agent.get(`/api/clans/${otherClan.id}/ops`)).status).toBe(404);
  });
});

describe('the expected user of POST /api/clans/:id/ops', () => {
  it('answers 409 IDENTITY_MISMATCH before the role check and changes nothing', async () => {
    const { editor, viewer, clanId } = await setup();
    const stranger = await signUp(app);
    for (const member of [editor, viewer, stranger]) {
      const response = await member.agent
        .post(`/api/clans/${clanId}/ops`)
        .send({ op: addPerson(person()), baseVersion: 0, expectedUserId: newObjectId() });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDENTITY_MISMATCH');
    }
    expect(await PersonModel.countDocuments({ clanId })).toBe(0);
  });

  it('is required', async () => {
    const { editor, clanId } = await setup();
    const response = await editor.agent
      .post(`/api/clans/${clanId}/ops`)
      .send({ op: addPerson(person()), baseVersion: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('reverts on POST /api/clans/:id/ops', () => {
  it('stores revertsSeq with the op', async () => {
    const { editor, clanId } = await setup();
    const tu = person();
    await submit(editor, clanId, addPerson(tu), 0);
    const undo: Op = { type: 'deletePerson', payload: { id: tu.id } };
    expect((await submit(editor, clanId, undo, 1, { revertsSeq: 1 })).status).toBe(200);
    const stored = await OperationModel.findOne({ clanId, seq: 2 }).lean();
    expect(stored?.revertsSeq).toBe(1);
    expect(stored?.revertsToSeq).toBeUndefined();
  });

  it('checks the range of revertsSeq and revertsToSeq', async () => {
    const { owner, clanId } = await setup();
    await submit(owner, clanId, addPerson(person()), 0);
    const op = addPerson(person());
    for (const extra of [
      { revertsSeq: 2 },
      { revertsSeq: 0 },
      { revertsToSeq: 1 },
      { revertsSeq: 1, revertsToSeq: 1 },
    ]) {
      const response = await submit(owner, clanId, op, 1, extra);
      expect(response.status, JSON.stringify(extra)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await Clan.findById(clanId))?.version).toBe(1);
  });

  it('lets only the Manager revert the tree to a point', async () => {
    const { owner, editor, clanId } = await setup();
    const tu = person();
    const hoa = person();
    await submit(owner, clanId, addPerson(tu), 0);
    await submit(owner, clanId, addPerson(hoa), 1);
    const back: Op = { type: 'deletePerson', payload: { id: hoa.id } };
    const denied = await submit(editor, clanId, back, 2, { revertsToSeq: 1 });
    expect(denied.status).toBe(403);
    expect((await submit(owner, clanId, back, 2, { revertsToSeq: 1 })).status).toBe(200);
    expect((await OperationModel.findOne({ clanId, seq: 3 }).lean())?.revertsToSeq).toBe(1);
  });
});
