import express from 'express';
import { pino, type Logger } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError, zodIssuesToDetails } from './AppError.ts';
import { createErrorHandler } from './errorHandler.ts';
import { notFoundHandler } from './notFound.ts';

interface LogEntry {
  level: number;
  msg: string;
}

/** A pino logger that records entries in memory instead of printing them. */
function createRecordingLogger() {
  const entries: LogEntry[] = [];
  const logger = pino(
    { level: 'warn' },
    {
      write(line: string) {
        entries.push(JSON.parse(line) as LogEntry);
      },
    },
  );
  return { logger, entries };
}

const { warn: WARN, error: ERROR } = pino.levels.values;

function buildTestApp(logger: Logger = pino({ level: 'silent' })) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
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
  app.get('/rule', () => {
    throw new AppError(
      'RULE_VIOLATION',
      'Detach the children first',
      undefined,
      'PERSON_HAS_CHILDREN',
    );
  });
  app.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.get('/teapot', () => {
    // http-errors style: a client status the error is allowed to expose.
    throw Object.assign(new Error('internal detail'), { status: 418, expose: true });
  });
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
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

  it('includes the reason of a rule violation', async () => {
    const response = await request(app).get('/rule');
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: 'RULE_VIOLATION',
        message: 'Detach the children first',
        reason: 'PERSON_HAS_CHILDREN',
      },
    });
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

  it('turns a body over the size limit into VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(2048) }));
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body too large',
    });
  });

  it('turns an unsupported body charset into VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{"name":"a"}');
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Unsupported request body encoding',
    });
  });

  it('turns an unsupported content encoding into VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'x-unknown')
      .send('{"name":"a"}');
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Unsupported request body encoding',
    });
  });

  it('turns any other exposed client error into a generic VALIDATION_ERROR', async () => {
    const response = await request(app).get('/teapot');
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
    expect(JSON.stringify(response.body)).not.toContain('internal detail');
  });

  it('logs client errors at warn and unexpected errors at error', async () => {
    const { logger, entries } = createRecordingLogger();
    const recordingApp = buildTestApp(logger);

    await request(recordingApp)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(2048) }));
    expect(entries.map((e) => e.level)).toEqual([WARN]);

    entries.length = 0;
    await request(recordingApp).get('/boom');
    expect(entries.map((e) => e.level)).toEqual([ERROR]);
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
