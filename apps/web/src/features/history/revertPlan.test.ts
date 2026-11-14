import type { Op, SingleOp } from '@ancestors-tree/shared/tree';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { CLAN_ID, SON } from '../tree/fixtures';
import { FAMILY_HISTORY, historyEntry } from './fixtures';
import { buildRevertPlan, fetchRevertPlan, revertStepsOf } from './revertPlan';

const bio = (text: string): SingleOp => ({
  type: 'updatePerson',
  payload: { id: SON, changes: { bio: text } },
});
const batchOf = (ops: SingleOp[]): Op => ({ type: 'batch', payload: { ops } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildRevertPlan', () => {
  it('flattens the inverses newest first into one batch', () => {
    const entries = [
      historyEntry(5, bio('e'), bio('d')),
      historyEntry(4, batchOf([bio('b'), bio('c')]), batchOf([bio('c0'), bio('b0')])),
    ];
    expect(revertStepsOf(entries)).toEqual([bio('d'), bio('c0'), bio('b0')]);
    expect(buildRevertPlan(entries)).toEqual({
      kind: 'ready',
      op: batchOf([bio('d'), bio('c0'), bio('b0')]),
      changes: 2,
      atVersion: 5,
    });
  });

  it('sends a single step as itself, and has nothing to do without changes', () => {
    expect(buildRevertPlan([historyEntry(4, bio('b'), bio('a'))])).toMatchObject({
      kind: 'ready',
      op: bio('a'),
      changes: 1,
    });
    expect(buildRevertPlan([])).toEqual({ kind: 'nothing' });
  });

  it('refuses more than 500 steps', () => {
    const many = batchOf(Array.from({ length: 300 }, (_, i) => bio(String(i))));
    expect(buildRevertPlan([historyEntry(5, many, many), historyEntry(4, many, many)])).toEqual({
      kind: 'tooMany',
    });
  });
});

describe('fetchRevertPlan', () => {
  it('reads the pages back to the point, a hundred at a time', async () => {
    const [third, second, first] = FAMILY_HISTORY;
    const api = mockApi({
      [`GET /clans/${CLAN_ID}/history`]: ({ url }) =>
        url.searchParams.get('before') === '3'
          ? { body: { entries: [second, first], nextBefore: null } }
          : { body: { entries: [third], nextBefore: 3 } },
    });
    expect(await fetchRevertPlan(CLAN_ID, 1)).toEqual({
      kind: 'ready',
      op: batchOf([third!.inverse as SingleOp, second!.inverse as SingleOp]),
      changes: 2,
      atVersion: 3,
    });
    expect(api.calls.map((call) => call.path)).toHaveLength(2);
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.every((url) => url.includes('limit=100'))).toBe(true);
  });
});
