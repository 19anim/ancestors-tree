import { isObjectId } from './ids.ts';
import { OpError } from './op-error.ts';
import type { Op, SingleOp } from './ops.ts';
import {
  MAX_PERSONS,
  MAX_UNIONS_PER_PERSON,
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

// Object.hasOwn: an id such as "constructor" must not find Object.prototype's members.
function getPerson(tree: TreeState, id: string): Person {
  if (!Object.hasOwn(tree.persons, id)) {
    throw new OpError('PERSON_NOT_FOUND', `Person ${id} does not exist`);
  }
  return tree.persons[id] as Person;
}

function getUnion(tree: TreeState, id: string): Union {
  if (!Object.hasOwn(tree.unions, id)) {
    throw new OpError('UNION_NOT_FOUND', `Union ${id} does not exist`);
  }
  return tree.unions[id] as Union;
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

function unionCount(tree: TreeState, personId: string, except?: string): number {
  let count = 0;
  for (const union of Object.values(tree.unions)) {
    if (union.id !== except && union.partnerIds.includes(personId)) count += 1;
  }
  return count;
}

/**
 * Keeps every person within MAX_UNIONS_PER_PERSON, so the restorePerson that undoes a delete
 * always fits one op. `except` is a union being changed: it is not counted twice.
 */
function assertRoomForUnions(
  tree: TreeState,
  partnerIds: readonly string[],
  except?: string,
): void {
  for (const partnerId of partnerIds) {
    if (unionCount(tree, partnerId, except) >= MAX_UNIONS_PER_PERSON) {
      throw new OpError('TOO_MANY_UNIONS', `Person ${partnerId} already has the most unions`);
    }
  }
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
  assertRoomForUnions(tree, union.partnerIds);
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
    assertRoomForUnions(tree, changes.partnerIds, id);
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
  if (snapshots.length > MAX_UNIONS_PER_PERSON) {
    throw new OpError('TOO_MANY_UNIONS', `Person ${person.id} would have too many unions`);
  }
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
  if (snapshotIds.size !== snapshots.length || snapshotIds.has(person.id)) {
    throw new OpError('DUPLICATE_ID', 'A union in the snapshot repeats an id');
  }
  const unions = { ...tree.unions };
  for (const snapshot of snapshots) {
    assertDistinctPartners(snapshot.partnerIds);
    if (!snapshot.partnerIds.includes(person.id)) {
      throw new OpError('INVALID_PARTNERS', `Union ${snapshot.id} does not include the person`);
    }
    for (const partnerId of snapshot.partnerIds) {
      if (partnerId !== person.id) getPerson(tree, partnerId);
    }
    if (Object.hasOwn(tree.unions, snapshot.id)) {
      const current = tree.unions[snapshot.id] as Union;
      // The union kept the other partner when the person was deleted; it may not have gained
      // anyone else since.
      if (!current.partnerIds.every((partnerId) => snapshot.partnerIds.includes(partnerId))) {
        throw new OpError('RESTORE_CONFLICT', `Union ${snapshot.id} has changed partners`);
      }
      // Only the person comes back: a later order or status edit of the union stays.
      unions[snapshot.id] = { ...current, partnerIds: snapshot.partnerIds };
    } else {
      assertNewId(tree, snapshot.id);
      unions[snapshot.id] = snapshot;
    }
  }
  const nextTree: TreeState = {
    ...tree,
    persons: withEntry(tree.persons, person.id, person),
    unions,
  };
  for (const partnerId of new Set(snapshots.flatMap((snapshot) => snapshot.partnerIds))) {
    if (unionCount(nextTree, partnerId) > MAX_UNIONS_PER_PERSON) {
      throw new OpError('TOO_MANY_UNIONS', `Person ${partnerId} would have too many unions`);
    }
  }
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
