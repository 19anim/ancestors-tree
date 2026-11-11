import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError, zodIssuesToDetails } from './AppError.ts';
import { createErrorHandler } from './errorHandler.ts';
import { notFoundHandler } from './notFound.ts';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/forbidden', () => {
    throw new AppError('FORBIDDEN', 'Editors only');
  });
  app.get('/async-conflict', async () => {
    throw new AppError('VERSION_CONFLICT', 'Tree is at version 43');
  });
  app.get('/invalid', () => {
    throw new AppError('VALIDATION_ERROR', 'Invalid request body', [
      { path: 'body.name', message: 'Too small' },
    ]);
  });
  app.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

describe('error handling', () => {
  const app = buildTestApp();

  it('serializes an AppError with its status and code', async () => {
    const response = await request(app).get('/forbidden');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Editors only' } });
  });

  it('handles errors thrown from async handlers', async () => {
    const response = await request(app).get('/async-conflict');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('includes validation details', async () => {
    const response = await request(app).get('/invalid');
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ path: 'body.name', message: 'Too small' }]);
  });

  it('hides unexpected error messages behind INTERNAL_ERROR', async () => {
    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('turns malformed JSON into VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Malformed JSON body',
    });
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found: GET /does-not-exist',
    });
  });
});

describe('zodIssuesToDetails', () => {
  it('joins issue paths under a prefix', () => {
    const details = zodIssuesToDetails(
      [
        { path: ['name'], message: 'Too small' },
        { path: [], message: 'Required' },
      ],
      'body',
    );
    expect(details).toEqual([
      { path: 'body.name', message: 'Too small' },
      { path: 'body', message: 'Required' },
    ]);
  });
});
