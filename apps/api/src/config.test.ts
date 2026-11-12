import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: '0.0.0-dev',
      CLOUDINARY_FOLDER: 'ancestors-tree/dev',
    });
  });

  it('accepts MongoDB and Cloudinary settings', () => {
    const config = loadConfig({
      MONGODB_URI:
        'mongodb+srv://app:pw@cluster0.abcde.mongodb.net/ancestors-tree-dev?retryWrites=true',
      CLOUDINARY_URL: 'cloudinary://123456789012345:abcDEF_123-xyz@my-cloud',
      CLOUDINARY_FOLDER: 'ancestors-tree/prod',
    });
    expect(config.MONGODB_URI).toMatch(/^mongodb\+srv:/);
    expect(config.CLOUDINARY_URL).toMatch(/^cloudinary:/);
    expect(config.CLOUDINARY_FOLDER).toBe('ancestors-tree/prod');
  });

  it('treats empty MongoDB and Cloudinary values as not set', () => {
    const config = loadConfig({ MONGODB_URI: '', CLOUDINARY_URL: '' });
    expect(config.MONGODB_URI).toBeUndefined();
    expect(config.CLOUDINARY_URL).toBeUndefined();
  });

  it('requires a database name in MONGODB_URI', () => {
    expect(() =>
      loadConfig({
        MONGODB_URI: 'mongodb+srv://app:pw@cluster0.abcde.mongodb.net/?retryWrites=true',
      }),
    ).toThrow(/MONGODB_URI/);
  });

  it('rejects a malformed CLOUDINARY_URL without echoing the secret', () => {
    let message = '';
    try {
      loadConfig({ CLOUDINARY_URL: 'https://top-secret-value@my-cloud' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/CLOUDINARY_URL/);
    expect(message).not.toContain('top-secret-value');
  });

  it('rejects a CLOUDINARY_FOLDER with leading or trailing slashes', () => {
    expect(() => loadConfig({ CLOUDINARY_FOLDER: '/ancestors-tree/' })).toThrow(
      /CLOUDINARY_FOLDER/,
    );
  });

  it('coerces PORT from a string', () => {
    expect(loadConfig({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws a readable error for invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid environment variables/);
  });
});
