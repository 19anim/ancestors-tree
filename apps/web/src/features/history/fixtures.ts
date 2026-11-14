import type { HistoryEntry } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import type { MockRoutes } from '../../test/api';
import { CLAN_ID, fixturePerson, GRANDPA, ME, SON } from '../tree/fixtures';

/** Another member of the family tree, the author of the newest change. */
export const AUTHOR_ID = '64b7f0c2a1b2c3d4e5f60720';

export function historyEntry(
  seq: number,
  op: Op,
  inverse: Op,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    seq,
    userId: ME.id,
    authorName: ME.name,
    createdAt: `2026-11-1${seq}T08:00:00.000Z`,
    op,
    inverse,
    ...overrides,
  };
}

/** The changes behind FAMILY's version 3, newest first (only the three the tests need). */
export const FAMILY_HISTORY: HistoryEntry[] = [
  historyEntry(
    3,
    { type: 'updatePerson', payload: { id: SON, changes: { fullName: 'Nguyễn Văn Nam' } } },
    { type: 'updatePerson', payload: { id: SON, changes: { fullName: 'Nguyễn Văn Năm' } } },
    { userId: AUTHOR_ID, authorName: 'Trần Minh' },
  ),
  historyEntry(
    2,
    { type: 'setProgenitor', payload: { personId: GRANDPA } },
    { type: 'setProgenitor', payload: { personId: null } },
  ),
  historyEntry(
    1,
    { type: 'addPerson', payload: fixturePerson(GRANDPA, 'Nguyễn Văn Tư') },
    { type: 'deletePerson', payload: { id: GRANDPA } },
  ),
];

/** One page of history, newest first. */
export function historyRoutes(entries: HistoryEntry[] = FAMILY_HISTORY): MockRoutes {
  return {
    [`GET /clans/${CLAN_ID}/history`]: () => ({ body: { entries, nextBefore: null } }),
  };
}
