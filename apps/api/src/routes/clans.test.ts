import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Clan } from '../models/Clan.ts';
import { Membership } from '../models/Membership.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('clans', () => {
  it('creates a clan with the creator as its owner', async () => {
    const { agent, user } = await signUp(app);
    const response = await agent
      .post('/api/clans')
      .send({ name: ' Họ Nguyễn ', hometown: 'Nam Định' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Họ Nguyễn',
      hometown: 'Nam Định',
      description: '',
      role: 'owner',
      memberCount: 1,
    });
    expect(await Clan.countDocuments()).toBe(1);
    expect(await Membership.findOne({ userId: user.id })).toMatchObject({ role: 'owner' });
  });

  it('validates the name', async () => {
    const { agent } = await signUp(app);
    expect((await agent.post('/api/clans').send({ name: '   ' })).status).toBe(400);
  });

  it('lists only my clans, with my role and the member count', async () => {
    const owner = await signUp(app);
    const viewer = await signUp(app);
    const stranger = await signUp(app);
    const nguyen = await createClan(owner.agent, { name: 'Họ Nguyễn' });
    await createClan(stranger.agent, { name: 'Họ Trần' });
    await addMember(nguyen.id, viewer.user.id, 'viewer');

    const list = await viewer.agent.get('/api/clans');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: nguyen.id, role: 'viewer', memberCount: 2 });
  });

  it('shows a clan to its members only', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const clan = await createClan(owner.agent);
    expect((await owner.agent.get(`/api/clans/${clan.id}`)).body).toMatchObject({ role: 'owner' });
    expect((await stranger.agent.get(`/api/clans/${clan.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/clans/${clan.id}`)).status).toBe(401);
  });

  it('lets only the owner change the clan settings', async () => {
    const owner = await signUp(app);
    const editor = await signUp(app);
    const clan = await createClan(owner.agent);
    await addMember(clan.id, editor.user.id, 'editor');

    const denied = await editor.agent.patch(`/api/clans/${clan.id}`).send({ name: 'Đổi tên' });
    expect(denied.status).toBe(403);
    const changed = await owner.agent
      .patch(`/api/clans/${clan.id}`)
      .send({ description: 'Gia phả họ Nguyễn' });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Họ Nguyễn', description: 'Gia phả họ Nguyễn' });
  });

  it('gives a viewer 403 and a stranger 404 on clan settings, and changes nothing', async () => {
    const owner = await signUp(app);
    const viewer = await signUp(app);
    const stranger = await signUp(app);
    const clan = await createClan(owner.agent);
    await addMember(clan.id, viewer.user.id, 'viewer');

    const path = `/api/clans/${clan.id}`;
    expect((await viewer.agent.patch(path).send({ name: 'Đổi tên' })).status).toBe(403);
    expect((await stranger.agent.patch(path).send({ name: 'Đổi tên' })).status).toBe(404);
    expect((await owner.agent.patch('/api/clans/not-an-id').send({ name: 'X' })).status).toBe(404);
    expect((await Clan.findById(clan.id))?.name).toBe(clan.name);
  });
});
