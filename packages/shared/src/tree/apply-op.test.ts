import { describe, expect, it } from 'vitest';
import { applyOp, isOwnAncestor } from './apply-op.ts';
import { OpError, type OpErrorCode } from './op-error.ts';
import type { Op } from './ops.ts';
import { MAX_PERSONS, type Person, type Union } from './schemas.ts';
import type { TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

const A = testId(1); // progenitor
const B = testId(2); // A's wife, an in-law
const C = testId(3); // their son
const D = testId(4);
const E = testId(5);
const K = testId(6);
const U = testId(101); // A + B, parents of C
const V = testId(102);
const W = testId(103);

/** A + B (union U) with their son C; A is the progenitor. */
function family(): TreeState {
  return treeOf(
    [makePerson(A), makePerson(B, { gender: 'female' }), makePerson(C, { parentUnionId: U })],
    [makeUnion(U, [A, B])],
    A,
  );
}

function expectOpError(run: () => unknown, code: OpErrorCode): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(OpError);
  expect((thrown as OpError).code).toBe(code);
}

/** Applies op, checks the input is untouched and that the inverse restores it exactly. */
function roundTrip(tree: TreeState, op: Op): TreeState {
  const before = structuredClone(tree);
  const result = applyOp(tree, op);
  expect(tree).toEqual(before);
  expect(invariantViolations(result.tree)).toEqual([]);
  expect(applyOp(result.tree, result.inverse).tree).toEqual(before);
  return result.tree;
}

describe('addPerson', () => {
  it('adds a person; the inverse deletes them', () => {
    const op: Op = { type: 'addPerson', payload: makePerson(D, { parentUnionId: U }) };
    expect(roundTrip(family(), op).persons[D]?.parentUnionId).toBe(U);
    expect(applyOp(family(), op).inverse).toEqual({ type: 'deletePerson', payload: { id: D } });
  });

  it('keeps every untouched object (structural sharing)', () => {
    const tree = family();
    const next = applyOp(tree, { type: 'addPerson', payload: makePerson(D) }).tree;
    expect(next.persons[A]).toBe(tree.persons[A]);
    expect(next.unions).toBe(tree.unions);
  });

  it('refuses malformed and used ids and a missing parent union', () => {
    const add = (person: Person) => () => applyOp(family(), { type: 'addPerson', payload: person });
    expectOpError(add(makePerson('not-an-id')), 'INVALID_ID');
    expectOpError(add(makePerson(A)), 'DUPLICATE_ID');
    expectOpError(add(makePerson(U)), 'DUPLICATE_ID');
    expectOpError(add(makePerson(D, { parentUnionId: V })), 'UNION_NOT_FOUND');
  });

  it('stops at the 5,000-person design limit', () => {
    const full = treeOf(
      Array.from({ length: MAX_PERSONS }, (_, index) => makePerson(testId(index + 1))),
    );
    expectOpError(
      () => applyOp(full, { type: 'addPerson', payload: makePerson(testId(MAX_PERSONS + 1)) }),
      'TREE_FULL',
    );
  });
});

describe('updatePerson', () => {
  it('changes the given fields, null clears one, the inverse restores the old values', () => {
    const tree = treeOf([makePerson(A, { bio: 'Trưởng họ' })], [], A);
    const op: Op = {
      type: 'updatePerson',
      payload: { id: A, changes: { fullName: 'Nguyễn Văn Tư', bio: null, branch: 'Chi trưởng' } },
    };
    const result = applyOp(tree, op);
    expect(result.tree.persons[A]).toEqual(
      makePerson(A, { fullName: 'Nguyễn Văn Tư', branch: 'Chi trưởng' }),
    );
    expect(result.inverse).toEqual({
      type: 'updatePerson',
      payload: { id: A, changes: { fullName: 'Person 0001', bio: 'Trưởng họ', branch: null } },
    });
    roundTrip(tree, op);
  });

  it('needs an existing person', () => {
    expectOpError(
      () => applyOp(family(), { type: 'updatePerson', payload: { id: D, changes: { bio: 'x' } } }),
      'PERSON_NOT_FOUND',
    );
  });
});

describe('deletePerson', () => {
  it('deletes a person without children', () => {
    expect(roundTrip(family(), { type: 'deletePerson', payload: { id: C } }).persons[C]).toBe(
      undefined,
    );
  });

  it('deletes the unions where they were alone and keeps their spouse in a shared one', () => {
    // D has a one-partner union V and a childless marriage W with E.
    const tree = treeOf(
      [makePerson(A), makePerson(D), makePerson(E, { gender: 'female' })],
      [makeUnion(V, [D]), makeUnion(W, [D, E], { order: 2 })],
      A,
    );
    const op: Op = { type: 'deletePerson', payload: { id: D } };
    const result = applyOp(tree, op);
    expect(result.tree.unions[V]).toBeUndefined();
    expect(result.tree.unions[W]).toEqual(makeUnion(W, [E], { order: 2 }));
    expect(result.inverse).toEqual({
      type: 'restorePerson',
      payload: {
        person: makePerson(D),
        unions: [makeUnion(V, [D]), makeUnion(W, [D, E], { order: 2 })],
      },
    });
    roundTrip(tree, op);
  });

  it('refuses the progenitor, a parent and a missing person', () => {
    const remove = (id: string) => () =>
      applyOp(family(), { type: 'deletePerson', payload: { id } });
    expectOpError(remove(A), 'PROGENITOR_PROTECTED');
    expectOpError(remove(B), 'PERSON_HAS_CHILDREN');
    expectOpError(remove(D), 'PERSON_NOT_FOUND');
  });
});

describe('addUnion', () => {
  it('adds a marriage; the inverse deletes it', () => {
    const tree = applyOp(family(), { type: 'addPerson', payload: makePerson(D) }).tree;
    const op: Op = { type: 'addUnion', payload: makeUnion(V, [C, D]) };
    expect(roundTrip(tree, op).unions[V]?.partnerIds).toEqual([C, D]);
    expect(applyOp(tree, op).inverse).toEqual({ type: 'deleteUnion', payload: { id: V } });
  });

  it('needs one or two different, existing partners and a new id', () => {
    const add = (union: Union) => () => applyOp(family(), { type: 'addUnion', payload: union });
    expectOpError(add(makeUnion(V, [])), 'INVALID_PARTNERS');
    expectOpError(add(makeUnion(V, [A, A])), 'INVALID_PARTNERS');
    expectOpError(add(makeUnion(V, [A, B, C])), 'INVALID_PARTNERS');
    expectOpError(add(makeUnion(V, [A, D])), 'PERSON_NOT_FOUND');
    expectOpError(add(makeUnion(U, [C])), 'DUPLICATE_ID');
    expectOpError(add(makeUnion('bad', [C])), 'INVALID_ID');
  });
});

describe('updateUnion', () => {
  it('changes status, order and partners; the inverse restores them', () => {
    const tree = applyOp(family(), { type: 'addPerson', payload: makePerson(D) }).tree;
    const op: Op = {
      type: 'updateUnion',
      payload: { id: U, changes: { status: 'widowed', order: 2, partnerIds: [A, D] } },
    };
    const result = applyOp(tree, op);
    expect(result.tree.unions[U]).toEqual(makeUnion(U, [A, D], { status: 'widowed', order: 2 }));
    expect(result.inverse).toEqual({
      type: 'updateUnion',
      payload: { id: U, changes: { partnerIds: [A, B], order: 1, status: 'married' } },
    });
    roundTrip(tree, op);
  });

  it("refuses a child becoming a partner in their own parents' union", () => {
    expectOpError(
      () =>
        applyOp(family(), {
          type: 'updateUnion',
          payload: { id: U, changes: { partnerIds: [A, C] } },
        }),
      'CYCLE',
    );
  });

  it('refuses bad partners and a missing union', () => {
    expectOpError(
      () =>
        applyOp(family(), {
          type: 'updateUnion',
          payload: { id: U, changes: { partnerIds: [A, A] } },
        }),
      'INVALID_PARTNERS',
    );
    expectOpError(
      () => applyOp(family(), { type: 'updateUnion', payload: { id: V, changes: { order: 2 } } }),
      'UNION_NOT_FOUND',
    );
  });
});

describe('deleteUnion and restoreUnion', () => {
  it('deletes a childless union; the inverse restores it', () => {
    const tree = applyOp(family(), { type: 'addUnion', payload: makeUnion(V, [C]) }).tree;
    const op: Op = { type: 'deleteUnion', payload: { id: V } };
    expect(applyOp(tree, op).inverse).toEqual({
      type: 'restoreUnion',
      payload: makeUnion(V, [C]),
    });
    roundTrip(tree, op);
  });

  it('refuses a union with children, a missing union and a used id', () => {
    expectOpError(
      () => applyOp(family(), { type: 'deleteUnion', payload: { id: U } }),
      'UNION_HAS_CHILDREN',
    );
    expectOpError(
      () => applyOp(family(), { type: 'deleteUnion', payload: { id: V } }),
      'UNION_NOT_FOUND',
    );
    expectOpError(
      () => applyOp(family(), { type: 'restoreUnion', payload: makeUnion(U, [A]) }),
      'DUPLICATE_ID',
    );
  });
});

describe('setParents', () => {
  it('moves and detaches a child; the inverse puts them back', () => {
    const tree = applyOp(family(), { type: 'addUnion', payload: makeUnion(V, [A]) }).tree;
    const moved = roundTrip(tree, {
      type: 'setParents',
      payload: { personId: C, parentUnionId: V },
    });
    expect(moved.persons[C]?.parentUnionId).toBe(V);
    const detached = roundTrip(tree, {
      type: 'setParents',
      payload: { personId: C, parentUnionId: null },
    });
    expect(detached.persons[C]).toEqual(makePerson(C));
  });

  it('refuses to make someone their own ancestor', () => {
    expectOpError(
      () => applyOp(family(), { type: 'setParents', payload: { personId: A, parentUnionId: U } }),
      'CYCLE',
    );
    // C has a union V with a son D. A cannot become the child of his own son C.
    let tree = applyOp(family(), { type: 'addUnion', payload: makeUnion(V, [C]) }).tree;
    tree = applyOp(tree, { type: 'addPerson', payload: makePerson(D, { parentUnionId: V }) }).tree;
    expectOpError(
      () => applyOp(tree, { type: 'setParents', payload: { personId: A, parentUnionId: V } }),
      'CYCLE',
    );
    expect(isOwnAncestor(tree, A)).toBe(false);
    expect(isOwnAncestor(tree, D)).toBe(false);
  });

  it('needs an existing person and union', () => {
    expectOpError(
      () => applyOp(family(), { type: 'setParents', payload: { personId: D, parentUnionId: U } }),
      'PERSON_NOT_FOUND',
    );
    expectOpError(
      () => applyOp(family(), { type: 'setParents', payload: { personId: C, parentUnionId: V } }),
      'UNION_NOT_FOUND',
    );
  });
});

describe('restorePerson', () => {
  // D (female) is the daughter of union V (partner E) and C's wife in union W (no children).
  function withInLaw(): TreeState {
    let tree = family();
    tree = applyOp(tree, { type: 'addPerson', payload: makePerson(E) }).tree;
    tree = applyOp(tree, { type: 'addUnion', payload: makeUnion(V, [E]) }).tree;
    tree = applyOp(tree, {
      type: 'addPerson',
      payload: makePerson(D, { gender: 'female', parentUnionId: V }),
    }).tree;
    return applyOp(tree, { type: 'addUnion', payload: makeUnion(W, [C, D]) }).tree;
  }

  it('puts back the person and their union exactly', () => {
    const tree = withInLaw();
    roundTrip(tree, { type: 'deletePerson', payload: { id: D } });
    expect(applyOp(tree, { type: 'deletePerson', payload: { id: D } }).inverse).toEqual({
      type: 'restorePerson',
      payload: { person: tree.persons[D], unions: [tree.unions[W]] },
    });
  });

  it('refuses when a union it puts back has a new partner', () => {
    const { tree, inverse } = applyOp(withInLaw(), { type: 'deletePerson', payload: { id: D } });
    const changed = applyOp(tree, {
      type: 'updateUnion',
      payload: { id: W, changes: { partnerIds: [E] } },
    }).tree;
    expectOpError(() => applyOp(changed, inverse), 'RESTORE_CONFLICT');
  });

  it('refuses when the restored person would become their own ancestor', () => {
    const { tree: deleted, inverse } = applyOp(withInLaw(), {
      type: 'deletePerson',
      payload: { id: D },
    });
    // K is born to W (now only C), then K becomes the only partner of V, D's parents' union.
    let tree = applyOp(deleted, {
      type: 'addPerson',
      payload: makePerson(K, { parentUnionId: W }),
    }).tree;
    tree = applyOp(tree, {
      type: 'updateUnion',
      payload: { id: V, changes: { partnerIds: [K] } },
    }).tree;
    expectOpError(() => applyOp(tree, inverse), 'CYCLE');
  });

  it('checks the snapshot', () => {
    const restore = (person: Person, unions: Union[]) => () =>
      applyOp(family(), { type: 'restorePerson', payload: { person, unions } });
    expectOpError(restore(makePerson(A), []), 'DUPLICATE_ID');
    expectOpError(restore(makePerson(D), [makeUnion(V, [C])]), 'INVALID_PARTNERS');
    expectOpError(restore(makePerson(D), [makeUnion(V, [D, E])]), 'PERSON_NOT_FOUND');
    expectOpError(restore(makePerson(D, { parentUnionId: V }), []), 'UNION_NOT_FOUND');
    expectOpError(restore(makePerson(D), [makeUnion(A, [D])]), 'DUPLICATE_ID');
  });
});

describe('setProgenitor', () => {
  it('chooses or clears the progenitor; the inverse restores the previous one', () => {
    const choose = (personId: string | null): Op => ({
      type: 'setProgenitor',
      payload: { personId },
    });
    expect(roundTrip(family(), choose(C)).progenitorId).toBe(C);
    expect(roundTrip(family(), choose(null)).progenitorId).toBeNull();
    expect(applyOp(family(), choose(C)).inverse).toEqual(choose(A));
    expectOpError(() => applyOp(family(), choose(D)), 'PERSON_NOT_FOUND');
  });
});

describe('batch', () => {
  const addSpouse: Op = {
    type: 'batch',
    payload: {
      ops: [
        { type: 'addPerson', payload: makePerson(D, { gender: 'female' }) },
        { type: 'addUnion', payload: makeUnion(V, [C, D]) },
      ],
    },
  };

  it('applies ops in order; the inverse undoes them in reverse order', () => {
    const result = applyOp(family(), addSpouse);
    expect(result.tree.unions[V]?.partnerIds).toEqual([C, D]);
    expect(result.inverse).toEqual({
      type: 'batch',
      payload: {
        ops: [
          { type: 'deleteUnion', payload: { id: V } },
          { type: 'deletePerson', payload: { id: D } },
        ],
      },
    });
    roundTrip(family(), addSpouse);
  });

  it('fails as a whole and leaves the tree untouched', () => {
    const tree = family();
    const before = structuredClone(tree);
    expectOpError(
      () =>
        applyOp(tree, {
          type: 'batch',
          payload: {
            ops: [
              { type: 'addPerson', payload: makePerson(D) },
              { type: 'deletePerson', payload: { id: A } },
            ],
          },
        }),
      'PROGENITOR_PROTECTED',
    );
    expect(tree).toEqual(before);
  });
});
