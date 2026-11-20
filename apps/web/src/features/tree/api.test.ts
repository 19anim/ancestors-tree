import { OPS_PAGE_SIZE } from '@ancestors-tree/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { fetchOpsSince, treeFromResponse } from './api';
import { CLAN_ID, FAMILY, GRANDPA, remoteEntry } from './fixtures';

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

  it('stops paging when a full page does not move past the last seq', async () => {
    const choose = { type: 'setProgenitor' as const, payload: { personId: GRANDPA } };
    let reads = 0;
    mockApi({
      [`GET /clans/${CLAN_ID}/ops`]: () => {
        reads += 1;
        // A broken server: a full page that never advances. Bounded, so a missing guard ends.
        const count = reads <= 3 ? OPS_PAGE_SIZE : 0;
        return { body: Array.from({ length: count }, () => remoteEntry(2, choose)) };
      },
    });
    const entries = await fetchOpsSince(CLAN_ID, 3);
    expect(reads).toBe(1);
    expect(entries).toHaveLength(OPS_PAGE_SIZE);
  });
});

describe('treeFromResponse', () => {
  it("keeps the clan's theme, and reads a response without one as the defaults", () => {
    const tree = treeFromResponse({ ...FAMILY, theme: { surface: 'fridge' } });
    expect(tree.theme).toEqual({ surface: 'fridge' });
    expect(Object.keys(tree.persons)).toHaveLength(FAMILY.persons.length);
    expect(treeFromResponse(FAMILY).theme).toEqual({});
  });
});
