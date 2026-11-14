import type { Person, Union } from './schemas.ts';

/**
 * A whole family tree. Records keyed by id: O(1) lookups, plain JSON, and immutable updates
 * that copy one record and keep every untouched Person and Union object (structural sharing),
 * so changed documents and changed cards are found by comparing references.
 */
export interface TreeState {
  readonly progenitorId: string | null;
  readonly persons: Readonly<Record<string, Person>>;
  readonly unions: Readonly<Record<string, Union>>;
}

export const EMPTY_TREE: TreeState = { progenitorId: null, persons: {}, unions: {} };

export function treeStateFromLists(
  progenitorId: string | null,
  persons: readonly Person[],
  unions: readonly Union[],
): TreeState {
  return {
    progenitorId,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
    unions: Object.fromEntries(unions.map((union) => [union.id, union])),
  };
}
