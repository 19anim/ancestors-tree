import { describe, expect, it } from 'vitest';
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
});
