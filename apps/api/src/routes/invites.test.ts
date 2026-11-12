import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Invite } from '../models/Invite.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

async function ownerWithClan() {
  const owner = await signUp(app, { name: 'Ông Thịnh' });
  const clan = await createClan(owner.agent, { name: 'Họ Nguyễn' });
  return { owner, clan, path: `/api/clans/${clan.id}/invites` };
}

describe('invites', () => {
  it('lets the owner create an invite that lasts 7 days', async () => {
    const { owner, path } = await ownerWithClan();
    const response = await owner.agent.post(path).send({ role: 'editor' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ role: 'editor', createdByName: 'Ông Thịnh' });
    expect(response.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const lifetime = Date.parse(response.body.expiresAt) - Date.parse(response.body.createdAt);
    expect(Math.abs(lifetime - 7 * DAY_MS)).toBeLessThan(5000);

    const list = await owner.agent.get(path);
    expect(list.body).toHaveLength(1);
  });

  it('keeps invites to the owner', async () => {
    const { clan, path } = await ownerWithClan();
    const editor = await signUp(app);
    await addMember(clan.id, editor.user.id, 'editor');
    expect((await editor.agent.post(path).send({ role: 'viewer' })).status).toBe(403);
    expect((await editor.agent.get(path)).status).toBe(403);
  });

  it('previews an invite without signing in', async () => {
    const { owner, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      clanName: 'Họ Nguyễn',
      role: 'viewer',
      invitedByName: 'Ông Thịnh',
    });
    const unknown = await request(app).get(`/api/invites/${'a'.repeat(32)}`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets several people join with one link, once each', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'editor' })).body;
    const lan = await signUp(app);
    const tuan = await signUp(app);

    const joined = await lan.agent.post(`/api/invites/${token}/accept`);
    expect(joined.status).toBe(200);
    expect(joined.body).toEqual({ clanId: clan.id, role: 'editor', alreadyMember: false });
    expect((await tuan.agent.post(`/api/invites/${token}/accept`)).body.alreadyMember).toBe(false);

    const again = await lan.agent.post(`/api/invites/${token}/accept`);
    expect(again.body).toEqual({ clanId: clan.id, role: 'editor', alreadyMember: true });
    const ownerJoins = await owner.agent.post(`/api/invites/${token}/accept`);
    expect(ownerJoins.body).toEqual({ clanId: clan.id, role: 'owner', alreadyMember: true });

    expect((await lan.agent.get('/api/clans')).body[0]).toMatchObject({
      id: clan.id,
      role: 'editor',
    });
  });

  it('needs a session to accept', async () => {
    const { owner, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    expect((await request(app).post(`/api/invites/${token}/accept`)).status).toBe(401);
  });

  it('stops working when revoked or expired', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const invite = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    expect((await owner.agent.delete(`${path}/${invite.id}`)).status).toBe(204);
    const joiner = await signUp(app);
    const revoked = await joiner.agent.post(`/api/invites/${invite.token}/accept`);
    expect(revoked.body.error.code).toBe('INVALID_TOKEN');

    await Invite.create({
      clanId: clan.id,
      token: 'e'.repeat(32),
      role: 'viewer',
      createdBy: owner.user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await request(app).get(`/api/invites/${'e'.repeat(32)}`)).body.error.code).toBe(
      'INVALID_TOKEN',
    );
    expect((await owner.agent.get(path)).body).toEqual([]);
  });

  it('cannot revoke another clan’s invite', async () => {
    const first = await ownerWithClan();
    const second = await ownerWithClan();
    const invite = (await first.owner.agent.post(first.path).send({ role: 'viewer' })).body;
    expect((await second.owner.agent.delete(`${second.path}/${invite.id}`)).status).toBe(404);
  });
});
