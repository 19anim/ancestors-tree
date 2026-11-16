import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, SIBLINGS, SISTER, SON } from './fixtures';
import { availableActions } from './usePersonActions';

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

describe('availableActions', () => {
  it('offers Add parent on the progenitor to the Owner only', () => {
    expect(availableActions(tree, GRANDPA, true)).toEqual([
      'addChild',
      'addSpouse',
      'addParent',
      'changeRelationship',
      'delete',
    ]);
    expect(availableActions(tree, GRANDPA, false)).toEqual([
      'addChild',
      'addSpouse',
      'changeRelationship',
      'delete',
    ]);
  });

  it('does not offer Add parent to in-laws or to someone with both parents', () => {
    expect(availableActions(tree, GRANDMA, true)).not.toContain('addParent');
    expect(availableActions(tree, SON, true)).not.toContain('addParent');
  });

  it('offers Change relationship… after Add parent, to every person', () => {
    expect(availableActions(tree, SON, false)).toEqual([
      'addChild',
      'addSpouse',
      'changeRelationship',
      'delete',
    ]);
    expect(availableActions(tree, LOOSE, false)).toEqual([
      'addChild',
      'addSpouse',
      'addParent',
      'changeRelationship',
      'delete',
    ]);
  });

  it('offers it to an unlinked person without parents', () => {
    expect(availableActions(tree, LOOSE, false)).toContain('addParent');
  });

  it('offers moving among siblings only towards a sibling', () => {
    const tree = treeStateFromLists(SIBLINGS.progenitorId, SIBLINGS.persons, SIBLINGS.unions);
    expect(availableActions(tree, SON, false)).toEqual([
      'addChild',
      'addSpouse',
      'changeRelationship',
      'moveLater',
      'delete',
    ]);
    expect(availableActions(tree, SISTER, false)).toEqual([
      'addChild',
      'addSpouse',
      'changeRelationship',
      'moveEarlier',
      'delete',
    ]);
    expect(availableActions(tree, SON, true)).toContain('moveLater');
    expect(availableActions(tree, SON, true)).not.toContain('moveEarlier');
    expect(availableActions(tree, SISTER, true)).toContain('moveEarlier');
    expect(availableActions(tree, SISTER, true)).not.toContain('moveLater');
  });
});
