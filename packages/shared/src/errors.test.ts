import { describe, expect, it } from 'vitest';
import { ApiErrorBodySchema, ERROR_CODE_LIST, ERROR_CODES } from './errors.ts';

describe('ERROR_CODES', () => {
  it('lists every code in a stable order', () => {
    expect(ERROR_CODE_LIST).toEqual([
      'VALIDATION_ERROR',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VERSION_CONFLICT',
      'RULE_VIOLATION',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]);
  });

  it('maps every code to an HTTP error status', () => {
    for (const code of ERROR_CODE_LIST) {
      const { status } = ERROR_CODES[code];
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
  });

  it('documents the meaning and client handling of every code', () => {
    for (const code of ERROR_CODE_LIST) {
      expect(ERROR_CODES[code].description.length, code).toBeGreaterThan(10);
      expect(ERROR_CODES[code].clientAction.length, code).toBeGreaterThan(5);
    }
  });
});

describe('ApiErrorBodySchema', () => {
  it('accepts a well-formed error body', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
    expect(ApiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts validation details', () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: [{ path: 'body.name', message: 'Too small' }],
      },
    };
    expect(ApiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('rejects unknown error codes', () => {
    const result = ApiErrorBodySchema.safeParse({ error: { code: 'TEAPOT', message: 'nope' } });
    expect(result.success).toBe(false);
  });
});
