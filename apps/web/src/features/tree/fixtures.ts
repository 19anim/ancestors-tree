import type { Clan, OperationEntry, TreeResponse } from '@ancestors-tree/shared';
import type { Op, Person } from '@ancestors-tree/shared/tree';
import type { MockRoutes } from '../../test/api';

export const CLAN_ID = '64b7f0c2a1b2c3d4e5f60001';
export const ME = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};
/** Someone else editing the same family tree. */
export const OTHER_USER_ID = '64b7f0c2a1b2c3d4e5f60719';
export const CLAN: Clan = {
  id: CLAN_ID,
  name: 'Họ Nguyễn',
  hometown: 'Nam Định',
  description: '',
  role: 'owner',
  memberCount: 2,
  createdAt: '2026-11-13T08:00:00.000Z',
};

export const GRANDPA = '64b7f0c2a1b2c3d4e5f6a001';
export const GRANDMA = '64b7f0c2a1b2c3d4e5f6a002';
export const SON = '64b7f0c2a1b2c3d4e5f6a003';
export const LOOSE = '64b7f0c2a1b2c3d4e5f6a009';
export const PARENTS_UNION = '64b7f0c2a1b2c3d4e5f6b001';

export function fixturePerson(
  id: string,
  fullName: string,
  overrides: Partial<Person> = {},
): Person {
  return {
    id,
    fullName,
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

/** Grandpa Tư (progenitor) and grandma Hoa with their son Nam; Bình is not linked yet. */
export const FAMILY: TreeResponse = {
  version: 3,
  progenitorId: GRANDPA,
  persons: [
    fixturePerson(GRANDPA, 'Nguyễn Văn Tư', {
      birth: { source: 'approx', approxYear: 1931 },
      death: { isDeceased: true, date: { source: 'approx', approxYear: 2004 } },
    }),
    fixturePerson(GRANDMA, 'Lê Thị Hoa', { gender: 'female' }),
    fixturePerson(SON, 'Nguyễn Văn Nam', { parentUnionId: PARENTS_UNION }),
    fixturePerson(LOOSE, 'Trần Văn Bình'),
  ],
  unions: [{ id: PARENTS_UNION, partnerIds: [GRANDPA, GRANDMA], order: 1, status: 'married' }],
};

export const LOOSE_WIFE = '64b7f0c2a1b2c3d4e5f6a00b';
export const LOOSE_CHILD = '64b7f0c2a1b2c3d4e5f6a00c';
export const LOOSE_UNION = '64b7f0c2a1b2c3d4e5f6b00a';

/** FAMILY, where Bình (not linked) has a wife and a son: one loose branch of three. */
export const LOOSE_BRANCH: TreeResponse = {
  ...FAMILY,
  persons: [
    ...FAMILY.persons,
    fixturePerson(LOOSE_WIFE, 'Phạm Thị Cúc', { gender: 'female' }),
    fixturePerson(LOOSE_CHILD, 'Trần Văn Dũng', { parentUnionId: LOOSE_UNION }),
  ],
  unions: [
    ...FAMILY.unions,
    { id: LOOSE_UNION, partnerIds: [LOOSE, LOOSE_WIFE], order: 1, status: 'married' },
  ],
};

export const EMPTY_TREE_RESPONSE: TreeResponse = {
  version: 0,
  progenitorId: null,
  persons: [],
  unions: [],
};

/** One entry of GET /ops: a change someone saved at `seq`. */
export function remoteEntry(seq: number, op: Op, userId: string = OTHER_USER_ID): OperationEntry {
  return { seq, userId, createdAt: '2026-11-14T08:00:00.000Z', op };
}

/** Routes for a signed-in owner looking at one family tree. */
export function treeRoutes(tree: TreeResponse = FAMILY, clan: Clan = CLAN): MockRoutes {
  return {
    'GET /me': () => ({ body: ME }),
    [`GET /clans/${CLAN_ID}`]: () => ({ body: clan }),
    [`GET /clans/${CLAN_ID}/tree`]: () => ({ body: tree }),
    // Nothing was saved by anyone else: a rebase after a 409 only resends.
    [`GET /clans/${CLAN_ID}/ops`]: () => ({ body: [] }),
  };
}
