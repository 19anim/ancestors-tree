import { CurrentUserSchema, type CurrentUser } from '@ancestors-tree/shared';
import type { Express } from 'express';
import request from 'supertest';

export const TEST_PASSWORD = 'long-enough-password';

let counter = 0;

/** Registers a new user through the API; the agent keeps the session cookies. */
export async function signUp(
  app: Express,
  overrides: { email?: string; name?: string; locale?: 'vi' | 'en' } = {},
): Promise<{ agent: ReturnType<typeof request.agent>; user: CurrentUser }> {
  counter += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    email: `user${counter}@example.test`,
    password: TEST_PASSWORD,
    name: `User ${counter}`,
    ...overrides,
  });
  if (response.status !== 201) {
    throw new Error(`Sign-up failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { agent, user: CurrentUserSchema.parse(response.body) };
}

/** Set-Cookie headers by cookie name ("at" → "at=…; Path=/api; HttpOnly; SameSite=Lax"). */
export function setCookies(response: { headers: Record<string, unknown> }): Map<string, string> {
  const header = response.headers['set-cookie'];
  const list = Array.isArray(header) ? (header as string[]) : [];
  return new Map(list.map((cookie) => [cookie.slice(0, cookie.indexOf('=')), cookie]));
}

/** The value of a cookie in a Set-Cookie header. */
export function cookieValue(setCookie: string | undefined): string {
  if (!setCookie) throw new Error('Cookie was not set');
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}
