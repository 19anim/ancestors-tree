import { buildTreeIndex, classifyLineage } from './lineage.ts';
import { OpError } from './op-error.ts';
import type { BatchOp } from './ops.ts';
import { blocked, detachFromParent, Draft, separateCouple, type RelateBlock } from './relate.ts';
import type { Union, UnionStatus } from './schemas.ts';
import type { TreeState } from './state.ts';

export interface Marriage {
  union: Union;
  /** The other partner; null for a one-person union. */
  partnerId: string | null;
  childIds: string[];
}

export interface PersonRelationships {
  parentUnionId: string | null;
  parentIds: string[];
  marriages: Marriage[];
}

/** A person's parents and marriages, for "Change relationship…" (spec §7.6). */
export function relationshipsOf(tree: TreeState, personId: string): PersonRelationships {
  const person = Object.hasOwn(tree.persons, personId) ? tree.persons[personId] : undefined;
  if (person === undefined) return { parentUnionId: null, parentIds: [], marriages: [] };
  const index = buildTreeIndex(tree);
  const parentUnionId = person.parentUnionId ?? null;
  return {
    parentUnionId,
    parentIds: parentUnionId === null ? [] : [...(tree.unions[parentUnionId]?.partnerIds ?? [])],
    marriages: index.unionsOf(personId).map((union) => ({
      union,
      partnerId: union.partnerIds.find((id) => id !== personId) ?? null,
      childIds: index.childrenOf(union.id).map((child) => child.id),
    })),
  };
}

/** The child leaves one parent and keeps the other; null when that is not their parent. */
export function removeParentOp(tree: TreeState, childId: string, parentId: string): BatchOp | null {
  const draft = new Draft(tree);
  detachFromParent(draft, childId, parentId);
  return draft.ops.length === 0 ? null : draft.batch();
}

/** Cutting a parent → child thread (spec §7.6). */
export function cutThreadOp(childId: string): BatchOp {
  return {
    type: 'batch',
    payload: { ops: [{ type: 'setParents', payload: { personId: childId, parentUnionId: null } }] },
  };
}

export type CutResult =
  | { kind: 'ok'; op: BatchOp }
  | { kind: 'ask'; question: { kind: 'keepChildren'; partnerIds: [string, string] } }
  | { kind: 'blocked'; reason: RelateBlock };

/** Cutting a marriage: who keeps the children is asked when there are any (spec §7.6). */
export function cutMarriage(tree: TreeState, unionId: string, keepWith?: string): CutResult {
  if (!Object.hasOwn(tree.unions, unionId)) return blocked('UNION_NOT_FOUND');
  const union = tree.unions[unionId] as Union;
  const hasChildren = buildTreeIndex(tree).childrenOf(unionId).length > 0;
  const draft = new Draft(tree);
  if (union.partnerIds.length === 2 && hasChildren) {
    if (keepWith === undefined || !union.partnerIds.includes(keepWith)) {
      return {
        kind: 'ask',
        question: { kind: 'keepChildren', partnerIds: [...union.partnerIds] as [string, string] },
      };
    }
    separateCouple(draft, union, keepWith);
  } else if (hasChildren) {
    // One partner with children: cutting it leaves the children without that parent.
    for (const child of buildTreeIndex(tree).childrenOf(unionId)) {
      draft.push({ type: 'setParents', payload: { personId: child.id, parentUnionId: null } });
    }
    draft.push({ type: 'deleteUnion', payload: { id: unionId } });
  } else {
    draft.push({ type: 'deleteUnion', payload: { id: unionId } });
  }
  return { kind: 'ok', op: draft.batch() };
}

/** Married, divorced or widowed (spec §7.6: a divorce is a status, not a cut). */
export function unionStatusOp(unionId: string, status: UnionStatus): BatchOp {
  return {
    type: 'batch',
    payload: { ops: [{ type: 'updateUnion', payload: { id: unionId, changes: { status } } }] },
  };
}

/**
 * A card dropped on the Loose photos tray (spec §7.6). Someone with parents leaves them and takes
 * their branch along; an in-law leaves their marriages to blood members, the children staying.
 */
export function detach(
  tree: TreeState,
  personId: string,
): { kind: 'ok'; op: BatchOp } | { kind: 'blocked'; reason: RelateBlock } {
  if (!Object.hasOwn(tree.persons, personId)) return blocked('PERSON_NOT_FOUND');
  if (tree.progenitorId === personId) return blocked('IS_PROGENITOR');
  try {
    const draft = new Draft(tree);
    if (tree.persons[personId]?.parentUnionId !== undefined) {
      draft.push({ type: 'setParents', payload: { personId, parentUnionId: null } });
    } else if (classifyLineage(tree).get(personId) === 'in-law') {
      const lineage = classifyLineage(tree);
      for (const union of buildTreeIndex(tree).unionsOf(personId)) {
        const partner = union.partnerIds.find((id) => id !== personId);
        if (partner !== undefined && lineage.get(partner) === 'blood') {
          separateCouple(draft, draft.tree.unions[union.id] as Union, partner);
        }
      }
    }
    return draft.ops.length === 0 ? blocked('ALREADY') : { kind: 'ok', op: draft.batch() };
  } catch (error) {
    if (error instanceof OpError) return blocked(error.code);
    throw error;
  }
}
