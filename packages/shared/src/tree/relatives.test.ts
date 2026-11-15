import { describe, expect, it } from 'vitest';
import { relativeOf } from './relatives.ts';
import { makePerson, makeUnion, testId, treeOf } from './testing.ts';

const A = testId(1); // progenitor
const B = testId(2); // A's wife, an in-law
const C = testId(3); // their son
const D = testId(4); // their daughter, after C by id (no siblingOrder)
const E = testId(5); // C's wife, an in-law
const F = testId(6); // C and E's son
const X = testId(9); // not linked
const Y = testId(10); // A's sister, not linked
const U1 = testId(101); // A + B → C, D
const U2 = testId(102); // C + E → F
const U3 = testId(103); // A's parents: X → A, Y
const U4 = testId(104); // C's first union, childless

const family = treeOf(
  [
    makePerson(A),
    makePerson(B, { gender: 'female' }),
    makePerson(C, { parentUnionId: U1 }),
    makePerson(D, { gender: 'female', parentUnionId: U1 }),
    makePerson(E, { gender: 'female' }),
    makePerson(F, { parentUnionId: U2 }),
    makePerson(X),
  ],
  [makeUnion(U1, [A, B]), makeUnion(U2, [C, E], { order: 2 }), makeUnion(U4, [C], { order: 1 })],
  A,
);

describe('relativeOf', () => {
  it('goes to the blood parent and to the eldest child of the first union with children', () => {
    expect(relativeOf(family, C, 'parent')).toBe(A);
    expect(relativeOf(family, F, 'parent')).toBe(C);
    expect(relativeOf(family, A, 'child')).toBe(C);
    // C's first union (U4) has no children; U2 does.
    expect(relativeOf(family, C, 'child')).toBe(F);
    expect(relativeOf(family, A, 'parent')).toBeNull();
    expect(relativeOf(family, D, 'child')).toBeNull();
  });

  it('goes to the previous and next sibling in chart order', () => {
    expect(relativeOf(family, C, 'next')).toBe(D);
    expect(relativeOf(family, D, 'prev')).toBe(C);
    expect(relativeOf(family, C, 'prev')).toBeNull();
    expect(relativeOf(family, D, 'next')).toBeNull();
    expect(relativeOf(family, A, 'next')).toBeNull();
  });

  it('follows siblingOrder before ids', () => {
    const ordered = treeOf(
      [
        makePerson(A),
        makePerson(C, { parentUnionId: U1, siblingOrder: 2 }),
        makePerson(D, { parentUnionId: U1, siblingOrder: 1 }),
      ],
      [makeUnion(U1, [A])],
      A,
    );
    expect(relativeOf(ordered, D, 'next')).toBe(C);
    expect(relativeOf(ordered, A, 'child')).toBe(D);
  });

  it('moves an in-law sideways to the spouse, and nowhere else', () => {
    expect(relativeOf(family, B, 'prev')).toBe(A);
    expect(relativeOf(family, E, 'next')).toBe(C);
    expect(relativeOf(family, E, 'parent')).toBeNull();
    expect(relativeOf(family, E, 'child')).toBeNull();
  });

  it('gives nothing for someone unlinked or unknown', () => {
    expect(relativeOf(family, X, 'parent')).toBeNull();
    expect(relativeOf(family, X, 'next')).toBeNull();
    expect(relativeOf(family, testId(99), 'parent')).toBeNull();
  });

  it('never goes from the progenitor to recorded parents or siblings, who are unlinked', () => {
    const above = treeOf(
      [
        makePerson(A, { parentUnionId: U3 }),
        makePerson(Y, { gender: 'female', parentUnionId: U3 }),
        makePerson(B, { gender: 'female' }),
        makePerson(C, { parentUnionId: U1 }),
        makePerson(X),
      ],
      [makeUnion(U1, [A, B]), makeUnion(U3, [X])],
      A,
    );
    expect(relativeOf(above, A, 'parent')).toBeNull();
    expect(relativeOf(above, A, 'prev')).toBeNull();
    expect(relativeOf(above, A, 'next')).toBeNull();
    expect(relativeOf(above, A, 'child')).toBe(C);
  });

  it('goes up to an in-law parent when that is the only parent on the board', () => {
    // B is both the progenitor's wife and recorded as his mother: an in-law, still on the board.
    const odd = treeOf(
      [makePerson(A, { parentUnionId: U3 }), makePerson(B, { gender: 'female' })],
      [makeUnion(U1, [A, B]), makeUnion(U3, [B])],
      A,
    );
    expect(relativeOf(odd, A, 'parent')).toBe(B);
  });
});
