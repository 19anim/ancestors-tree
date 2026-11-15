import { buildTreeIndex, classifyLineage, type TreeState } from '@ancestors-tree/shared/tree';

export type RelativeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isRelativeKey(key: string): key is RelativeKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

/**
 * The card an arrow key moves to from `personId` (spec §7.8), or null. Board cards only: the
 * answer is always a blood member or an in-law, never someone in the "Loose photos" tray.
 */
export function relativeTarget(tree: TreeState, personId: string, key: RelativeKey): string | null {
  const person = tree.persons[personId];
  const index = buildTreeIndex(tree);
  const lineage = classifyLineage(tree, index);
  const kind = lineage.get(personId);
  if (!person || kind === undefined || kind === 'unlinked') return null;

  if (kind === 'in-law') {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    for (const union of index.unionsOf(personId)) {
      const spouse = union.partnerIds.find((id) => lineage.get(id) === 'blood');
      if (spouse !== undefined) return spouse;
    }
    return null;
  }

  const parentUnion =
    person.parentUnionId === undefined ? undefined : tree.unions[person.parentUnionId];
  switch (key) {
    case 'ArrowUp': {
      // The progenitor's parents, when recorded, are not on the board: neither lookup finds them.
      const parents = parentUnion?.partnerIds ?? [];
      return (
        parents.find((id) => lineage.get(id) === 'blood') ??
        parents.find((id) => lineage.get(id) === 'in-law') ??
        null
      );
    }
    case 'ArrowDown': {
      // Children of a blood member are blood: always on the board.
      for (const union of index.unionsOf(personId)) {
        const eldest = index.childrenOf(union.id)[0];
        if (eldest !== undefined) return eldest.id;
      }
      return null;
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (parentUnion === undefined) return null;
      // The progenitor's siblings are in the tray; everyone else's are blood, like them.
      const siblings = index
        .childrenOf(parentUnion.id)
        .filter((sibling) => lineage.get(sibling.id) === 'blood');
      const at = siblings.findIndex((sibling) => sibling.id === personId);
      return siblings[key === 'ArrowLeft' ? at - 1 : at + 1]?.id ?? null;
    }
  }
}
