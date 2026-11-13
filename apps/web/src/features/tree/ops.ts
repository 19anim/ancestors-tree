import {
  newObjectId,
  type Gender,
  type Op,
  type Person,
  type SingleOp,
  type TreeIndex,
  type Union,
} from '@ancestors-tree/shared/tree';

/** What the P5 form asks (dates arrive with DualDateInput in P6). */
export interface NewPersonInput {
  fullName: string;
  gender: Gender;
  isDeceased: boolean;
}

/** The highest `siblingOrder` and union `order` the schemas accept (both are 1–99). */
const MAX_ORDER = 99;

export function buildPerson(input: NewPersonInput, extra: Partial<Person> = {}): Person {
  return {
    id: newObjectId(),
    fullName: input.fullName.trim(),
    aliases: [],
    gender: input.gender,
    death: { isDeceased: input.isDeceased },
    isAdopted: false,
    ...extra,
  };
}

export function addFirstPersonOp(input: NewPersonInput): Op {
  return { type: 'addPerson', payload: buildPerson(input) };
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
