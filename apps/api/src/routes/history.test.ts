import { HISTORY_PAGE_MAX } from '@ancestors-tree/shared';
import { newObjectId, type Op, type Person } from '@ancestors-tree/shared/tree';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

type Member = Awaited<ReturnType<typeof signUp>>;
type Entry = { seq: number };

function person(fullName: string): Person {
  return {
    id: newObjectId(),
    fullName,
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
  };
}

async function submit(
  member: Member,
  clanId: string,
  op: Op,
  baseVersion: number,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await member.agent
    .post(`/api/clans/${clanId}/ops`)
    .send({ op, baseVersion, expectedUserId: member.user.id, ...extra });
  expect(response.status).toBe(200);
}

async function setup() {
  const owner = await signUp(app, { name: 'Ông Thịnh' });
  const editor = await signUp(app, { name: 'Chị Lan' });
  const viewer = await signUp(app);
  const clan = await createClan(owner.agent);
  await addMember(clan.id, editor.user.id, 'editor');
  await addMember(clan.id, viewer.user.id, 'viewer');
  return { owner, editor, viewer, clanId: clan.id, path: `/api/clans/${clan.id}/history` };
}

describe('GET /api/clans/:id/history', () => {
  it('lists changes newest first with author names, inverses and revert links', async () => {
    const { owner, editor, viewer, clanId, path } = await setup();
    const tu = person('Nguyễn Văn Tư');
    await submit(owner, clanId, { type: 'addPerson', payload: tu }, 0);
    const bio: Op = { type: 'updatePerson', payload: { id: tu.id, changes: { bio: 'Cụ tổ' } } };
    await submit(editor, clanId, bio, 1);
    const undo: Op = { type: 'updatePerson', payload: { id: tu.id, changes: { bio: null } } };
    await submit(editor, clanId, undo, 2, { revertsSeq: 2 });

    const response = await viewer.agent.get(path);
    expect(response.status).toBe(200);
    expect(response.body.nextBefore).toBeNull();
    expect(response.body.entries.map((entry: Entry) => entry.seq)).toEqual([3, 2, 1]);
    expect(response.body.entries[0]).toMatchObject({
      seq: 3,
      userId: editor.user.id,
      authorName: 'Chị Lan',
      op: undo,
      inverse: bio,
      revertsSeq: 2,
    });
    expect(response.body.entries[2]).toMatchObject({
      authorName: 'Ông Thịnh',
      op: { type: 'addPerson', payload: tu },
      inverse: { type: 'deletePerson', payload: { id: tu.id } },
    });
    expect(response.body.entries[2]).not.toHaveProperty('revertsSeq');
    expect(Date.parse(response.body.entries[0].createdAt)).not.toBeNaN();
  });

  it('pages backwards with `before` and `limit`', async () => {
    const { owner, viewer, clanId, path } = await setup();
    for (let version = 0; version < 5; version += 1) {
      await submit(
        owner,
        clanId,
        { type: 'addPerson', payload: person(`Người ${version}`) },
        version,
      );
    }
    const seqs = (body: { entries: Entry[] }) => body.entries.map((entry) => entry.seq);
    const first = (await viewer.agent.get(`${path}?limit=2`)).body;
    expect(seqs(first)).toEqual([5, 4]);
    expect(first.nextBefore).toBe(4);
    const second = (await viewer.agent.get(`${path}?limit=2&before=4`)).body;
    expect(seqs(second)).toEqual([3, 2]);
    expect(second.nextBefore).toBe(2);
    const last = (await viewer.agent.get(`${path}?limit=2&before=2`)).body;
    expect(seqs(last)).toEqual([1]);
    expect(last.nextBefore).toBeNull();
  });

  it('keeps the id but no name for an account that no longer exists', async () => {
    const { editor, viewer, clanId, path } = await setup();
    await submit(editor, clanId, { type: 'addPerson', payload: person('Trần Văn Bình') }, 0);
    await User.deleteOne({ _id: editor.user.id });
    const [entry] = (await viewer.agent.get(path)).body.entries;
    expect(entry).toMatchObject({ userId: editor.user.id, authorName: '' });
  });

  it('is for members only and validates the query', async () => {
    const { viewer, path } = await setup();
    const stranger = await signUp(app);
    expect((await stranger.agent.get(path)).status).toBe(404);
    expect((await request(app).get(path)).status).toBe(401);
    expect((await viewer.agent.get(`${path}?limit=${HISTORY_PAGE_MAX + 1}`)).status).toBe(400);
    expect((await viewer.agent.get(`${path}?before=0`)).status).toBe(400);
  });

  it("lists only this family tree's changes, and hides another tree's", async () => {
    const a = await setup();
    const b = await setup();
    const inA = [person('Nguyễn Văn Tư'), person('Lê Thị Hoa')];
    const inB = [person('Trần Văn Bình'), person('Phạm Văn Lộc'), person('Đỗ Thị Mai')];
    for (const [version, payload] of inA.entries()) {
      await submit(a.owner, a.clanId, { type: 'addPerson', payload }, version);
    }
    for (const [version, payload] of inB.entries()) {
      await submit(b.owner, b.clanId, { type: 'addPerson', payload }, version);
    }

    const response = await a.viewer.agent.get(a.path);
    expect(response.status).toBe(200);
    expect(response.body.entries.map((entry: Entry) => entry.seq)).toEqual([2, 1]);
    expect(
      response.body.entries.map((entry: { op: { payload: Person } }) => entry.op.payload.id),
    ).toEqual([inA[1]?.id, inA[0]?.id]);
    expect((await a.viewer.agent.get(b.path)).status).toBe(404);
    expect((await a.owner.agent.get(b.path)).status).toBe(404);
  });
});
