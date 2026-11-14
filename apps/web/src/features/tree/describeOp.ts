import type { Op, SingleOp, TreeState } from '@ancestors-tree/shared/tree';
import type { TFunction } from 'i18next';

/** Names of people and the partners of unions, wherever they can be found. */
export interface NameLookup {
  person(id: string): string | undefined;
  union(id: string): readonly string[] | undefined;
}

export function lookupIn(tree: TreeState): NameLookup {
  return {
    person: (id) => (Object.hasOwn(tree.persons, id) ? tree.persons[id]?.fullName : undefined),
    union: (id) => (Object.hasOwn(tree.unions, id) ? tree.unions[id]?.partnerIds : undefined),
  };
}

/** `lookup`, falling back to the people and unions the ops carry (someone deleted since). */
export function lookupWith(lookup: NameLookup, ops: readonly Op[]): NameLookup {
  const persons = new Map<string, string>();
  const unions = new Map<string, readonly string[]>();
  const collect = (op: Op): void => {
    switch (op.type) {
      case 'batch':
        op.payload.ops.forEach(collect);
        break;
      case 'addPerson':
        persons.set(op.payload.id, op.payload.fullName);
        break;
      case 'restorePerson':
        persons.set(op.payload.person.id, op.payload.person.fullName);
        for (const union of op.payload.unions) unions.set(union.id, union.partnerIds);
        break;
      case 'addUnion':
      case 'restoreUnion':
        unions.set(op.payload.id, op.payload.partnerIds);
        break;
      default:
        break;
    }
  };
  ops.forEach(collect);
  return {
    person: (id) => lookup.person(id) ?? persons.get(id),
    union: (id) => lookup.union(id) ?? unions.get(id),
  };
}

/** What a change did, with the names it is about (null: nobody knows the name any more). */
export type OpDescription =
  | { kind: 'addPerson' | 'updatePerson' | 'deletePerson' | 'restorePerson'; name: string | null }
  | { kind: 'addPeople' | 'changes'; count: number }
  | { kind: 'addUnion' | 'updateUnion' | 'deleteUnion' | 'restoreUnion'; names: (string | null)[] }
  | { kind: 'setParents'; name: string | null; parents: (string | null)[] }
  | { kind: 'detachParents'; name: string | null }
  | { kind: 'setProgenitor'; name: string | null }
  | { kind: 'clearProgenitor' };

function describeSingle(op: SingleOp, names: NameLookup): OpDescription {
  const person = (id: string) => names.person(id) ?? null;
  const partners = (id: string, fallback: readonly string[] = []) =>
    (names.union(id) ?? fallback).map(person);
  switch (op.type) {
    case 'addPerson':
      return { kind: 'addPerson', name: op.payload.fullName };
    case 'updatePerson':
      return { kind: 'updatePerson', name: person(op.payload.id) };
    case 'deletePerson':
      return { kind: 'deletePerson', name: person(op.payload.id) };
    case 'restorePerson':
      return { kind: 'restorePerson', name: op.payload.person.fullName };
    case 'addUnion':
    case 'restoreUnion':
      return { kind: op.type, names: op.payload.partnerIds.map(person) };
    case 'updateUnion':
      return { kind: 'updateUnion', names: partners(op.payload.id, op.payload.changes.partnerIds) };
    case 'deleteUnion':
      return { kind: 'deleteUnion', names: partners(op.payload.id) };
    case 'setParents':
      return op.payload.parentUnionId === null
        ? { kind: 'detachParents', name: person(op.payload.personId) }
        : {
            kind: 'setParents',
            name: person(op.payload.personId),
            parents: partners(op.payload.parentUnionId),
          };
    case 'setProgenitor':
      return op.payload.personId === null
        ? { kind: 'clearProgenitor' }
        : { kind: 'setProgenitor', name: person(op.payload.personId) };
  }
}

const PERSON_OPS = new Set<SingleOp['type']>(['addPerson', 'deletePerson', 'restorePerson']);

/**
 * One change in words. A batch reads as the one person it adds, deletes or restores (adding a
 * child or a spouse also adds a union), as "add N people", or else as "N changes".
 */
export function describeOp(op: Op, lookup: NameLookup): OpDescription {
  const names = lookupWith(lookup, [op]);
  if (op.type !== 'batch') return describeSingle(op, names);
  const ops = op.payload.ops;
  const people = ops.filter((child) => PERSON_OPS.has(child.type));
  const [onlyPerson] = people;
  if (people.length === 1 && onlyPerson) return describeSingle(onlyPerson, names);
  if (
    people.length > 1 &&
    ops.every((child) => child.type === 'addPerson' || child.type === 'addUnion')
  ) {
    return { kind: 'addPeople', count: people.length };
  }
  const [only] = ops;
  if (ops.length === 1 && only) return describeSingle(only, names);
  return { kind: 'changes', count: ops.length };
}

function nameOf(t: TFunction, name: string | null): string {
  return name ?? t('tree.change.someone');
}

function namesOf(t: TFunction, names: readonly (string | null)[]): string {
  const [first, second] = names;
  if (names.length >= 2) {
    return t('tree.change.pair', {
      first: nameOf(t, first ?? null),
      second: nameOf(t, second ?? null),
    });
  }
  return nameOf(t, first ?? null);
}

/** The change as a lower-case phrase: "thêm Nguyễn Văn Út", "xoá hôn nhân của A và B". */
export function describeAction(t: TFunction, description: OpDescription): string {
  switch (description.kind) {
    case 'addPerson':
    case 'updatePerson':
    case 'deletePerson':
    case 'restorePerson':
    case 'detachParents':
    case 'setProgenitor':
      return t(`tree.change.${description.kind}`, { name: nameOf(t, description.name) });
    case 'addPeople':
    case 'changes':
      return t(`tree.change.${description.kind}`, { count: description.count });
    case 'addUnion':
    case 'updateUnion':
    case 'deleteUnion':
    case 'restoreUnion':
      return t(`tree.change.${description.kind}`, { names: namesOf(t, description.names) });
    case 'setParents':
      return t('tree.change.setParents', {
        name: nameOf(t, description.name),
        parents: namesOf(t, description.parents),
      });
    case 'clearProgenitor':
      return t('tree.change.clearProgenitor');
  }
}
