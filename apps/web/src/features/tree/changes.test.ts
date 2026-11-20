import { applyOp, treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { decide, planChange, sameOutcome } from './changes';
import {
  FAMILY,
  fixturePerson,
  GRANDMA,
  GRANDPA,
  LOOSE,
  PARENTS_UNION,
  SIBLINGS,
  SISTER,
  SON,
} from './fixtures';

function stateOf(response: typeof FAMILY): TreeState {
  return treeStateFromLists(response.progenitorId, response.persons, response.unions);
}

describe('planChange', () => {
  it('describes a relate change by its effect', () => {
    const result = planChange(stateOf(SIBLINGS), {
      kind: 'relate',
      personId: SISTER,
      targetId: SON,
      relation: 'before',
    });
    expect(result).toMatchObject({
      kind: 'ok',
      summary: { kind: 'relate', effect: { relation: 'before', personId: SISTER, targetId: SON } },
    });
  });

  it('cuts a thread, and says when there is none', () => {
    const tree = stateOf(FAMILY);
    expect(planChange(tree, { kind: 'cutThread', childId: SON })).toMatchObject({
      kind: 'ok',
      summary: { kind: 'cutThread', childId: SON, parentIds: [GRANDPA, GRANDMA] },
    });
    expect(planChange(tree, { kind: 'cutThread', childId: LOOSE })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it('asks who keeps the children when a marriage is cut', () => {
    const tree = stateOf(FAMILY);
    const change = { kind: 'cutMarriage', unionId: PARENTS_UNION } as const;
    expect(planChange(tree, change)).toEqual({
      kind: 'ask',
      question: { kind: 'keepChildren', partnerIds: [GRANDPA, GRANDMA] },
    });
    expect(planChange(tree, change, { keepWith: GRANDMA })).toMatchObject({
      kind: 'ok',
      summary: { kind: 'cutMarriage', partnerIds: [GRANDPA, GRANDMA] },
    });
  });

  it('changes a marriage’s status, but not to the same one', () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'status', unionId: PARENTS_UNION, status: 'widowed' }),
    ).toMatchObject({ kind: 'ok', summary: { kind: 'status', status: 'widowed' } });
    expect(planChange(tree, { kind: 'status', unionId: PARENTS_UNION, status: 'married' })).toEqual(
      { kind: 'blocked', reason: 'ALREADY' },
    );
  });

  it('removes one parent, and refuses someone who is not a parent', () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'removeParent', childId: SON, parentId: GRANDMA }),
    ).toMatchObject({ kind: 'ok', summary: { kind: 'removeParent', childId: SON } });
    expect(planChange(tree, { kind: 'removeParent', childId: SON, parentId: LOOSE })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it('sets a photo as one person update', () => {
    const photo = { publicId: 'a/b', version: 5 };
    expect(planChange(stateOf(FAMILY), { kind: 'photo', personId: SON, photo })).toEqual({
      kind: 'ok',
      op: {
        type: 'batch',
        payload: { ops: [{ type: 'updatePerson', payload: { id: SON, changes: { photo } } }] },
      },
      summary: { kind: 'photo', personId: SON, removed: false },
    });
  });

  it('removes a photo, and says when there is none to remove', () => {
    const photo = { publicId: 'a/b', version: 5 };
    const { tree } = applyOp(stateOf(FAMILY), {
      type: 'updatePerson',
      payload: { id: SON, changes: { photo } },
    });
    expect(planChange(tree, { kind: 'photo', personId: SON, photo: null })).toEqual({
      kind: 'ok',
      op: {
        type: 'batch',
        payload: {
          ops: [{ type: 'updatePerson', payload: { id: SON, changes: { photo: null } } }],
        },
      },
      summary: { kind: 'photo', personId: SON, removed: true },
    });
    expect(planChange(stateOf(FAMILY), { kind: 'photo', personId: SON, photo: null })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it('refuses the photo a person already has, and an unknown person', () => {
    const photo = { publicId: 'a/b', version: 5 };
    const { tree } = applyOp(stateOf(FAMILY), {
      type: 'updatePerson',
      payload: { id: SON, changes: { photo } },
    });
    expect(planChange(tree, { kind: 'photo', personId: SON, photo: { ...photo } })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
    expect(
      planChange(tree, { kind: 'photo', personId: SON, photo: { ...photo, version: 6 } }),
    ).toMatchObject({ kind: 'ok', summary: { kind: 'photo', removed: false } });
    expect(
      planChange(tree, { kind: 'photo', personId: '64b7f0c2a1b2c3d4e5f6afff', photo }),
    ).toEqual({ kind: 'blocked', reason: 'PERSON_NOT_FOUND' });
  });

  it('sets the tree theme as one op, and says when nothing would change', () => {
    const tree = stateOf(FAMILY);
    const changes = { surface: 'corkboard', fastener: 'pushpin' } as const;
    expect(planChange(tree, { kind: 'treeTheme', changes })).toEqual({
      kind: 'ok',
      op: { type: 'batch', payload: { ops: [{ type: 'setTreeTheme', payload: { changes } }] } },
      summary: { kind: 'treeTheme' },
    });
    const themed = applyOp(tree, {
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard' } },
    }).tree;
    expect(planChange(themed, { kind: 'treeTheme', changes: { surface: 'corkboard' } })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
    // Resetting a part that is already the default changes nothing either.
    expect(planChange(tree, { kind: 'treeTheme', changes: { surface: null } })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });
  });

  it("sets and clears a card's style as one person update", () => {
    const tree = stateOf(FAMILY);
    expect(
      planChange(tree, { kind: 'cardStyle', personId: SON, cardStyle: { frame: 'kraft' } }),
    ).toEqual({
      kind: 'ok',
      op: {
        type: 'batch',
        payload: {
          ops: [
            {
              type: 'updatePerson',
              payload: { id: SON, changes: { cardStyle: { frame: 'kraft' } } },
            },
          ],
        },
      },
      summary: { kind: 'cardStyle', personId: SON, cleared: false },
    });
    expect(planChange(tree, { kind: 'cardStyle', personId: SON, cardStyle: null })).toEqual({
      kind: 'blocked',
      reason: 'ALREADY',
    });

    const styled = applyOp(tree, {
      type: 'updatePerson',
      payload: { id: SON, changes: { cardStyle: { frame: 'kraft' } } },
    }).tree;
    expect(
      planChange(styled, { kind: 'cardStyle', personId: SON, cardStyle: { frame: 'kraft' } }),
    ).toEqual({ kind: 'blocked', reason: 'ALREADY' });
    expect(planChange(styled, { kind: 'cardStyle', personId: SON, cardStyle: null })).toMatchObject(
      {
        kind: 'ok',
        summary: { kind: 'cardStyle', personId: SON, cleared: true },
      },
    );
    expect(
      planChange(tree, {
        kind: 'cardStyle',
        personId: '64b7f0c2a1b2c3d4e5f6afff',
        cardStyle: { frame: 'kraft' },
      }),
    ).toEqual({ kind: 'blocked', reason: 'PERSON_NOT_FOUND' });
  });
});

describe('decide (the tree changed meanwhile)', () => {
  const change = { kind: 'relate', personId: LOOSE, targetId: GRANDPA, relation: 'child' } as const;

  it('applies on the latest tree when the outcome is the same', () => {
    const seen = stateOf(FAMILY);
    const latest = applyOp(seen, {
      type: 'updatePerson',
      payload: { id: GRANDMA, changes: { fullName: 'Lê Thị Huệ' } },
    }).tree;
    expect(decide(latest, seen, change).kind).toBe('ok');
  });

  it('says out of date when the outcome is no longer the same', () => {
    const seen = stateOf(FAMILY);
    // Grandpa married again on another device: "child of Grandpa" now asks "with whom?".
    const SECOND_WIFE = '64b7f0c2a1b2c3d4e5f6a0ff';
    const latest = applyOp(seen, {
      type: 'batch',
      payload: {
        ops: [
          {
            type: 'addPerson',
            payload: fixturePerson(SECOND_WIFE, 'Đỗ Thị Sen', { gender: 'female' }),
          },
          {
            type: 'addUnion',
            payload: {
              id: '64b7f0c2a1b2c3d4e5f6b0ff',
              partnerIds: [GRANDPA, SECOND_WIFE],
              order: 2,
              status: 'married',
            },
          },
        ],
      },
    }).tree;
    expect(planChange(latest, change).kind).toBe('ask');
    expect(decide(latest, seen, change)).toEqual({ kind: 'outOfDate' });
    // Nothing changed: the same answer twice.
    expect(sameOutcome(planChange(seen, change), planChange(seen, change))).toBe(true);
  });
});
