import { vi } from 'vitest';

export interface MockReply {
  status?: number;
  body?: unknown;
}

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/** Handlers keyed by "METHOD /path" (no /api prefix, no query string). */
export type MockRoutes = Record<
  string,
  (call: ApiCall & { url: URL }) => MockReply | Promise<MockReply>
>;

export function apiErrorReply(code: string, status: number, message = code): MockReply {
  return { status, body: { error: { code, message } } };
}

export const UNAUTHENTICATED_REPLY = apiErrorReply('UNAUTHENTICATED', 401, 'Sign in to continue');

const DEFAULT_ROUTES: MockRoutes = {
  'GET /health': () => ({
    body: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, database: 'connected' },
  }),
  'GET /me': () => UNAUTHENTICATED_REPLY,
  'POST /auth/refresh': () => UNAUTHENTICATED_REPLY,
  'GET /auth/providers': () => ({ body: { google: false } }),
};

/**
 * Stubs fetch with a route table. Unknown calls answer 404 and are listed in `unhandled`, so a
 * test can assert `expect(api.unhandled).toEqual([])`. Call vi.unstubAllGlobals() in afterEach.
 */
export function mockApi(routes: MockRoutes = {}) {
  const table: MockRoutes = { ...DEFAULT_ROUTES, ...routes };
  const calls: ApiCall[] = [];
  const unhandled: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init.method ?? 'GET').toUpperCase();
      const path = url.pathname.replace(/^\/api/, '');
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      const call = { method, path, body };
      calls.push(call);
      const handler = table[`${method} ${path}`];
      const reply = handler
        ? await handler({ ...call, url })
        : (unhandled.push(`${method} ${path}`), apiErrorReply('NOT_FOUND', 404));
      const status = reply.status ?? 200;
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(reply.body ?? null), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
    }),
  );
  return { calls, unhandled };
}
