import {
  applyOp,
  buildTreeIndex,
  treeStateFromLists,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';
import {
  addChildOp,
  addFirstPersonOp,
  addSpouseOp,
  deletePersonOp,
  setProgenitorOp,
  type NewPersonInput,
} from './ops';

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
const index = buildTreeIndex(tree);
const input: NewPersonInput = { fullName: '  Nguyễn Văn Út ', gender: 'male', isDeceased: false };

/** Grandpa and grandma's children, in the order the chart shows them. */
function childrenNames(state: TreeState): string[] {
  return buildTreeIndex(state)
    .childrenOf(PARENTS_UNION)
    .map((child) => child.fullName);
}

function withSonOrder(siblingOrder: number): TreeState {
  return treeStateFromLists(
    FAMILY.progenitorId,
    FAMILY.persons.map((person) => (person.id === SON ? { ...person, siblingOrder } : person)),
    FAMILY.unions,
  );
}

describe('op builders', () => {
  it('adds a first person with a new id and a trimmed name', () => {
    const op = addFirstPersonOp(input);
    expect(op).toMatchObject({
      type: 'addPerson',
      payload: { fullName: 'Nguyễn Văn Út', gender: 'male', death: { isDeceased: false } },
    });
    expect(op.type === 'addPerson' && op.payload.id).toMatch(/^[a-f0-9]{24}$/);
  });

  it('adds a child to the parent’s first union, as the youngest', () => {
    const op = addChildOp(index, GRANDPA, input);
    expect(op).toMatchObject({ type: 'addPerson', payload: { parentUnionId: PARENTS_UNION } });
    // SON has no siblingOrder, so he sorts after every numbered child: the new child gets no
    // number either, and its newer id puts it after him.
    const child = op.type === 'addPerson' ? op.payload : undefined;
    expect(child?.siblingOrder).toBeUndefined();
    expect(childrenNames(applyOp(tree, op).tree)).toEqual(['Nguyễn Văn Nam', 'Nguyễn Văn Út']);
  });

  it('numbers a new child after numbered siblings', () => {
    const numbered = withSonOrder(3);
    const op = addChildOp(buildTreeIndex(numbered), GRANDPA, input);
    expect(op.type === 'addPerson' && op.payload.siblingOrder).toBe(4);
    expect(childrenNames(applyOp(numbered, op).tree)).toEqual(['Nguyễn Văn Nam', 'Nguyễn Văn Út']);
  });

  it('leaves the number off when the last sibling already has the highest one', () => {
    const full = withSonOrder(99);
    const op = addChildOp(buildTreeIndex(full), GRANDPA, input);
    expect(op.type === 'addPerson' && op.payload.siblingOrder).toBeUndefined();
    expect(childrenNames(applyOp(full, op).tree)).toEqual(['Nguyễn Văn Nam', 'Nguyễn Văn Út']);
  });

  it('creates a one-parent union for a child of someone without a marriage', () => {
    const op = addChildOp(index, LOOSE, input);
    expect(op.type).toBe('batch');
    const next = applyOp(tree, op).tree;
    const union = Object.values(next.unions).find((candidate) =>
      candidate.partnerIds.includes(LOOSE),
    );
    expect(union?.partnerIds).toEqual([LOOSE]);
    expect(Object.values(next.persons).some((p) => p.parentUnionId === union?.id)).toBe(true);
  });

  it('adds a spouse in a new union, or fills a one-parent union', () => {
    const remarried = applyOp(tree, addSpouseOp(index, GRANDPA, input)).tree;
    const grandpaUnions = Object.values(remarried.unions).filter((u) =>
      u.partnerIds.includes(GRANDPA),
    );
    expect(grandpaUnions.map((u) => u.order).sort()).toEqual([1, 2]);

    const withChild = applyOp(tree, addChildOp(index, LOOSE, input)).tree;
    const married = applyOp(withChild, addSpouseOp(buildTreeIndex(withChild), LOOSE, input)).tree;
    const loneUnion = Object.values(married.unions).filter((u) => u.partnerIds.includes(LOOSE));
    expect(loneUnion).toHaveLength(1);
    expect(loneUnion[0]?.partnerIds).toHaveLength(2);
  });

  it('never repeats a union order, even past the highest one', () => {
    const late = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, [
      { id: PARENTS_UNION, partnerIds: [GRANDPA, GRANDMA], order: 99, status: 'married' },
    ]);
    const op = addSpouseOp(buildTreeIndex(late), GRANDPA, input);
    const next = applyOp(late, op).tree;
    const orders = Object.values(next.unions)
      .filter((u) => u.partnerIds.includes(GRANDPA))
      .map((u) => u.order)
      .sort((a, b) => a - b);
    // 100 would fail the schema (1–99); the lowest free order is used instead.
    expect(orders).toEqual([1, 99]);
  });

  it('deletes and chooses the progenitor', () => {
    expect(deletePersonOp(GRANDMA)).toEqual({ type: 'deletePerson', payload: { id: GRANDMA } });
    expect(setProgenitorOp(SON)).toEqual({ type: 'setProgenitor', payload: { personId: SON } });
  });
});
