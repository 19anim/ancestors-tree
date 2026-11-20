import { createHmac } from 'node:crypto';

/** Built at runtime, never a secret-looking literal: GitHub secret scanning reads the repository. */
export const TEST_PROXY_SECRET = 'proxy-test-'.repeat(4);

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The claims Netlify signs, valid for a minute from `nowSeconds`. */
export function netlifyClaims(
  nowSeconds: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    deploy_context: 'production',
    exp: nowSeconds + 60,
    iss: 'netlify',
    netlify_id: 'test-site-id',
    site_url: 'https://site.example.test',
    ...overrides,
  };
}

/** A compact JWS (HMAC SHA-256) like the x-nf-sign header Netlify sends. */
export function signProxyToken(
  payload: Record<string, unknown>,
  {
    secret = TEST_PROXY_SECRET,
    header = { alg: 'HS256', typ: 'JWT' },
  }: { secret?: string; header?: Record<string, unknown> } = {},
): string {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}
