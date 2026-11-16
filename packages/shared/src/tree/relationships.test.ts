import { describe, expect, it } from 'vitest';
import { applyOp } from './apply-op.ts';
import { buildTreeIndex, classifyLineage } from './lineage.ts';
import {
  cutMarriage,
  cutThreadOp,
  detach,
  relationshipsOf,
  removeParentOp,
  unionStatusOp,
} from './relationships.ts';
import type { TreeState } from './state.ts';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

const GRANDPA = testId(1);
const GRANDMA = testId(2);
const SON = testId(3);
const WIFE = testId(5);
const KID = testId(6);
const OLD = testId(101);
const YOUNG = testId(102);

function family(): TreeState {
  return treeOf(
    [
      makePerson(GRANDPA),
      makePerson(GRANDMA, { gender: 'female' }),
      makePerson(SON, { parentUnionId: OLD }),
      makePerson(WIFE, { gender: 'female' }),
      makePerson(KID, { parentUnionId: YOUNG }),
    ],
    [makeUnion(OLD, [GRANDPA, GRANDMA]), makeUnion(YOUNG, [SON, WIFE])],
    GRANDPA,
  );
}

function valid(tree: TreeState, op: Parameters<typeof applyOp>[1]): TreeState {
  const next = applyOp(tree, op).tree;
  expect(invariantViolations(next)).toEqual([]);
  return next;
}

describe('relationshipsOf', () => {
  it('lists parents and marriages with their children', () => {
    expect(relationshipsOf(family(), SON)).toEqual({
      parentUnionId: OLD,
      parentIds: [GRANDPA, GRANDMA],
      marriages: [{ union: family().unions[YOUNG], partnerId: WIFE, childIds: [KID] }],
    });
    expect(relationshipsOf(family(), testId(99))).toEqual({
      parentUnionId: null,
      parentIds: [],
      marriages: [],
    });
  });
});

describe('removing and cutting', () => {
  it('removes one parent and keeps the other', () => {
    const tree = family();
    const op = removeParentOp(tree, SON, GRANDMA);
    expect(op).not.toBeNull();
    const next = valid(tree, op!);
    const unionId = next.persons[SON]?.parentUnionId as string;
    expect(next.unions[unionId]?.partnerIds).toEqual([GRANDPA]);
    expect(removeParentOp(tree, SON, WIFE)).toBeNull();
  });

  it('cuts a thread', () => {
    const next = valid(family(), cutThreadOp(SON));
    expect(next.persons[SON]?.parentUnionId).toBeUndefined();
  });

  it('asks who the children stay with, then keeps them with that partner', () => {
    const tree = family();
    expect(cutMarriage(tree, YOUNG)).toEqual({
      kind: 'ask',
      question: { kind: 'keepChildren', partnerIds: [SON, WIFE] },
    });
    const result = cutMarriage(tree, YOUNG, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.unions[YOUNG]?.partnerIds).toEqual([WIFE]);
  });

  it('moves the children into the keeper’s own one-person union, not a second one', () => {
    // Son already has a child of his own (Step, in a one-person union) besides Kid with Wife.
    const SOLO = testId(103);
    const STEP = testId(8);
    const tree = treeOf(
      [
        ...Object.values(family().persons),
        makePerson(STEP, { parentUnionId: SOLO, siblingOrder: 1 }),
      ],
      [...Object.values(family().unions), makeUnion(SOLO, [SON], { order: 2 })],
      GRANDPA,
    );
    const cut = cutMarriage(tree, YOUNG, SON);
    if (cut.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, cut.op);
    expect(next.unions[YOUNG]).toBeUndefined();
    expect(buildTreeIndex(next).unionsOf(SON)).toEqual([next.unions[SOLO]]);
    expect(next.persons[KID]?.parentUnionId).toBe(SOLO);
    expect(next.persons[KID]?.siblingOrder).toBe(2);
    // The same when Wife, an in-law, is dropped on the tray.
    const detached = detach(tree, WIFE);
    if (detached.kind !== 'ok') throw new Error('expected ok');
    const alone = valid(tree, detached.op);
    expect(buildTreeIndex(alone).unionsOf(SON)).toEqual([alone.unions[SOLO]]);
    expect(alone.persons[KID]?.parentUnionId).toBe(SOLO);
  });

  it('deletes a marriage without children, with no question', () => {
    const tree = valid(family(), {
      type: 'setParents',
      payload: { personId: KID, parentUnionId: null },
    });
    const result = cutMarriage(tree, YOUNG);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(valid(tree, result.op).unions[YOUNG]).toBeUndefined();
    expect(cutMarriage(tree, testId(99))).toEqual({ kind: 'blocked', reason: 'UNION_NOT_FOUND' });
  });

  it('cuts a one-person union with children, the children losing that parent', () => {
    const PARENT = testId(8);
    const CHILD = testId(9);
    const ALONE_UNION = testId(103);
    const tree = treeOf(
      [makePerson(PARENT), makePerson(CHILD, { parentUnionId: ALONE_UNION })],
      [makeUnion(ALONE_UNION, [PARENT])],
    );
    const result = cutMarriage(tree, ALONE_UNION);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.unions[ALONE_UNION]).toBeUndefined();
    expect(next.persons[CHILD]?.parentUnionId).toBeUndefined();
  });

  it('changes a marriage’s status', () => {
    const next = valid(family(), unionStatusOp(YOUNG, 'divorced'));
    expect(next.unions[YOUNG]?.status).toBe('divorced');
  });
});

describe('detach (a card dropped on the tray)', () => {
  it('takes a blood member away with their branch', () => {
    const tree = family();
    const result = detach(tree, SON);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.persons[SON]?.parentUnionId).toBeUndefined();
    expect(next.persons[KID]?.parentUnionId).toBe(YOUNG);
  });

  it('takes an in-law out of the marriage, the children staying with the blood partner', () => {
    const tree = family();
    const result = detach(tree, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(valid(tree, result.op).unions[YOUNG]?.partnerIds).toEqual([SON]);
  });

  it('takes an in-law with loose parents out of the marriage, to their loose family', () => {
    const WIFE_FATHER = testId(10);
    const WIFE_PARENTS = testId(104);
    const base = family();
    const tree = treeOf(
      [
        ...Object.values(base.persons).map((person) =>
          person.id === WIFE ? { ...person, parentUnionId: WIFE_PARENTS } : person,
        ),
        makePerson(WIFE_FATHER),
      ],
      [...Object.values(base.unions), makeUnion(WIFE_PARENTS, [WIFE_FATHER])],
      GRANDPA,
    );
    expect(classifyLineage(tree).get(WIFE)).toBe('in-law');
    const result = detach(tree, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.unions[YOUNG]?.partnerIds).toEqual([SON]);
    expect(next.persons[WIFE]?.parentUnionId).toBe(WIFE_PARENTS);
    expect(classifyLineage(next).get(WIFE)).toBe('unlinked');
  });

  it('leaves someone already loose with their loose parents', () => {
    const PARENT = testId(10);
    const CHILD = testId(11);
    const tree = treeOf(
      [
        ...Object.values(family().persons),
        makePerson(PARENT),
        makePerson(CHILD, { parentUnionId: testId(104) }),
      ],
      [...Object.values(family().unions), makeUnion(testId(104), [PARENT])],
      GRANDPA,
    );
    expect(detach(tree, CHILD)).toEqual({ kind: 'blocked', reason: 'ALREADY' });
  });

  it('separates an in-law only from their blood partner, not from another marriage', () => {
    const OTHER = testId(12);
    const SECOND = testId(105);
    const tree = treeOf(
      [...Object.values(family().persons), makePerson(OTHER)],
      [...Object.values(family().unions), makeUnion(SECOND, [WIFE, OTHER], { order: 2 })],
      GRANDPA,
    );
    const result = detach(tree, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const next = valid(tree, result.op);
    expect(next.unions[YOUNG]?.partnerIds).toEqual([SON]);
    expect(next.unions[SECOND]?.partnerIds).toEqual([WIFE, OTHER]);
  });

  it('deletes an in-law’s childless marriage', () => {
    const tree = valid(family(), {
      type: 'setParents',
      payload: { personId: KID, parentUnionId: null },
    });
    const result = detach(tree, WIFE);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(valid(tree, result.op).unions[YOUNG]).toBeUndefined();
  });

  it('refuses the progenitor and someone already loose', () => {
    expect(detach(family(), GRANDPA)).toEqual({ kind: 'blocked', reason: 'IS_PROGENITOR' });
    const loose = treeOf([makePerson(testId(7))]);
    expect(detach(loose, testId(7))).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(detach(loose, testId(99))).toEqual({ kind: 'blocked', reason: 'PERSON_NOT_FOUND' });
  });
});
