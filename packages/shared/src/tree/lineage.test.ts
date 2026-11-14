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
const U5 = testId(105); // E's own parents (in-law edge case)
const U6 = testId(106); // C + H, two blood members married
const U7 = testId(107); // C + G, C's second marriage
const U8 = testId(108); // E + X, the in-law's marriage to a non-blood partner
const K = testId(15);
const M = testId(12);
const N = testId(13);
const O = testId(14);

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

  it('counts someone first stamped as a spouse by descent when the descent is walked later', () => {
    // siblingOrder puts D before C in the walk, so D stamps F as a spouse at generation 2 first;
    // C is walked next and finds F as its child, which must overwrite that stamp with 3.
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1, siblingOrder: 2 }),
        makePerson(D, { parentUnionId: U1, siblingOrder: 1 }),
        makePerson(F, { parentUnionId: U2 }),
      ],
      [makeUnion(U1, [A]), makeUnion(U2, [C]), makeUnion(U3, [D, F])],
      A,
    );
    expect(Object.fromEntries(computeGenerations(tree))).toEqual({
      [A]: 1,
      [D]: 2,
      [C]: 2,
      [F]: 3,
    });
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

  it('leaves an in-law’s own parents and siblings unlinked and out of the generations', () => {
    // E marries C; E's parents (N, O) and sibling M are not reached because in-laws do not expand.
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1 }),
        makePerson(E, { parentUnionId: U5, gender: 'female' }),
        makePerson(M, { parentUnionId: U5 }),
        makePerson(N),
        makePerson(O, { gender: 'female' }),
      ],
      [makeUnion(U1, [A]), makeUnion(U2, [C, E]), makeUnion(U5, [N, O])],
      A,
    );
    expect(Object.fromEntries(computeGenerations(tree))).toEqual({ [A]: 1, [C]: 2, [E]: 2 });
    expect(Object.fromEntries(classifyLineage(tree))).toEqual({
      [A]: 'blood',
      [C]: 'blood',
      [E]: 'in-law',
      [M]: 'unlinked',
      [N]: 'unlinked',
      [O]: 'unlinked',
    });
  });

  it('keeps two blood members who marry each other blood, each at their own generation', () => {
    // C (generation 2) marries H (generation 3, child of D); both are walked as blood.
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1, siblingOrder: 1 }),
        makePerson(D, { parentUnionId: U1, siblingOrder: 2, gender: 'female' }),
        makePerson(H, { parentUnionId: U3, gender: 'female' }),
      ],
      [makeUnion(U1, [A]), makeUnion(U3, [D]), makeUnion(U6, [C, H])],
      A,
    );
    expect(Object.fromEntries(computeGenerations(tree))).toEqual({
      [A]: 1,
      [C]: 2,
      [D]: 2,
      [H]: 3,
    });
    expect(Object.fromEntries(classifyLineage(tree))).toEqual({
      [A]: 'blood',
      [C]: 'blood',
      [D]: 'blood',
      [H]: 'blood',
    });
  });

  it('counts the children of both marriages of a blood member as blood, one generation down', () => {
    // C marries E (U2) and then G (U7); F and H are C's children from those two unions.
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1 }),
        makePerson(E, { gender: 'female' }),
        makePerson(F, { parentUnionId: U2 }),
        makePerson(G),
        makePerson(H, { parentUnionId: U7 }),
      ],
      [makeUnion(U1, [A]), makeUnion(U2, [C, E]), makeUnion(U7, [C, G])],
      A,
    );
    expect(Object.fromEntries(computeGenerations(tree))).toEqual({
      [A]: 1,
      [C]: 2,
      [E]: 2,
      [G]: 2,
      [F]: 3,
      [H]: 3,
    });
    expect(Object.fromEntries(classifyLineage(tree))).toEqual({
      [A]: 'blood',
      [C]: 'blood',
      [E]: 'in-law',
      [G]: 'in-law',
      [F]: 'blood',
      [H]: 'blood',
    });
  });

  it('leaves a child of an in-law from another marriage unlinked', () => {
    // E is C's in-law; E's second marriage to X produces K, but E is never expanded, so K and X stay unlinked.
    const tree = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1 }),
        makePerson(E, { gender: 'female' }),
        makePerson(X),
        makePerson(K, { parentUnionId: U8 }),
      ],
      [makeUnion(U1, [A]), makeUnion(U2, [C, E]), makeUnion(U8, [E, X])],
      A,
    );
    expect(Object.fromEntries(classifyLineage(tree))).toEqual({
      [A]: 'blood',
      [C]: 'blood',
      [E]: 'in-law',
      [X]: 'unlinked',
      [K]: 'unlinked',
    });
    expect(computeGenerations(tree).has(K)).toBe(false);
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
