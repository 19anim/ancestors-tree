import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, fixturePerson, GRANDMA, GRANDPA, PARENTS_UNION, SON } from './fixtures';
import { isRelativeKey, relativeTarget } from './relativeNav';

// The traversal itself is tested in packages/shared (relatives.test.ts); here, the keys.
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
  it('maps ↑ to the parent, ↓ to the eldest child, ← and → to the siblings', () => {
    expect(relativeTarget(tree, SON, 'ArrowUp')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDPA, 'ArrowDown')).toBe(SON);
    expect(relativeTarget(tree, SON, 'ArrowRight')).toBe(DAUGHTER);
    expect(relativeTarget(tree, DAUGHTER, 'ArrowLeft')).toBe(SON);
    expect(relativeTarget(tree, GRANDMA, 'ArrowLeft')).toBe(GRANDPA);
  });

  it('knows only the four arrow keys', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].every(isRelativeKey)).toBe(true);
    expect(isRelativeKey('Enter')).toBe(false);
    expect(isRelativeKey('toString')).toBe(false);
  });
});
