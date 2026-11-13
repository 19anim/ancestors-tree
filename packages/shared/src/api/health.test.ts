import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health.ts';

describe('HealthResponseSchema', () => {
  it('accepts a healthy response', () => {
    const body = { status: 'ok', version: '1.2.3', uptimeSeconds: 42, database: 'connected' };
    expect(HealthResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a negative uptime', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      version: '1',
      uptimeSeconds: -1,
      database: 'connected',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown database state', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      version: '1',
      uptimeSeconds: 1,
      database: 'sleeping',
    });
    expect(result.success).toBe(false);
  });
});
