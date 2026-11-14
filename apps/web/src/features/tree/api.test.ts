import { OPS_PAGE_SIZE } from '@ancestors-tree/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { fetchOpsSince } from './api';
import { CLAN_ID, GRANDPA, remoteEntry } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOpsSince', () => {
  it('reads page after page until a short page', async () => {
    const choose = { type: 'setProgenitor' as const, payload: { personId: GRANDPA } };
    const api = mockApi({
      [`GET /clans/${CLAN_ID}/ops`]: ({ url }) => {
        const since = Number(url.searchParams.get('since'));
        const count = since === 3 ? OPS_PAGE_SIZE : 1;
        return {
          body: Array.from({ length: count }, (_, index) => remoteEntry(since + index + 1, choose)),
        };
      },
    });
    const entries = await fetchOpsSince(CLAN_ID, 3);
    expect(entries).toHaveLength(OPS_PAGE_SIZE + 1);
    expect(entries.at(-1)?.seq).toBe(OPS_PAGE_SIZE + 4);
    expect(api.calls.map((call) => call.method)).toEqual(['GET', 'GET']);
  });
});
