import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, fixturePerson, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';
import { isRelativeKey, relativeTarget } from './relativeNav';

// No siblingOrder on either child, so the chart sorts them by id: Nam (…a003), then Út.
const DAUGHTER = '64b7f0c2a1b2c3d4e5f6a004';
const tree = treeStateFromLists(
  FAMILY.progenitorId,
  [
    ...FAMILY.persons,
    fixturePerson(DAUGHTER, 'Nguyễn Thị Út', { gender: 'female', parentUnionId: PARENTS_UNION }),
  ],
  FAMILY.unions,
);

describe('relativeTarget', () => {
  it('moves up to the blood parent and down to the eldest child', () => {
    expect(relativeTarget(tree, SON, 'ArrowUp')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDPA, 'ArrowDown')).toBe(SON);
    expect(relativeTarget(tree, GRANDPA, 'ArrowUp')).toBeNull();
  });

  it('moves between siblings in chart order', () => {
    expect(relativeTarget(tree, SON, 'ArrowRight')).toBe(DAUGHTER);
    expect(relativeTarget(tree, DAUGHTER, 'ArrowLeft')).toBe(SON);
    expect(relativeTarget(tree, DAUGHTER, 'ArrowRight')).toBeNull();
  });

  it('moves from an in-law to the spouse, and never from or into the tray', () => {
    expect(relativeTarget(tree, GRANDMA, 'ArrowLeft')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDMA, 'ArrowRight')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDMA, 'ArrowDown')).toBeNull();
    expect(relativeTarget(tree, LOOSE, 'ArrowUp')).toBeNull();
  });

  it('never moves from the progenitor to parents or siblings in the tray', () => {
    // Bình and Út are grandpa Tư's parent and sister, not linked to the progenitor (spec §8).
    const ABOVE = '64b7f0c2a1b2c3d4e5f6b002';
    const SISTER = '64b7f0c2a1b2c3d4e5f6a000';
    const above = treeStateFromLists(
      FAMILY.progenitorId,
      [
        ...FAMILY.persons.map((person) =>
          person.id === GRANDPA ? { ...person, parentUnionId: ABOVE } : person,
        ),
        fixturePerson(SISTER, 'Nguyễn Thị Út', { gender: 'female', parentUnionId: ABOVE }),
      ],
      [...FAMILY.unions, { id: ABOVE, partnerIds: [LOOSE], order: 1, status: 'married' }],
    );
    expect(relativeTarget(above, GRANDPA, 'ArrowUp')).toBeNull();
    expect(relativeTarget(above, GRANDPA, 'ArrowLeft')).toBeNull();
    expect(relativeTarget(above, GRANDPA, 'ArrowRight')).toBeNull();
    expect(relativeTarget(above, GRANDPA, 'ArrowDown')).toBe(SON);
  });

  it('knows only the four arrow keys', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].every(isRelativeKey)).toBe(true);
    expect(isRelativeKey('Enter')).toBe(false);
    expect(isRelativeKey('Home')).toBe(false);
  });
});
