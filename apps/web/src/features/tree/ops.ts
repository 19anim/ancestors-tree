import {
  MAX_BATCH_OPS,
  newObjectId,
  type DateInfo,
  type Gender,
  type Op,
  type Person,
  type SingleOp,
  type TreeIndex,
  type TreeState,
  type Union,
} from '@ancestors-tree/shared/tree';

/** What the person form asks; the dates are already parsed by its schema. */
export interface NewPersonInput {
  fullName: string;
  gender: Gender;
  isDeceased: boolean;
  birth?: DateInfo;
  /** Only read when `isDeceased`. */
  deathDate?: DateInfo;
}

/** The highest `siblingOrder` and union `order` the schemas accept (both are 1–99). */
const MAX_ORDER = 99;

export function buildPerson(input: NewPersonInput, extra: Partial<Person> = {}): Person {
  return {
    id: newObjectId(),
    fullName: input.fullName.trim(),
    aliases: [],
    gender: input.gender,
    ...(input.birth ? { birth: input.birth } : {}),
    death:
      input.isDeceased && input.deathDate
        ? { isDeceased: true, date: input.deathDate }
        : { isDeceased: input.isDeceased },
    isAdopted: false,
    ...extra,
  };
}

export function addFirstPersonOp(input: NewPersonInput): Extract<Op, { type: 'addPerson' }> {
  return { type: 'addPerson', payload: buildPerson(input) };
}

/** "Add several people" sends one batch, so at most a batch's ops (spec §7.6: 500 rows). */
export const MAX_SEVERAL = MAX_BATCH_OPS;

/** People without relationships, in one batch: one undo step; they start in Loose photos. */
export function addSeveralOp(inputs: readonly NewPersonInput[]): Op {
  return {
    type: 'batch',
    payload: { ops: inputs.map((input) => ({ type: 'addPerson', payload: buildPerson(input) })) },
  };
}

/**
 * A child of `parentId` in `unionId` (default: the parent's first union). Someone without a
 * union gets a one-parent union first, in the same batch.
 */
export function addChildOp(
  index: TreeIndex,
  parentId: string,
  input: NewPersonInput,
  unionId?: string,
): Op {
  const target = unionId ?? index.unionsOf(parentId)[0]?.id;
  if (target === undefined) {
    const union: Union = { id: newObjectId(), partnerIds: [parentId], order: 1, status: 'married' };
    return {
      type: 'batch',
      payload: {
        ops: [
          { type: 'addUnion', payload: union },
          {
            type: 'addPerson',
            payload: buildPerson(input, { parentUnionId: union.id, siblingOrder: 1 }),
          },
        ],
      },
    };
  }
  // The new child is the youngest. Children without a siblingOrder sort after every numbered
  // one (then by id), so when a sibling has none, or the highest order is taken, the new child
  // gets none either: its id is newer than theirs, so it still sorts last.
  const siblings = index.childrenOf(target);
  const extra: Partial<Person> = { parentUnionId: target };
  if (siblings.every((child) => child.siblingOrder !== undefined)) {
    const last = Math.max(0, ...siblings.map((child) => child.siblingOrder ?? 0));
    if (last < MAX_ORDER) extra.siblingOrder = last + 1;
  }
  return { type: 'addPerson', payload: buildPerson(input, extra) };
}

/** The order after the person's last union; past the schema's 99, the lowest free one. */
function nextUnionOrder(unions: readonly Union[]): number {
  const taken = new Set(unions.map((union) => union.order));
  const last = Math.max(0, ...taken);
  if (last < MAX_ORDER) return last + 1;
  for (let order = 1; order < MAX_ORDER; order += 1) {
    if (!taken.has(order)) return order;
  }
  // 99 marriages: no free order is left, so the new one shares the last (then sorts by id).
  return MAX_ORDER;
}

/**
 * A spouse of `personId`. When the person has a one-parent union (children added before the
 * spouse), the spouse joins it; otherwise a new union comes after the existing ones.
 */
export function addSpouseOp(index: TreeIndex, personId: string, input: NewPersonInput): Op {
  const spouse = buildPerson(input);
  const unions = index.unionsOf(personId);
  const alone = unions.find((union) => union.partnerIds.length === 1);
  const link: SingleOp =
    alone !== undefined
      ? {
          type: 'updateUnion',
          payload: { id: alone.id, changes: { partnerIds: [personId, spouse.id] } },
        }
      : {
          type: 'addUnion',
          payload: {
            id: newObjectId(),
            partnerIds: [personId, spouse.id],
            order: nextUnionOrder(unions),
            status: 'married',
          },
        };
  return { type: 'batch', payload: { ops: [{ type: 'addPerson', payload: spouse }, link] } };
}

export function deletePersonOp(id: string): Op {
  return { type: 'deletePerson', payload: { id } };
}

export function setProgenitorOp(personId: string | null): Op {
  return { type: 'setProgenitor', payload: { personId } };
}

export type ParentSlot =
  | { kind: 'none' }
  | { kind: 'one'; union: Union; parent: Person; siblings: readonly Person[] }
  | { kind: 'full' };

/** Where a new parent of `childId` goes (spec §7.6 "Add parent"). */
export function parentSlot(tree: TreeState, index: TreeIndex, childId: string): ParentSlot {
  const unionId = tree.persons[childId]?.parentUnionId;
  const union = unionId === undefined ? undefined : tree.unions[unionId];
  if (union === undefined) return { kind: 'none' };
  const parent =
    union.partnerIds.length === 1 ? tree.persons[union.partnerIds[0] ?? ''] : undefined;
  if (parent === undefined) return { kind: 'full' };
  const siblings = index.childrenOf(union.id).filter((child) => child.id !== childId);
  return { kind: 'one', union, parent, siblings };
}

/**
 * A parent of `childId`, as one op: with no parents, a one-parent union and setParents; with
 * one, the second partner of that union. `makeProgenitor` ends the batch with setProgenitor.
 * Not for a child with two parents: availableActions does not offer it then, and the form
 * refuses it when both became known while it was open.
 */
export function addParentOp(
  tree: TreeState,
  index: TreeIndex,
  childId: string,
  input: NewPersonInput,
  makeProgenitor: boolean,
): Op {
  const parent = buildPerson(input);
  const slot = parentSlot(tree, index, childId);
  const ops: SingleOp[] = [{ type: 'addPerson', payload: parent }];
  if (slot.kind === 'one') {
    ops.push({
      type: 'updateUnion',
      payload: { id: slot.union.id, changes: { partnerIds: [slot.parent.id, parent.id] } },
    });
  } else {
    const union: Union = {
      id: newObjectId(),
      partnerIds: [parent.id],
      order: 1,
      status: 'married',
    };
    ops.push(
      { type: 'addUnion', payload: union },
      { type: 'setParents', payload: { personId: childId, parentUnionId: union.id } },
    );
  }
  if (makeProgenitor) ops.push({ type: 'setProgenitor', payload: { personId: parent.id } });
  return { type: 'batch', payload: { ops } };
}
