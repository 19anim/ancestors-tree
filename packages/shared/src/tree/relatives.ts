import { buildTreeIndex, classifyLineage } from './lineage.ts';
import type { TreeState } from './state.ts';

/** Which way to step from a person on the chart (spec §7.8). */
export type RelativeDirection = 'parent' | 'child' | 'prev' | 'next';

/**
 * The relative one step from `personId` on the chart (spec §7.8), or null when there is none
 * that way. A blood member goes to a parent (the blood one first), the eldest child of their
 * first union with children, or the previous or next sibling in chart order; an in-law goes
 * sideways to the spouse. The answer is always on the chart (blood or in-law), never unlinked.
 */
export function relativeOf(
  tree: TreeState,
  personId: string,
  direction: RelativeDirection,
): string | null {
  const person = tree.persons[personId];
  const index = buildTreeIndex(tree);
  const lineage = classifyLineage(tree, index);
  const kind = lineage.get(personId);
  if (!person || kind === undefined || kind === 'unlinked') return null;

  if (kind === 'in-law') {
    if (direction !== 'prev' && direction !== 'next') return null;
    for (const union of index.unionsOf(personId)) {
      const spouse = union.partnerIds.find((id) => lineage.get(id) === 'blood');
      if (spouse !== undefined) return spouse;
    }
    return null;
  }

  const parentUnion =
    person.parentUnionId === undefined ? undefined : tree.unions[person.parentUnionId];
  switch (direction) {
    case 'parent': {
      // The progenitor's parents, when recorded, are unlinked: neither lookup finds them.
      const parents = parentUnion?.partnerIds ?? [];
      return (
        parents.find((id) => lineage.get(id) === 'blood') ??
        parents.find((id) => lineage.get(id) === 'in-law') ??
        null
      );
    }
    case 'child': {
      // Children of a blood member are blood: always on the chart.
      for (const union of index.unionsOf(personId)) {
        const eldest = index.childrenOf(union.id)[0];
        if (eldest !== undefined) return eldest.id;
      }
      return null;
    }
    case 'prev':
    case 'next': {
      if (parentUnion === undefined) return null;
      // The progenitor's siblings are unlinked; everyone else's are blood, like them.
      const siblings = index
        .childrenOf(parentUnion.id)
        .filter((sibling) => lineage.get(sibling.id) === 'blood');
      const at = siblings.findIndex((sibling) => sibling.id === personId);
      return siblings[direction === 'prev' ? at - 1 : at + 1]?.id ?? null;
    }
  }
}
