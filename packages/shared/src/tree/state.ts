import type { Person, Union } from './schemas.ts';
import type { TreeTheme } from './theme.ts';

/**
 * A whole family tree. Records keyed by id: O(1) lookups, plain JSON, and immutable updates
 * that copy one record and keep every untouched Person and Union object (structural sharing),
 * so changed documents and changed cards are found by comparing references.
 */
export interface TreeState {
  readonly progenitorId: string | null;
  readonly persons: Readonly<Record<string, Person>>;
  readonly unions: Readonly<Record<string, Union>>;
  /** The clan's shared tree theme (spec §13.4): changed by `setTreeTheme`, saved on the Clan. */
  readonly theme: TreeTheme;
}

export const EMPTY_TREE: TreeState = { progenitorId: null, persons: {}, unions: {}, theme: {} };

export function treeStateFromLists(
  progenitorId: string | null,
  persons: readonly Person[],
  unions: readonly Union[],
  theme: TreeTheme = {},
): TreeState {
  return {
    progenitorId,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
    unions: Object.fromEntries(unions.map((union) => [union.id, union])),
    theme,
  };
}
