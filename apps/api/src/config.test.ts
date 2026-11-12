import { describe, expect, it } from 'vitest';
import { apiDocsEnabled, loadConfig, requireSetting } from './config.ts';

// Obviously fake values: credential-shaped fixtures get flagged by GitHub secret scanning.
const REQUIRED = {
  MONGODB_URI: 'mongodb+srv://db.example.test/ancestors-tree-dev?retryWrites=true',
  JWT_SECRET: 'test-only-secret-with-at-least-32-chars',
};

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('loadConfig', () => {
  it('applies defaults in tests, where the database and secret are optional', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: '0.0.0-dev',
      APP_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY_HOPS: 0,
      MAIL_FROM: 'AncestorsTree <onboarding@resend.dev>',
      CLOUDINARY_FOLDER: 'ancestors-tree/dev',
    });
  });

  it('requires MONGODB_URI and JWT_SECRET outside tests', () => {
    const message = messageOf(() => loadConfig({}));
    expect(message).toMatch(/MONGODB_URI is required/);
    expect(message).toMatch(/JWT_SECRET is required/);
    expect(loadConfig(REQUIRED).JWT_SECRET).toBe(REQUIRED.JWT_SECRET);
  });

  it('accepts every optional integration', () => {
    const config = loadConfig({
      ...REQUIRED,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://ancestorstree.netlify.app',
      TRUST_PROXY_HOPS: '2',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-google-secret',
      RESEND_API_KEY: 're_test',
      CLOUDINARY_URL: 'cloudinary://test-key:test-secret@example-cloud',
      CLOUDINARY_FOLDER: 'ancestors-tree/prod',
    });
    expect(config.TRUST_PROXY_HOPS).toBe(2);
    expect(config.GOOGLE_CLIENT_ID).toBe('test-client.apps.googleusercontent.com');
    expect(config.RESEND_API_KEY).toBe('re_test');
  });

  it('treats empty optional values as not set', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: '',
      JWT_SECRET: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      RESEND_API_KEY: '',
      CLOUDINARY_URL: '',
    });
    expect(config.MONGODB_URI).toBeUndefined();
    expect(config.JWT_SECRET).toBeUndefined();
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.RESEND_API_KEY).toBeUndefined();
  });

  it('requires a database name in MONGODB_URI', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, MONGODB_URI: 'mongodb+srv://db.example.test/?retryWrites=true' }),
    ).toThrow(/MONGODB_URI/);
  });

  it('rejects a short JWT_SECRET without echoing it', () => {
    const message = messageOf(() => loadConfig({ ...REQUIRED, JWT_SECRET: 'short-secret-value' }));
    expect(message).toMatch(/JWT_SECRET must be at least 32 characters/);
    expect(message).not.toContain('short-secret-value');
  });

  it('rejects a malformed CLOUDINARY_URL without echoing the secret', () => {
    const message = messageOf(() =>
      loadConfig({ NODE_ENV: 'test', CLOUDINARY_URL: 'https://top-secret-value@my-cloud' }),
    );
    expect(message).toMatch(/CLOUDINARY_URL/);
    expect(message).not.toContain('top-secret-value');
  });

  it('needs the Google client id and secret together', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' }),
    ).toThrow(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together/);
  });

  it('rejects an APP_ORIGIN with a path or trailing slash', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'https://ancestorstree.netlify.app/' }),
    ).toThrow(/APP_ORIGIN/);
  });

  it('rejects a CLOUDINARY_FOLDER with leading or trailing slashes', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', CLOUDINARY_FOLDER: '/ancestors-tree/' })).toThrow(
      /CLOUDINARY_FOLDER/,
    );
  });

  it('coerces PORT and keeps it in range', () => {
    expect(loadConfig({ NODE_ENV: 'test', PORT: '8080' }).PORT).toBe(8080);
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: 'abc' })).toThrow(
      /Invalid environment variables/,
    );
  });
});

describe('apiDocsEnabled', () => {
  it('is on outside production unless turned off', () => {
    expect(apiDocsEnabled(loadConfig({ NODE_ENV: 'test' }))).toBe(true);
    expect(apiDocsEnabled(loadConfig({ NODE_ENV: 'test', API_DOCS: 'off' }))).toBe(false);
  });

  it('is off in production unless turned on', () => {
    expect(apiDocsEnabled(loadConfig({ ...REQUIRED, NODE_ENV: 'production' }))).toBe(false);
    expect(
      apiDocsEnabled(loadConfig({ ...REQUIRED, NODE_ENV: 'production', API_DOCS: 'on' })),
    ).toBe(true);
  });
});

describe('requireSetting', () => {
  it('returns a present value and names a missing one', () => {
    expect(requireSetting('x', 'NAME')).toBe('x');
    expect(() => requireSetting(undefined, 'MONGODB_URI')).toThrow(/MONGODB_URI is not set/);
  });
});
