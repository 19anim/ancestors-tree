import { describe, expect, it } from 'vitest';
import { ApiError, errorCodeForStatus, errorMessageKey, shouldRetryQuery } from './apiError';

describe('apiError', () => {
  it('maps statuses to codes when the server sends an unknown code', () => {
    expect(errorCodeForStatus(400)).toBe('VALIDATION_ERROR');
    expect(errorCodeForStatus(401)).toBe('UNAUTHENTICATED');
    expect(errorCodeForStatus(403)).toBe('FORBIDDEN');
    expect(errorCodeForStatus(409)).toBe('VERSION_CONFLICT');
    expect(errorCodeForStatus(422)).toBe('RULE_VIOLATION');
    expect(errorCodeForStatus(404)).toBe('NOT_FOUND');
    expect(errorCodeForStatus(429)).toBe('RATE_LIMITED');
    expect(errorCodeForStatus(503)).toBe('INTERNAL_ERROR');
    expect(errorCodeForStatus(418)).toBe('INVALID_RESPONSE');
  });

  it('retries server and network errors once, never client errors', () => {
    expect(shouldRetryQuery(0, new ApiError('NOT_FOUND', 'x', 404))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('INTERNAL_ERROR', 'x', 500))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError('NETWORK_ERROR', 'x', 0))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError('NETWORK_ERROR', 'x', 0))).toBe(false);
  });

  it('keeps validation details', () => {
    const error = new ApiError('VALIDATION_ERROR', 'Invalid', 400, [
      { path: 'body.email', message: 'Invalid email' },
    ]);
    expect(error.details).toEqual([{ path: 'body.email', message: 'Invalid email' }]);
    expect(errorMessageKey(error)).toBe('errors.VALIDATION_ERROR');
  });
});
