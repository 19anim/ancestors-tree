import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, SON } from './fixtures';
import { availableActions } from './usePersonActions';

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

describe('availableActions', () => {
  it('offers Add parent on the progenitor to the Owner only', () => {
    expect(availableActions(tree, GRANDPA, true)).toEqual([
      'addChild',
      'addSpouse',
      'addParent',
      'delete',
    ]);
    expect(availableActions(tree, GRANDPA, false)).toEqual(['addChild', 'addSpouse', 'delete']);
  });

  it('does not offer Add parent to in-laws or to someone with both parents', () => {
    expect(availableActions(tree, GRANDMA, true)).not.toContain('addParent');
    expect(availableActions(tree, SON, true)).not.toContain('addParent');
  });

  it('offers it to an unlinked person without parents', () => {
    expect(availableActions(tree, LOOSE, false)).toContain('addParent');
  });
});
