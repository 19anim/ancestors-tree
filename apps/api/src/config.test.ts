import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: '0.0.0-dev',
    });
  });

  it('coerces PORT from a string', () => {
    expect(loadConfig({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws a readable error for invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid environment variables/);
  });
});
