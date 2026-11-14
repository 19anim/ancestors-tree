import { isObjectId } from './ids.ts';
import { OpError } from './op-error.ts';
import type { Op, SingleOp } from './ops.ts';
import {
  MAX_PERSONS,
  type Person,
  type PersonChanges,
  type Union,
  type UnionChanges,
} from './schemas.ts';
import type { TreeState } from './state.ts';

export interface ApplyOpResult {
  tree: TreeState;
  /** The op that undoes this one (spec §6.1). */
  inverse: Op;
}

interface SingleResult {
  tree: TreeState;
  inverse: SingleOp;
}

function withEntry<T>(
  record: Readonly<Record<string, T>>,
  id: string,
  value: T,
): Record<string, T> {
  return { ...record, [id]: value };
}

function withoutEntry<T>(record: Readonly<Record<string, T>>, id: string): Record<string, T> {
  const copy = { ...record };
  delete copy[id];
  return copy;
}

function getPerson(tree: TreeState, id: string): Person {
  const person = tree.persons[id];
  if (!person) throw new OpError('PERSON_NOT_FOUND', `Person ${id} does not exist`);
  return person;
}

function getUnion(tree: TreeState, id: string): Union {
  const union = tree.unions[id];
  if (!union) throw new OpError('UNION_NOT_FOUND', `Union ${id} does not exist`);
  return union;
}

/** Clients generate ids (spec §6.1), so they are checked like any other input. */
function assertNewId(tree: TreeState, id: string): void {
  if (!isObjectId(id)) throw new OpError('INVALID_ID', `"${id}" is not an ObjectId`);
  if (Object.hasOwn(tree.persons, id) || Object.hasOwn(tree.unions, id)) {
    throw new OpError('DUPLICATE_ID', `Id ${id} is already used`);
  }
}

function assertRoomForPerson(tree: TreeState): void {
  if (Object.keys(tree.persons).length >= MAX_PERSONS) throw new OpError('TREE_FULL');
}

function assertDistinctPartners(partnerIds: readonly string[]): void {
  if (
    partnerIds.length < 1 ||
    partnerIds.length > 2 ||
    new Set(partnerIds).size !== partnerIds.length
  ) {
    throw new OpError('INVALID_PARTNERS');
  }
}

function assertPartners(tree: TreeState, partnerIds: readonly string[]): void {
  assertDistinctPartners(partnerIds);
  for (const partnerId of partnerIds) getPerson(tree, partnerId);
}

/** True when someone was born into one of these unions. One pass over the people. */
function anyChildOf(tree: TreeState, unionIds: ReadonlySet<string>): boolean {
  for (const person of Object.values(tree.persons)) {
    if (person.parentUnionId !== undefined && unionIds.has(person.parentUnionId)) return true;
  }
  return false;
}

/**
 * True when the person is their own ancestor: walking up from their parents' union, through
 * each partner's parents' union, reaches a union they are a partner of. Visits each union once.
 */
export function isOwnAncestor(tree: TreeState, personId: string): boolean {
  const start = tree.persons[personId]?.parentUnionId;
  if (start === undefined) return false;
  const queue: string[] = [start];
  const seen = new Set<string>(queue);
  for (let index = 0; index < queue.length; index += 1) {
    const union = tree.unions[queue[index] as string];
    for (const partnerId of union?.partnerIds ?? []) {
      if (partnerId === personId) return true;
      const parent = tree.persons[partnerId]?.parentUnionId;
      if (parent !== undefined && !seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return false;
}

function assertNoCycle(tree: TreeState, personIds: readonly string[]): void {
  for (const personId of personIds) {
    if (isOwnAncestor(tree, personId)) {
      throw new OpError('CYCLE', `Person ${personId} would become their own ancestor`);
    }
  }
}

function addPerson(tree: TreeState, person: Person): SingleResult {
  assertNewId(tree, person.id);
  assertRoomForPerson(tree);
  if (person.parentUnionId !== undefined) getUnion(tree, person.parentUnionId);
  return {
    tree: { ...tree, persons: withEntry(tree.persons, person.id, person) },
    inverse: { type: 'deletePerson', payload: { id: person.id } },
  };
}

function updatePerson(tree: TreeState, id: string, changes: PersonChanges): SingleResult {
  const person = getPerson(tree, id);
  const current = person as Record<string, unknown>;
  const next: Record<string, unknown> = { ...person };
  const previous: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    // null clears a field; an absent old value goes back as null for the same reason.
    previous[field] = current[field] ?? null;
    if (value === null) delete next[field];
    else next[field] = value;
  }
  return {
    tree: { ...tree, persons: withEntry(tree.persons, id, next as Person) },
    inverse: { type: 'updatePerson', payload: { id, changes: previous as PersonChanges } },
  };
}

function deletePerson(tree: TreeState, id: string): SingleResult {
  const person = getPerson(tree, id);
  if (tree.progenitorId === id) throw new OpError('PROGENITOR_PROTECTED');
  const own = Object.values(tree.unions).filter((union) => union.partnerIds.includes(id));
  if (anyChildOf(tree, new Set(own.map((union) => union.id)))) {
    throw new OpError('PERSON_HAS_CHILDREN');
  }
  const unions = { ...tree.unions };
  for (const union of own) {
    if (union.partnerIds.length === 1) delete unions[union.id];
    else unions[union.id] = { ...union, partnerIds: union.partnerIds.filter((p) => p !== id) };
  }
  return {
    tree: { ...tree, persons: withoutEntry(tree.persons, id), unions },
    inverse: { type: 'restorePerson', payload: { person, unions: own } },
  };
}

/** addUnion and restoreUnion. A brand-new union has no children, so it cannot make a cycle. */
function addUnion(tree: TreeState, union: Union): SingleResult {
  assertNewId(tree, union.id);
  assertPartners(tree, union.partnerIds);
  return {
    tree: { ...tree, unions: withEntry(tree.unions, union.id, union) },
    inverse: { type: 'deleteUnion', payload: { id: union.id } },
  };
}

function updateUnion(tree: TreeState, id: string, changes: UnionChanges): SingleResult {
  const union = getUnion(tree, id);
  const next: Union = { ...union };
  const previous: UnionChanges = {};
  if (changes.partnerIds !== undefined) {
    assertPartners(tree, changes.partnerIds);
    previous.partnerIds = union.partnerIds;
    next.partnerIds = changes.partnerIds;
  }
  if (changes.order !== undefined) {
    previous.order = union.order;
    next.order = changes.order;
  }
  if (changes.status !== undefined) {
    previous.status = union.status;
    next.status = changes.status;
  }
  const nextTree: TreeState = { ...tree, unions: withEntry(tree.unions, id, next) };
  if (changes.partnerIds !== undefined) assertNoCycle(nextTree, changes.partnerIds);
  return { tree: nextTree, inverse: { type: 'updateUnion', payload: { id, changes: previous } } };
}

function deleteUnion(tree: TreeState, id: string): SingleResult {
  const union = getUnion(tree, id);
  if (anyChildOf(tree, new Set([id]))) throw new OpError('UNION_HAS_CHILDREN');
  return {
    tree: { ...tree, unions: withoutEntry(tree.unions, id) },
    inverse: { type: 'restoreUnion', payload: union },
  };
}

function setParents(tree: TreeState, personId: string, parentUnionId: string | null): SingleResult {
  const person = getPerson(tree, personId);
  if (parentUnionId !== null) getUnion(tree, parentUnionId);
  const { parentUnionId: previous, ...rest } = person;
  const nextPerson: Person = parentUnionId === null ? rest : { ...rest, parentUnionId };
  const nextTree: TreeState = { ...tree, persons: withEntry(tree.persons, personId, nextPerson) };
  if (parentUnionId !== null) assertNoCycle(nextTree, [personId]);
  return {
    tree: nextTree,
    inverse: { type: 'setParents', payload: { personId, parentUnionId: previous ?? null } },
  };
}

function restorePerson(tree: TreeState, person: Person, snapshots: readonly Union[]): SingleResult {
  assertNewId(tree, person.id);
  assertRoomForPerson(tree);
  const unions = { ...tree.unions };
  for (const snapshot of snapshots) {
    assertDistinctPartners(snapshot.partnerIds);
    if (!snapshot.partnerIds.includes(person.id)) {
      throw new OpError('INVALID_PARTNERS', `Union ${snapshot.id} does not include the person`);
    }
    for (const partnerId of snapshot.partnerIds) {
      if (partnerId !== person.id) getPerson(tree, partnerId);
    }
    const current = tree.unions[snapshot.id];
    if (current) {
      // The union kept the other partner when the person was deleted; it may not have gained
      // anyone else since.
      if (!current.partnerIds.every((partnerId) => snapshot.partnerIds.includes(partnerId))) {
        throw new OpError('RESTORE_CONFLICT', `Union ${snapshot.id} has changed partners`);
      }
    } else {
      assertNewId(tree, snapshot.id);
    }
    unions[snapshot.id] = snapshot;
  }
  const nextTree: TreeState = {
    ...tree,
    persons: withEntry(tree.persons, person.id, person),
    unions,
  };
  if (person.parentUnionId !== undefined) getUnion(nextTree, person.parentUnionId);
  assertNoCycle(nextTree, [person.id]);
  return { tree: nextTree, inverse: { type: 'deletePerson', payload: { id: person.id } } };
}

function setProgenitor(tree: TreeState, personId: string | null): SingleResult {
  if (personId !== null) getPerson(tree, personId);
  return {
    tree: { ...tree, progenitorId: personId },
    inverse: { type: 'setProgenitor', payload: { personId: tree.progenitorId } },
  };
}

function applySingle(tree: TreeState, op: SingleOp): SingleResult {
  switch (op.type) {
    case 'addPerson':
      return addPerson(tree, op.payload);
    case 'updatePerson':
      return updatePerson(tree, op.payload.id, op.payload.changes);
    case 'deletePerson':
      return deletePerson(tree, op.payload.id);
    case 'addUnion':
    case 'restoreUnion':
      return addUnion(tree, op.payload);
    case 'updateUnion':
      return updateUnion(tree, op.payload.id, op.payload.changes);
    case 'deleteUnion':
      return deleteUnion(tree, op.payload.id);
    case 'setParents':
      return setParents(tree, op.payload.personId, op.payload.parentUnionId);
    case 'restorePerson':
      return restorePerson(tree, op.payload.person, op.payload.unions);
    case 'setProgenitor':
      return setProgenitor(tree, op.payload.personId);
  }
}

/**
 * Applies one change without mutating the tree and returns the new tree plus the op that undoes
 * it. Throws OpError when a rule of spec §6.1 forbids the change. The browser (optimistic
 * updates) and the API (inside the write transaction) run this same function.
 */
export function applyOp(tree: TreeState, op: Op): ApplyOpResult {
  if (op.type !== 'batch') return applySingle(tree, op);
  let current = tree;
  const inverses: SingleOp[] = [];
  for (const child of op.payload.ops) {
    const result = applySingle(current, child);
    current = result.tree;
    inverses.push(result.inverse);
  }
  return { tree: current, inverse: { type: 'batch', payload: { ops: inverses.reverse() } } };
}
