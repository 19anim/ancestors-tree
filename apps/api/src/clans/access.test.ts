import cookieParser from 'cookie-parser';
import express from 'express';
import { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../http/errorHandler.ts';
import { getLocals } from '../http/locals.ts';
import { Membership } from '../models/Membership.ts';
import { useTestDatabase } from '../test/database.ts';
import { createRequireClanRole } from './access.ts';

useTestDatabase();

const userId = new Types.ObjectId().toString();
const clanId = new Types.ObjectId().toString();

const app = express();
app.use(cookieParser());
app.use((_req, res, next) => {
  getLocals(res).userId = userId;
  next();
});
app.get('/clans/:id', createRequireClanRole('editor'), (_req, res) => {
  res.json(getLocals(res).membership);
});
app.use(createErrorHandler(pino({ level: 'silent' })));

describe('requireClanRole', () => {
  it('lets a member with the role or higher through', async () => {
    await Membership.create({ clanId, userId, role: 'owner' });
    const response = await request(app).get(`/clans/${clanId}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ clanId, userId, role: 'owner' });
  });

  it('answers 403 to a member with a lower role', async () => {
    await Membership.create({ clanId, userId, role: 'viewer' });
    const response = await request(app).get(`/clans/${clanId}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 404 to non-members and malformed ids, so clans cannot be probed', async () => {
    for (const id of [clanId, 'not-an-id']) {
      const response = await request(app).get(`/clans/${id}`);
      expect(response.status, id).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });
});
