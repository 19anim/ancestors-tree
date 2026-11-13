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
  const last = Math.max(0, ...index.childrenOf(target).map((child) => child.siblingOrder ?? 0));
  const extra: Partial<Person> = { parentUnionId: target };
  if (last < MAX_ORDER) extra.siblingOrder = last + 1;
  return { type: 'addPerson', payload: buildPerson(input, extra) };
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
            order: Math.min(MAX_ORDER, Math.max(0, ...unions.map((union) => union.order)) + 1),
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
