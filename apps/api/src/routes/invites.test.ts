import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { Invite } from '../models/Invite.ts';
import { Membership } from '../models/Membership.ts';
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

  it('keeps one membership when the same person accepts twice at once', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'editor' })).body;
    const lan = await signUp(app);
    const accept = `/api/invites/${token}/accept`;
    const [first, second] = await Promise.all([lan.agent.post(accept), lan.agent.post(accept)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const joined = [first.body, second.body].filter((body) => body.alreadyMember === false);
    expect(joined).toHaveLength(1);
    expect([first.body.role, second.body.role]).toEqual(['editor', 'editor']);
    expect(await Membership.countDocuments({ clanId: clan.id, userId: lan.user.id })).toBe(1);
  });

  it('answers the duplicate-key race with the role actually stored', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const { token } = (await owner.agent.post(path).send({ role: 'editor' })).body;
    const lan = await signUp(app);
    // The other request already stored "viewer", but this one has not seen it yet.
    await addMember(clan.id, lan.user.id, 'viewer');
    const spy = vi.spyOn(Membership, 'findOne').mockResolvedValueOnce(null);
    try {
      const response = await lan.agent.post(`/api/invites/${token}/accept`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clanId: clan.id, role: 'viewer', alreadyMember: true });
    } finally {
      spy.mockRestore();
    }
    expect(await Membership.countDocuments({ clanId: clan.id, userId: lan.user.id })).toBe(1);
  });

  it('refuses to accept an expired invite and adds nobody', async () => {
    const { owner, clan } = await ownerWithClan();
    await Invite.create({
      clanId: clan.id,
      token: 'x'.repeat(32),
      role: 'viewer',
      createdBy: owner.user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const joiner = await signUp(app);
    const response = await joiner.agent.post(`/api/invites/${'x'.repeat(32)}/accept`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(await Membership.countDocuments({ clanId: clan.id, userId: joiner.user.id })).toBe(0);
  });

  it('does not let an invite grant the owner role', async () => {
    const { owner, path } = await ownerWithClan();
    const response = await owner.agent.post(path).send({ role: 'owner' });
    expect(response.status).toBe(400);
    expect(await Invite.countDocuments({})).toBe(0);
  });

  it('expires invites with a TTL index on expiresAt', async () => {
    await Invite.syncIndexes();
    const indexes = await Invite.collection.indexes();
    const ttl = indexes.find((index) => index.key?.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it('checks the clan in the path on every owner route', async () => {
    const first = await ownerWithClan();
    const second = await ownerWithClan();
    const invite = (await first.owner.agent.post(first.path).send({ role: 'viewer' })).body;
    const outsider = await signUp(app);
    const malformed = '/api/clans/not-an-id/invites';

    // Cross-clan: the owner of clan B gets 404 on clan A, and A's invite is untouched.
    expect((await second.owner.agent.get(first.path)).status).toBe(404);
    expect((await second.owner.agent.post(first.path).send({ role: 'viewer' })).status).toBe(404);
    expect((await second.owner.agent.delete(`${first.path}/${invite.id}`)).status).toBe(404);
    // Non-members and malformed clan ids look the same.
    expect((await outsider.agent.get(first.path)).status).toBe(404);
    expect((await outsider.agent.post(first.path).send({ role: 'viewer' })).status).toBe(404);
    expect((await outsider.agent.delete(`${first.path}/${invite.id}`)).status).toBe(404);
    expect((await first.owner.agent.get(malformed)).status).toBe(404);
    expect((await first.owner.agent.post(malformed).send({ role: 'viewer' })).status).toBe(404);
    expect((await first.owner.agent.delete(`${malformed}/${invite.id}`)).status).toBe(404);
    // A malformed invite id is a validation error, never a 500.
    expect((await first.owner.agent.delete(`${first.path}/nope`)).status).toBe(400);

    expect(await Invite.countDocuments({ clanId: first.clan.id })).toBe(1);
    expect(await Invite.countDocuments({ clanId: second.clan.id })).toBe(0);
  });

  it('gives a viewer 403 on every invite route and changes nothing', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const invite = (await owner.agent.post(path).send({ role: 'viewer' })).body;
    const viewer = await signUp(app);
    await addMember(clan.id, viewer.user.id, 'viewer');
    expect((await viewer.agent.get(path)).status).toBe(403);
    expect((await viewer.agent.post(path).send({ role: 'viewer' })).status).toBe(403);
    expect((await viewer.agent.delete(`${path}/${invite.id}`)).status).toBe(403);
    expect(await Invite.countDocuments({ clanId: clan.id })).toBe(1);
  });

  it('writes and removes the invite row on create and revoke', async () => {
    const { owner, clan, path } = await ownerWithClan();
    const created = (await owner.agent.post(path).send({ role: 'editor' })).body;
    const row = await Invite.findOne({ clanId: clan.id });
    expect(row).toMatchObject({ token: created.token, role: 'editor' });
    expect(row?.createdBy.toString()).toBe(owner.user.id);
    expect((await owner.agent.delete(`${path}/${created.id}`)).status).toBe(204);
    expect(await Invite.countDocuments({ clanId: clan.id })).toBe(0);
    expect((await owner.agent.delete(`${path}/${created.id}`)).status).toBe(404);
  });
});
