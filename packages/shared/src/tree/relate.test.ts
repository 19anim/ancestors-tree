import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import { buildTreeIndex } from './lineage.ts';
import { ALONE, relate, type RelateResult } from './relate.ts';
import type { TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

// Grandpa (1) + Grandma (2) → Son (3), Daughter (4). Son + Wife (5) → Kid (6). Loose (7).
const GRANDPA = testId(1);
const GRANDMA = testId(2);
const SON = testId(3);
const DAUGHTER = testId(4);
const WIFE = testId(5);
const KID = testId(6);
const LOOSE = testId(7);
const OLD = testId(101);
const YOUNG = testId(102);

function family(): TreeState {
  return treeOf(
    [
      makePerson(GRANDPA),
      makePerson(GRANDMA, { gender: 'female' }),
      makePerson(SON, { parentUnionId: OLD, siblingOrder: 1 }),
      makePerson(DAUGHTER, { gender: 'female', parentUnionId: OLD, siblingOrder: 2 }),
      makePerson(WIFE, { gender: 'female' }),
      makePerson(KID, { parentUnionId: YOUNG }),
      makePerson(LOOSE),
    ],
    [makeUnion(OLD, [GRANDPA, GRANDMA]), makeUnion(YOUNG, [SON, WIFE])],
    GRANDPA,
  );
}

/** Applies an ok result and checks the tree is still valid. */
function after(tree: TreeState, result: RelateResult): TreeState {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  const next = applyOp(tree, result.op).tree;
  expect(invariantViolations(next)).toEqual([]);
  return next;
}

function parentsOf(tree: TreeState, id: string): string[] {
  const unionId = tree.persons[id]?.parentUnionId;
  return unionId === undefined ? [] : [...(tree.unions[unionId]?.partnerIds ?? [])].sort();
}

function spousesOf(tree: TreeState, id: string): string[] {
  return buildTreeIndex(tree)
    .unionsOf(id)
    .flatMap((union) => union.partnerIds.filter((partner) => partner !== id))
    .sort();
}

describe('relate: blocks', () => {
  it('refuses the same person, someone missing, and a relation that already holds', () => {
    const tree = family();
    expect(relate(tree, SON, SON, 'child')).toEqual({ kind: 'blocked', reason: 'SAME_PERSON' });
    expect(relate(tree, SON, testId(99), 'child')).toEqual({
      kind: 'blocked',
      reason: 'PERSON_NOT_FOUND',
    });
    expect(relate(tree, SON, WIFE, 'spouse')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, SON, GRANDPA, 'child')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, GRANDPA, SON, 'parent')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
  });

  it('refuses a parent for an in-law', () => {
    expect(relate(family(), LOOSE, WIFE, 'parent')).toEqual({
      kind: 'blocked',
      reason: 'IN_LAW_PARENT',
    });
  });

  it('turns a cycle into a block with the server’s own code', () => {
    // Grandma as the child of Kid: Grandma would be her own ancestor.
    expect(relate(family(), GRANDMA, KID, 'child')).toEqual({ kind: 'blocked', reason: 'CYCLE' });
  });

  it('refuses a parent for the progenitor, from either side', () => {
    // Spec §7.6: the progenitor is generation 1; the Manager's "Add parent" adds a generation.
    const tree = family();
    const reason = { kind: 'blocked', reason: 'PROGENITOR_PARENT' };
    expect(relate(tree, LOOSE, GRANDPA, 'parent')).toEqual(reason);
    expect(relate(tree, GRANDPA, LOOSE, 'child')).toEqual(reason);
    // Even as the parent of someone the progenitor already parents (a would-be cycle).
    expect(relate(tree, SON, GRANDPA, 'parent')).toEqual(reason);
    expect(relate(tree, GRANDPA, KID, 'child')).toEqual(reason);
  });
});

describe('relate: child', () => {
  it('makes A the child of B’s only marriage, numbered after the siblings', () => {
    const tree = family();
    const result = relate(tree, LOOSE, GRANDPA, 'child');
    expect(result).toMatchObject({
      kind: 'ok',
      effect: { relation: 'child', personId: LOOSE, targetId: GRANDPA, withId: GRANDMA },
    });
    const next = after(tree, result);
    expect(parentsOf(next, LOOSE)).toEqual([GRANDPA, GRANDMA].sort());
    expect(next.persons[LOOSE]?.siblingOrder).toBe(3);
  });

  it('gives a person without a marriage a one-person union', () => {
    const tree = family();
    const next = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    expect(parentsOf(next, LOOSE)).toEqual([DAUGHTER]);
  });

  it('asks "with whom?" when B has two marriages, and uses the answer', () => {
    const SECOND = testId(103);
    const tree = applyOp(family(), {
      type: 'addUnion',
      payload: makeUnion(SECOND, [SON, LOOSE], { order: 2 }),
    }).tree;
    const asked = relate(tree, DAUGHTER, SON, 'child');
    expect(asked).toEqual({
      kind: 'ask',
      question: {
        kind: 'withWhom',
        unions: [
          { unionId: YOUNG, partnerId: WIFE },
          { unionId: SECOND, partnerId: LOOSE },
        ],
        alone: true,
      },
    });
    const withLoose = after(tree, relate(tree, DAUGHTER, SON, 'child', { union: SECOND }));
    expect(parentsOf(withLoose, DAUGHTER)).toEqual([SON, LOOSE].sort());
    const alone = after(tree, relate(tree, DAUGHTER, SON, 'child', { union: ALONE }));
    expect(parentsOf(alone, DAUGHTER)).toEqual([SON]);
    // A stale answer (a union that is not B's) asks again.
    expect(relate(tree, DAUGHTER, SON, 'child', { union: OLD }).kind).toBe('ask');
  });
});

describe('relate: parent', () => {
  it('adds A beside a single known parent, for B’s siblings too', () => {
    const tree = family();
    const solo = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    const SIBLING = testId(8);
    const withSibling = applyOp(solo, {
      type: 'addPerson',
      payload: makePerson(SIBLING, { parentUnionId: solo.persons[LOOSE]?.parentUnionId }),
    }).tree;
    const next = after(withSibling, relate(withSibling, SON, LOOSE, 'parent'));
    expect(parentsOf(next, LOOSE)).toEqual([DAUGHTER, SON].sort());
    expect(parentsOf(next, SIBLING)).toEqual([DAUGHTER, SON].sort());
  });

  it('joins A and the single parent’s existing marriage instead of making a second one', () => {
    const tree = family();
    const solo = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    const married = after(solo, relate(solo, SON, DAUGHTER, 'spouse', { shareChildren: false }));
    const result = relate(married, SON, LOOSE, 'parent');
    expect(result).toMatchObject({ kind: 'ok', effect: { withId: DAUGHTER } });
    const next = after(married, result);
    expect(parentsOf(next, LOOSE)).toEqual([DAUGHTER, SON].sort());
    // One union for the couple, and Daughter's emptied one-person union is gone.
    expect(spousesOf(next, DAUGHTER)).toEqual([SON]);
    expect(buildTreeIndex(next).unionsOf(DAUGHTER)).toHaveLength(1);
  });

  it('gives B without parents a one-person union of A', () => {
    const tree = family();
    const result = relate(tree, DAUGHTER, LOOSE, 'parent');
    expect(result).toMatchObject({ kind: 'ok', effect: { withId: null } });
    expect(parentsOf(after(tree, result), LOOSE)).toEqual([DAUGHTER]);
  });

  it('asks which parent A replaces, and moves only B', () => {
    const tree = family();
    expect(relate(tree, LOOSE, SON, 'parent')).toEqual({
      kind: 'ask',
      question: { kind: 'replaceParent', parentIds: [GRANDPA, GRANDMA] },
    });
    const result = relate(tree, LOOSE, SON, 'parent', { replaces: GRANDMA });
    expect(result).toMatchObject({ kind: 'ok', effect: { withId: GRANDPA } });
    const next = after(tree, result);
    expect(parentsOf(next, SON)).toEqual([GRANDPA, LOOSE].sort());
    // Daughter keeps both her parents.
    expect(parentsOf(next, DAUGHTER)).toEqual([GRANDPA, GRANDMA].sort());
  });
});

describe('relate: spouse', () => {
  it('marries two people in a new union', () => {
    const tree = family();
    const next = after(tree, relate(tree, LOOSE, DAUGHTER, 'spouse'));
    expect(spousesOf(next, DAUGHTER)).toEqual([LOOSE]);
  });

  it('lists the person already there first in a new marriage (they head a loose stack)', () => {
    const tree = family();
    const next = after(tree, relate(tree, LOOSE, DAUGHTER, 'spouse', {}));
    const [marriage] = buildTreeIndex(next).unionsOf(LOOSE);
    expect(marriage?.partnerIds).toEqual([DAUGHTER, LOOSE]);
  });

  it('asks whether children with one known parent are shared, and merges them when yes', () => {
    const tree = family();
    const solo = after(tree, relate(tree, LOOSE, DAUGHTER, 'child'));
    const asked = relate(solo, SON, DAUGHTER, 'spouse');
    expect(asked).toEqual({
      kind: 'ask',
      question: { kind: 'sharedChildren', childIds: [LOOSE] },
    });
    const shared = after(solo, relate(solo, SON, DAUGHTER, 'spouse', { shareChildren: true }));
    expect(parentsOf(shared, LOOSE)).toEqual([DAUGHTER, SON].sort());
    const apart = after(solo, relate(solo, SON, DAUGHTER, 'spouse', { shareChildren: false }));
    expect(parentsOf(apart, LOOSE)).toEqual([DAUGHTER]);
    expect(spousesOf(apart, DAUGHTER)).toEqual([SON]);
  });
});

describe('relate: replace, don’t stack', () => {
  it('turns a couple into parent and child, the shared children staying with the child', () => {
    const tree = family();
    // Wife becomes the parent of Son: Kid stays with Son, the person who becomes the child.
    const next = after(tree, relate(tree, WIFE, SON, 'parent', { replaces: GRANDMA }));
    expect(spousesOf(next, SON)).toEqual([]);
    expect(parentsOf(next, KID)).toEqual([SON]);
    expect(parentsOf(next, SON)).toEqual([GRANDPA, WIFE].sort());
  });

  it('moves a child who becomes a spouse out of the parent’s marriage', () => {
    const tree = family();
    const next = after(tree, relate(tree, DAUGHTER, GRANDMA, 'spouse'));
    // Daughter keeps Grandpa as her parent, in a one-person union.
    expect(parentsOf(next, DAUGHTER)).toEqual([GRANDPA]);
    expect(spousesOf(next, GRANDMA)).toEqual([DAUGHTER, GRANDPA].sort());
  });
});

describe('relate: sibling order', () => {
  it('moves A before or after B and renumbers the group', () => {
    const tree = family();
    const result = relate(tree, DAUGHTER, SON, 'before');
    expect(result).toMatchObject({ kind: 'ok', effect: { relation: 'before' } });
    const next = after(tree, result);
    expect(next.persons[DAUGHTER]?.siblingOrder).toBe(1);
    expect(next.persons[SON]?.siblingOrder).toBe(2);
    expect(relate(tree, DAUGHTER, SON, 'after')).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(relate(tree, KID, SON, 'before')).toEqual({ kind: 'blocked', reason: 'NOT_SIBLINGS' });
  });
});
