import { applyOp, buildTreeIndex, treeStateFromLists } from '@ancestors-tree/shared/tree';
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

describe('op builders', () => {
  it('adds a first person with a new id and a trimmed name', () => {
    const op = addFirstPersonOp(input);
    expect(op).toMatchObject({
      type: 'addPerson',
      payload: { fullName: 'Nguyễn Văn Út', gender: 'male', death: { isDeceased: false } },
    });
    expect(op.type === 'addPerson' && op.payload.id).toMatch(/^[a-f0-9]{24}$/);
  });

  it('adds a child to the parent’s first union, as the next sibling', () => {
    const op = addChildOp(index, GRANDPA, input);
    expect(op).toMatchObject({
      type: 'addPerson',
      payload: { parentUnionId: PARENTS_UNION, siblingOrder: 1 },
    });
    // SON has no siblingOrder; the new child is the first with one.
    expect(applyOp(tree, op).tree.persons[SON]).toBeDefined();
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

  it('deletes and chooses the progenitor', () => {
    expect(deletePersonOp(GRANDMA)).toEqual({ type: 'deletePerson', payload: { id: GRANDMA } });
    expect(setProgenitorOp(SON)).toEqual({ type: 'setProgenitor', payload: { personId: SON } });
  });
});
