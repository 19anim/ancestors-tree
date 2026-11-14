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

type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

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

function submit(agent: Agent, clanId: string, op: Op, baseVersion: number) {
  return agent.post(`/api/clans/${clanId}/ops`).send({ op, baseVersion });
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
    expect((await submit(editor.agent, 'not-an-id', addPerson(person()), 0)).status).toBe(404);
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
    expect((await submit(editor.agent, clanId, addPerson(person()), 0)).body).toEqual({ seq: 1 });
    expect((await Clan.findById(clanId))?.version).toBe(1);
  });

  it('saves an op, bumps the version and logs the op with its inverse', async () => {
    const { editor, viewer, clanId } = await setup();
    const tu = person();
    const response = await submit(editor.agent, clanId, addPerson(tu), 0);
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
    expect((await submit(editor.agent, clanId, batch, 0)).body).toEqual({ seq: 1 });
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
    await submit(editor.agent, clanId, addPerson(tu), 0);
    const update: Op = {
      type: 'updatePerson',
      payload: { id: tu.id, changes: { bio: null, fullName: 'Nguyễn Văn Tư (Cụ)' } },
    };
    expect((await submit(editor.agent, clanId, update, 1)).status).toBe(200);
    const tree = await editor.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.persons).toEqual([{ ...person(), id: tu.id, fullName: 'Nguyễn Văn Tư (Cụ)' }]);

    const remove: Op = { type: 'deletePerson', payload: { id: tu.id } };
    expect((await submit(editor.agent, clanId, remove, 2)).status).toBe(200);
    expect(await PersonModel.countDocuments({ clanId })).toBe(0);
  });

  it('answers 409 to a stale base version and changes nothing', async () => {
    const { editor, clanId } = await setup();
    await submit(editor.agent, clanId, addPerson(person()), 0);
    const stale = await submit(editor.agent, clanId, addPerson(person()), 0);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await PersonModel.countDocuments({ clanId })).toBe(1);
    expect((await Clan.findById(clanId))?.version).toBe(1);
  });

  it('lets only one of two simultaneous writers win', async () => {
    const { editor, owner, clanId } = await setup();
    const responses = await Promise.all([
      submit(editor.agent, clanId, addPerson(person()), 0),
      submit(owner.agent, clanId, addPerson(person()), 0),
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
    await submit(owner.agent, clanId, family, 0);
    const response = await submit(
      owner.agent,
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
    expect((await submit(other.agent, otherClan.id, addPerson(shared), 0)).status).toBe(200);

    const response = await submit(editor.agent, clanId, addPerson(shared), 0);
    expect(response.status).toBe(422);
    expect(response.body.error.reason).toBe('DUPLICATE_ID');
    expect((await Clan.findById(clanId))?.version).toBe(0);
  });

  it('rejects a malformed op with 400', async () => {
    const { editor, clanId } = await setup();
    const response = await submit(editor.agent, clanId, addPerson(person({ id: 'not-an-id' })), 0);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lets viewers read but not write', async () => {
    const { viewer, clanId } = await setup();
    expect((await submit(viewer.agent, clanId, addPerson(person()), 0)).status).toBe(403);
  });

  it('lets only the owner choose the progenitor, also inside a batch', async () => {
    const { owner, editor, clanId } = await setup();
    const tu = person();
    await submit(editor.agent, clanId, addPerson(tu), 0);
    const choose: Op = { type: 'setProgenitor', payload: { personId: tu.id } };

    const denied = await submit(editor.agent, clanId, choose, 1);
    expect(denied.status).toBe(403);
    const hidden: Op = { type: 'batch', payload: { ops: [addPerson(person()), choose] } };
    expect((await submit(editor.agent, clanId, hidden, 1)).status).toBe(403);

    expect((await submit(owner.agent, clanId, choose, 1)).status).toBe(200);
    const tree = await editor.agent.get(`/api/clans/${clanId}/tree`);
    expect(tree.body.progenitorId).toBe(tu.id);
  });
});

describe('GET /api/clans/:id/ops', () => {
  it('lists the ops after `since`, oldest first', async () => {
    const { editor, viewer, clanId } = await setup();
    const first = person();
    const second = person();
    await submit(editor.agent, clanId, addPerson(first), 0);
    await submit(editor.agent, clanId, addPerson(second), 1);

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
});
