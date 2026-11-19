import { newObjectId } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { PersonModel } from '../models/Person.ts';
import { ViewPreferenceModel } from '../models/ViewPreference.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

type Member = Awaited<ReturnType<typeof signUp>>;

async function insertPerson(clanId: string): Promise<string> {
  const id = newObjectId();
  await PersonModel.create({
    _id: id,
    clanId,
    fullName: 'Nguyễn Văn Tư',
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
  });
  return id;
}

/** An owner with a new family tree holding one person, plus a viewer of it. */
async function setup() {
  const owner = await signUp(app);
  const viewer = await signUp(app);
  const clan = await createClan(owner.agent);
  await addMember(clan.id, viewer.user.id, 'viewer');
  const personId = await insertPerson(clan.id);
  return { owner, viewer, clanId: clan.id, personId };
}

const path = (clanId: string) => `/api/clans/${clanId}/view-preference`;
const put = (member: Member, clanId: string, body: object) =>
  member.agent.put(path(clanId)).send(body);

describe('GET /api/clans/:id/view-preference', () => {
  it('answers the empty preference to a member who never decorated', async () => {
    const { viewer, clanId } = await setup();
    const response = await viewer.agent.get(path(clanId));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, theme: {}, cards: {} });
  });

  it('is for members only', async () => {
    const { clanId } = await setup();
    const stranger = await signUp(app);
    expect((await stranger.agent.get(path(clanId))).status).toBe(404);
    const saved = await put(stranger, clanId, { enabled: true, theme: {}, cards: {} });
    expect(saved.status).toBe(404);
    expect(await ViewPreferenceModel.countDocuments({ clanId })).toBe(0);
  });
});

describe('PUT /api/clans/:id/view-preference', () => {
  it('lets a viewer save their own, and each member reads only their own', async () => {
    const { owner, viewer, clanId, personId } = await setup();
    const mine = {
      enabled: true,
      theme: { surface: 'corkboard', fastener: 'pushpin' },
      cards: { [personId]: { frame: 'vintage' } },
    };
    const saved = await put(viewer, clanId, mine);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(mine);
    expect((await viewer.agent.get(path(clanId))).body).toEqual(mine);
    expect((await owner.agent.get(path(clanId))).body).toEqual({
      enabled: false,
      theme: {},
      cards: {},
    });
  });

  it('replaces the whole document: the last save wins', async () => {
    const { viewer, clanId } = await setup();
    await put(viewer, clanId, { enabled: true, theme: { surface: 'fridge' }, cards: {} });
    await put(viewer, clanId, { enabled: false, theme: { thread: 'yarn' }, cards: {} });
    expect((await viewer.agent.get(path(clanId))).body).toEqual({
      enabled: false,
      theme: { thread: 'yarn' },
      cards: {},
    });
    expect(await ViewPreferenceModel.countDocuments({ clanId })).toBe(1);
  });

  it('prunes the cards of people who are not in this family tree', async () => {
    const { viewer, clanId, personId } = await setup();
    const gone = newObjectId();
    const response = await put(viewer, clanId, {
      enabled: true,
      theme: {},
      cards: { [personId]: { fastener: 'magnet' }, [gone]: { frame: 'kraft' } },
    });
    expect(response.body.cards).toEqual({ [personId]: { fastener: 'magnet' } });
  });

  it('refuses unknown options, keys that are not ids, and more than 5,000 cards', async () => {
    const { viewer, clanId } = await setup();
    const unknown = { enabled: true, theme: { surface: 'chalkboard' }, cards: {} };
    expect((await put(viewer, clanId, unknown)).status).toBe(400);
    const badKey = { enabled: true, theme: {}, cards: { abc: { frame: 'kraft' } } };
    expect((await put(viewer, clanId, badKey)).status).toBe(400);
    const cards = Object.fromEntries(
      Array.from({ length: 5001 }, () => [newObjectId(), { frame: 'kraft' }]),
    );
    expect((await put(viewer, clanId, { enabled: true, theme: {}, cards })).status).toBe(400);
  });

  it('keeps one document when two first saves race', async () => {
    const { viewer, clanId } = await setup();
    const body = { enabled: true, theme: { stitch: 'yarn' }, cards: {} };
    const [a, b] = await Promise.all([put(viewer, clanId, body), put(viewer, clanId, body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await ViewPreferenceModel.countDocuments({ clanId })).toBe(1);
  });
});
