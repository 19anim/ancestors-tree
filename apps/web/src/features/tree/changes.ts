import {
  applyOp,
  cutMarriage,
  cutThreadOp,
  detach,
  OpError,
  relate,
  removeParentOp,
  unionStatusOp,
  type BatchOp,
  type PersonPhoto,
  type Relation,
  type RelateAnswers,
  type RelateBlock,
  type RelateEffect,
  type RelateQuestion,
  type TreeState,
  type UnionStatus,
} from '@ancestors-tree/shared/tree';

/** Every relationship change the editors make (spec §7.6), from any way in. */
export type Change =
  | { kind: 'relate'; personId: string; targetId: string; relation: Relation }
  | { kind: 'removeParent'; childId: string; parentId: string }
  | { kind: 'cutThread'; childId: string }
  | { kind: 'cutMarriage'; unionId: string }
  | { kind: 'status'; unionId: string; status: UnionStatus }
  | { kind: 'detach'; personId: string }
  | { kind: 'photo'; personId: string; photo: PersonPhoto | null };

export type ChangeQuestion =
  RelateQuestion | { kind: 'keepChildren'; partnerIds: [string, string] };

export interface ChangeAnswers extends RelateAnswers {
  /** keepChildren: the partner the children stay with. */
  keepWith?: string;
}

/** What a change did, for its sentence ("Đã đổi: …"). */
export type ChangeSummary =
  | { kind: 'relate'; effect: RelateEffect }
  | { kind: 'cutThread'; childId: string; parentIds: string[] }
  | { kind: 'removeParent'; childId: string; parentId: string }
  | { kind: 'cutMarriage'; partnerIds: string[] }
  | { kind: 'status'; partnerIds: string[]; status: UnionStatus }
  | { kind: 'detach'; personId: string }
  | { kind: 'photo'; personId: string; removed: boolean };

export type ChangeResult =
  | { kind: 'ok'; op: BatchOp; summary: ChangeSummary }
  | { kind: 'ask'; question: ChangeQuestion }
  | { kind: 'blocked'; reason: RelateBlock };

function blocked(reason: RelateBlock): ChangeResult {
  return { kind: 'blocked', reason };
}

/** The op as the server would take it: an OpError becomes a block with its code. */
function checked(
  tree: TreeState,
  build: () => BatchOp | null,
  summary: ChangeSummary,
): ChangeResult {
  try {
    const op = build();
    if (op === null) return blocked('ALREADY');
    applyOp(tree, op);
    return { kind: 'ok', op, summary };
  } catch (error) {
    if (error instanceof OpError) return blocked(error.code);
    throw error;
  }
}

export function planChange(
  tree: TreeState,
  change: Change,
  answers: ChangeAnswers = {},
): ChangeResult {
  switch (change.kind) {
    case 'relate': {
      const result = relate(tree, change.personId, change.targetId, change.relation, answers);
      return result.kind === 'ok'
        ? { kind: 'ok', op: result.op, summary: { kind: 'relate', effect: result.effect } }
        : result;
    }
    case 'removeParent':
      return checked(tree, () => removeParentOp(tree, change.childId, change.parentId), {
        kind: 'removeParent',
        childId: change.childId,
        parentId: change.parentId,
      });
    case 'cutThread': {
      const person = tree.persons[change.childId];
      if (person === undefined) return blocked('PERSON_NOT_FOUND');
      const unionId = person.parentUnionId;
      if (unionId === undefined) return blocked('ALREADY');
      const parentIds = [...(tree.unions[unionId]?.partnerIds ?? [])];
      return checked(tree, () => cutThreadOp(change.childId), {
        kind: 'cutThread',
        childId: change.childId,
        parentIds,
      });
    }
    case 'cutMarriage': {
      const union = tree.unions[change.unionId];
      if (union === undefined) return blocked('UNION_NOT_FOUND');
      const result = cutMarriage(tree, change.unionId, answers.keepWith);
      if (result.kind !== 'ok') return result;
      return {
        kind: 'ok',
        op: result.op,
        summary: { kind: 'cutMarriage', partnerIds: [...union.partnerIds] },
      };
    }
    case 'status': {
      const union = tree.unions[change.unionId];
      if (union === undefined) return blocked('UNION_NOT_FOUND');
      if (union.status === change.status) return blocked('ALREADY');
      return checked(tree, () => unionStatusOp(change.unionId, change.status), {
        kind: 'status',
        partnerIds: [...union.partnerIds],
        status: change.status,
      });
    }
    case 'detach': {
      const result = detach(tree, change.personId);
      return result.kind === 'ok'
        ? { kind: 'ok', op: result.op, summary: { kind: 'detach', personId: change.personId } }
        : result;
    }
    case 'photo': {
      const person = tree.persons[change.personId];
      if (person === undefined) return blocked('PERSON_NOT_FOUND');
      const current = person.photo;
      const same =
        change.photo === null
          ? current === undefined
          : current?.publicId === change.photo.publicId && current.version === change.photo.version;
      if (same) return blocked('ALREADY');
      return checked(
        tree,
        () => ({
          type: 'batch',
          payload: {
            ops: [
              {
                type: 'updatePerson',
                payload: { id: change.personId, changes: { photo: change.photo } },
              },
            ],
          },
        }),
        { kind: 'photo', personId: change.personId, removed: change.photo === null },
      );
    }
  }
}

/** The same outcome: what it does, asks or blocks for (new ids aside). */
export function sameOutcome(a: ChangeResult, b: ChangeResult): boolean {
  if (a.kind === 'ok' && b.kind === 'ok') {
    return JSON.stringify(a.summary) === JSON.stringify(b.summary);
  }
  if (a.kind === 'ask' && b.kind === 'ask') {
    return JSON.stringify(a.question) === JSON.stringify(b.question);
  }
  return a.kind === 'blocked' && b.kind === 'blocked' && a.reason === b.reason;
}

/**
 * The change on the latest tree. When the tree changed since the user saw the answer (while
 * dragging, or while a question was open) and the answer is not the same, nothing is applied:
 * the "tree has just changed" message shows instead (spec §7.6 "After a drop").
 */
export function decide(
  latest: TreeState,
  seen: TreeState,
  change: Change,
  answers: ChangeAnswers = {},
): ChangeResult | { kind: 'outOfDate' } {
  const result = planChange(latest, change, answers);
  if (latest === seen) return result;
  return sameOutcome(planChange(seen, change, answers), result) ? result : { kind: 'outOfDate' };
}
