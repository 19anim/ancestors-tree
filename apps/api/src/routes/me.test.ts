import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const { app } = createTestApp();

describe('/api/me', () => {
  it('returns the signed-in user', async () => {
    const { agent, user } = await signUp(app);
    const response = await agent.get('/api/me');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(user);
  });

  it('needs a session', async () => {
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('changes the name and the language', async () => {
    const { agent } = await signUp(app);
    const response = await agent.patch('/api/me').send({ name: '  Bà Hoa ', locale: 'en' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Bà Hoa', locale: 'en' });
    expect((await agent.get('/api/me')).body.name).toBe('Bà Hoa');
  });

  it('refuses an empty change', async () => {
    const { agent } = await signUp(app);
    expect((await agent.patch('/api/me').send({})).status).toBe(400);
  });

  it('limits each user to the per-user rate', async () => {
    const limited = createTestApp({ rateLimits: { auth: 1000, user: 2 } }).app;
    const { agent } = await signUp(limited);
    await agent.get('/api/me');
    await agent.get('/api/me');
    const response = await agent.get('/api/me');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
