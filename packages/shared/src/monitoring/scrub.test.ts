import { describe, expect, it } from 'vitest';
import {
  REDACTED_EMAIL,
  REDACTED_TOKEN,
  redactEmails,
  redactInviteTokens,
  scrubErrorEvent,
} from './scrub.ts';

// Built from parts so no fixture looks like a real credential.
const TOKEN = ['Zx9', 'q-4_', 'Lm2'].join('');

describe('redactEmails', () => {
  it('replaces every email address and leaves the rest alone', () => {
    expect(
      redactEmails('E11000 duplicate key: lan.nguyen+tree@example.test, an@example.test'),
    ).toBe(`E11000 duplicate key: ${REDACTED_EMAIL}, ${REDACTED_EMAIL}`);
    expect(redactEmails('Cannot read properties of undefined (reading "x")')).toBe(
      'Cannot read properties of undefined (reading "x")',
    );
  });
});

describe('redactInviteTokens', () => {
  it('replaces the token in invite links and invite API paths', () => {
    expect(redactInviteTokens(`Failed to load https://example.test/join/${TOKEN}?x=1`)).toBe(
      `Failed to load https://example.test/join/${REDACTED_TOKEN}?x=1`,
    );
    expect(redactInviteTokens(`GET /api/invites/${TOKEN}/accept failed`)).toBe(
      `GET /api/invites/${REDACTED_TOKEN}/accept failed`,
    );
  });

  it('replaces the token in an encoded returnTo', () => {
    const returnTo = new URLSearchParams({ returnTo: `/join/${TOKEN}` }).toString();
    expect(redactInviteTokens(`/login?${returnTo}&lang=vi`)).toBe(
      `/login?returnTo=%2Fjoin%2F${REDACTED_TOKEN}&lang=vi`,
    );
  });

  it('replaces the value of a token parameter in the query or the hash', () => {
    expect(redactInviteTokens(`/reset-password#token=${TOKEN}`)).toBe(
      `/reset-password#token=${REDACTED_TOKEN}`,
    );
    expect(redactInviteTokens(`/x?a=1&token=${TOKEN}&b=2`)).toBe(
      `/x?a=1&token=${REDACTED_TOKEN}&b=2`,
    );
  });

  it('leaves other text alone', () => {
    const text = 'Cannot join /tree/abc: csrftoken=keep, invites 3, /join/ empty';
    expect(redactInviteTokens(text)).toBe(text);
  });
});

describe('scrubErrorEvent', () => {
  it('drops request data, breadcrumbs, extras and every user field but the id', () => {
    const event = {
      event_id: 'e1',
      release: 'abc123',
      message: 'Sign-in failed for lan@example.test',
      request: {
        url: '/api/invites/secret-token?returnTo=/x',
        data: '{"password":"x"}',
        cookies: { at: 'x' },
        headers: { cookie: 'at=x' },
        query_string: 'returnTo=/x',
      },
      user: { id: 'u1', email: 'lan@example.test', ip_address: '203.0.113.7', username: 'Lan' },
      breadcrumbs: [{ message: 'GET /api/me' }],
      extra: { body: { name: 'Nguyễn Thị Lan' } },
      exception: {
        values: [
          { type: 'MongoServerError', value: 'dup key: { email: "an@example.test" }' },
          { type: 'Error' },
        ],
      },
      tags: { boundary: 'route' },
    };
    expect(scrubErrorEvent(event)).toEqual({
      event_id: 'e1',
      release: 'abc123',
      message: `Sign-in failed for ${REDACTED_EMAIL}`,
      user: { id: 'u1' },
      exception: {
        values: [
          { type: 'MongoServerError', value: `dup key: { email: "${REDACTED_EMAIL}" }` },
          { type: 'Error' },
        ],
      },
      tags: { boundary: 'route' },
    });
  });

  it('sends no user at all when there is no id', () => {
    // Typed like an SDK user (every field optional), as real events are.
    const event: { user: { id?: string; email?: string } } = {
      user: { email: 'lan@example.test' },
    };
    expect(scrubErrorEvent(event)).toEqual({});
  });

  it('redacts invite tokens in the message and the exception values', () => {
    const event = {
      message: `Invite /join/${TOKEN} failed for lan@example.test`,
      exception: { values: [{ value: `GET /api/invites/${TOKEN} answered 500` }] },
    };
    expect(scrubErrorEvent(event)).toEqual({
      message: `Invite /join/${REDACTED_TOKEN} failed for ${REDACTED_EMAIL}`,
      exception: { values: [{ value: `GET /api/invites/${REDACTED_TOKEN} answered 500` }] },
    });
  });

  it('does not change the event it was given', () => {
    const event = { message: 'lan@example.test', user: { id: 'u1', email: 'lan@example.test' } };
    scrubErrorEvent(event);
    expect(event.user.email).toBe('lan@example.test');
  });
});
