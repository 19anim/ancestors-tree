import { describe, expect, it } from 'vitest';
import { Membership } from '../models/Membership.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

async function clanWithMembers() {
  const owner = await signUp(app, { name: 'Ông Thịnh' });
  const editor = await signUp(app, { name: 'Bố Tuấn' });
  const viewer = await signUp(app, { name: 'Cô Hà' });
  const clan = await createClan(owner.agent);
  await addMember(clan.id, editor.user.id, 'editor');
  await addMember(clan.id, viewer.user.id, 'viewer');
  return { owner, editor, viewer, clan, path: `/api/clans/${clan.id}/members` };
}

describe('members', () => {
  it('lists members, owner first; only the owner sees everyone’s email', async () => {
    const { owner, editor, viewer, path } = await clanWithMembers();

    const asOwner = await owner.agent.get(path);
    expect(asOwner.body.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'editor',
      'viewer',
    ]);
    expect(asOwner.body.every((m: { email?: string }) => typeof m.email === 'string')).toBe(true);
    expect(asOwner.body[0]).toMatchObject({ name: 'Ông Thịnh', isYou: true });

    const asEditor = await editor.agent.get(path);
    const emails = asEditor.body.map((m: { email?: string }) => m.email);
    expect(emails).toEqual([undefined, editor.user.email, undefined]);
    expect((await viewer.agent.get(path)).status).toBe(200);
  });

  it('lets the owner change roles, except their own', async () => {
    const { owner, editor, viewer, path } = await clanWithMembers();
    const promoted = await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'editor' });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ userId: viewer.user.id, role: 'editor' });

    expect(
      (await editor.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'viewer' })).status,
    ).toBe(403);
    expect(
      (await owner.agent.patch(`${path}/${owner.user.id}`).send({ role: 'viewer' })).status,
    ).toBe(403);
    expect(
      (await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'owner' })).status,
    ).toBe(400);
    const stranger = await signUp(app);
    expect(
      (await owner.agent.patch(`${path}/${stranger.user.id}`).send({ role: 'viewer' })).status,
    ).toBe(404);
  });

  it('lets members leave and the owner remove others', async () => {
    const { owner, editor, viewer, clan, path } = await clanWithMembers();
    expect((await editor.agent.delete(`${path}/${viewer.user.id}`)).status).toBe(403);
    expect((await viewer.agent.delete(`${path}/${viewer.user.id}`)).status).toBe(204);
    expect((await viewer.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);

    expect((await owner.agent.delete(`${path}/${editor.user.id}`)).status).toBe(204);
    expect((await editor.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);

    const ownerLeaves = await owner.agent.delete(`${path}/${owner.user.id}`);
    expect(ownerLeaves.status).toBe(403);
  });

  async function roleOf(clanId: string, userId: string) {
    return (await Membership.findOne({ clanId, userId }))?.role;
  }

  it('stores the new role when the owner changes it', async () => {
    const { owner, viewer, clan, path } = await clanWithMembers();
    await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'editor' });
    expect(await roleOf(clan.id, viewer.user.id)).toBe('editor');
    const invalid = await owner.agent.patch(`${path}/${viewer.user.id}`).send({ role: 'boss' });
    expect(invalid.status).toBe(400);
    expect((await owner.agent.patch(`${path}/${viewer.user.id}`).send({})).status).toBe(400);
    expect(await roleOf(clan.id, viewer.user.id)).toBe('editor');
  });

  it('gives a viewer 403 on role changes and removals, and changes nothing', async () => {
    const { editor, viewer, clan, path } = await clanWithMembers();
    const patch = await viewer.agent.patch(`${path}/${editor.user.id}`).send({ role: 'viewer' });
    expect(patch.status).toBe(403);
    expect((await viewer.agent.delete(`${path}/${editor.user.id}`)).status).toBe(403);
    expect(await roleOf(clan.id, editor.user.id)).toBe('editor');
  });

  it('removes the membership row on leave and on owner removal', async () => {
    const { owner, editor, viewer, clan, path } = await clanWithMembers();
    await viewer.agent.delete(`${path}/${viewer.user.id}`);
    expect(await roleOf(clan.id, viewer.user.id)).toBeUndefined();
    await owner.agent.delete(`${path}/${editor.user.id}`);
    expect(await roleOf(clan.id, editor.user.id)).toBeUndefined();
    expect((await owner.agent.delete(`${path}/${editor.user.id}`)).status).toBe(404);
    expect(await roleOf(clan.id, owner.user.id)).toBe('owner');
  });

  it('cannot reach another clan’s members by mixing ids', async () => {
    const a = await clanWithMembers();
    const b = await clanWithMembers();

    const patch = await b.owner.agent
      .patch(`${b.path}/${a.viewer.user.id}`)
      .send({ role: 'editor' });
    expect(patch.status).toBe(404);
    expect((await b.owner.agent.delete(`${b.path}/${a.viewer.user.id}`)).status).toBe(404);
    expect((await b.owner.agent.get(a.path)).status).toBe(404);
    const viaA = await b.owner.agent
      .patch(`${a.path}/${a.viewer.user.id}`)
      .send({ role: 'editor' });
    expect(viaA.status).toBe(404);
    expect((await b.owner.agent.delete(`${a.path}/${a.viewer.user.id}`)).status).toBe(404);
    expect((await b.editor.agent.delete(`${a.path}/${b.editor.user.id}`)).status).toBe(404);

    expect(await roleOf(a.clan.id, a.viewer.user.id)).toBe('viewer');
    expect(await roleOf(b.clan.id, a.viewer.user.id)).toBeUndefined();
    expect(await roleOf(b.clan.id, b.editor.user.id)).toBe('editor');
  });

  it('answers 404 to non-members and malformed clan ids, never 500', async () => {
    const { owner, viewer, path } = await clanWithMembers();
    const outsider = await signUp(app);
    const target = `${path}/${viewer.user.id}`;
    expect((await outsider.agent.get(path)).status).toBe(404);
    expect((await outsider.agent.patch(target).send({ role: 'editor' })).status).toBe(404);
    expect((await outsider.agent.delete(target)).status).toBe(404);

    const bad = '/api/clans/not-an-id/members';
    expect((await owner.agent.get(bad)).status).toBe(404);
    const badPatch = await owner.agent.patch(`${bad}/${viewer.user.id}`).send({ role: 'editor' });
    expect(badPatch.status).toBe(404);
    expect((await owner.agent.delete(`${bad}/${viewer.user.id}`)).status).toBe(404);
    // A malformed member id is a validation error.
    expect((await owner.agent.patch(`${path}/nope`).send({ role: 'editor' })).status).toBe(400);
    expect((await owner.agent.delete(`${path}/nope`)).status).toBe(400);
  });
});
