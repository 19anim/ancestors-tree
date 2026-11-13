import { describe, expect, it } from 'vitest';
import { buildTreeIndex, classifyLineage, computeGenerations } from './lineage.ts';
import { makePerson, makeUnion, testId, treeOf } from './testing.ts';

const A = testId(1);
const B = testId(2);
const C = testId(3);
const D = testId(4);
const E = testId(5);
const F = testId(6);
const G = testId(7);
const H = testId(8);
const X = testId(9);
const Y = testId(10);
const Z = testId(11);
const U1 = testId(101); // A + B → C, D
const U2 = testId(102); // C + E → F
const U3 = testId(103); // D + G → H (D is a daughter who married out)
const U4 = testId(104); // Y + Z, not linked to anyone

/**
 *            A ═ B                 X        Y ═ Z
 *         ┌────┴────┐
 *     C ═ E       D ═ G
 *       │           │
 *       F           H
 */
function family() {
  return treeOf(
    [
      makePerson(A),
      makePerson(B, { gender: 'female' }),
      makePerson(C, { parentUnionId: U1, siblingOrder: 2 }),
      makePerson(D, { parentUnionId: U1, siblingOrder: 1, gender: 'female' }),
      makePerson(E, { gender: 'female' }),
      makePerson(F, { parentUnionId: U2 }),
      makePerson(G),
      makePerson(H, { parentUnionId: U3 }),
      makePerson(X),
      makePerson(Y),
      makePerson(Z, { gender: 'female' }),
    ],
    [makeUnion(U1, [A, B]), makeUnion(U2, [C, E]), makeUnion(U3, [D, G]), makeUnion(U4, [Y, Z])],
    A,
  );
}

describe('buildTreeIndex', () => {
  it('lists unions by order and children by sibling order', () => {
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(B, { parentUnionId: U1 }),
        makePerson(C, { parentUnionId: U1, siblingOrder: 2 }),
        makePerson(D, { parentUnionId: U1, siblingOrder: 1 }),
      ],
      [makeUnion(U2, [A], { order: 2 }), makeUnion(U1, [A], { order: 1 })],
    );
    const index = buildTreeIndex(tree);
    expect(index.unionsOf(A).map((union) => union.id)).toEqual([U1, U2]);
    // Without a sibling order, B comes last.
    expect(index.childrenOf(U1).map((person) => person.id)).toEqual([D, C, B]);
    expect(index.unionsOf(X)).toEqual([]);
    expect(index.childrenOf(U4)).toEqual([]);
  });
});

describe('computeGenerations', () => {
  it('counts down from the progenitor; spouses share their partner’s generation', () => {
    const generations = computeGenerations(family());
    expect(Object.fromEntries(generations)).toEqual({
      [A]: 1,
      [B]: 1,
      [C]: 2,
      [D]: 2,
      [E]: 2,
      [G]: 2,
      [F]: 3,
      [H]: 3,
    });
  });

  it('is empty without a progenitor', () => {
    expect(computeGenerations({ ...family(), progenitorId: null }).size).toBe(0);
  });

  it('counts someone who is both a spouse and a descendant by descent', () => {
    // A → C (U1, A alone) and D; C → F (U2, C alone). D marries F (U3).
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1 }),
        makePerson(D, { parentUnionId: U1 }),
        makePerson(F, { parentUnionId: U2 }),
      ],
      [makeUnion(U1, [A]), makeUnion(U2, [C]), makeUnion(U3, [D, F])],
      A,
    );
    expect(computeGenerations(tree).get(F)).toBe(3);
    expect(classifyLineage(tree).get(F)).toBe('blood');
  });
});

describe('classifyLineage', () => {
  it('sorts everyone into blood, in-law and unlinked', () => {
    expect(Object.fromEntries(classifyLineage(family()))).toEqual({
      [A]: 'blood',
      [B]: 'in-law',
      [C]: 'blood',
      [D]: 'blood',
      [E]: 'in-law',
      [F]: 'blood',
      [G]: 'in-law',
      [H]: 'blood',
      [X]: 'unlinked',
      [Y]: 'unlinked',
      [Z]: 'unlinked',
    });
  });

  it('calls everyone unlinked until a progenitor is chosen', () => {
    const lineage = classifyLineage({ ...family(), progenitorId: null });
    expect(new Set(lineage.values())).toEqual(new Set(['unlinked']));
    expect(lineage.size).toBe(11);
  });

  it('accepts a prebuilt index', () => {
    const tree = family();
    expect(classifyLineage(tree, buildTreeIndex(tree))).toEqual(classifyLineage(tree));
  });
});
