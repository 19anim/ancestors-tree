import { relativeOf, type RelativeDirection, type TreeState } from '@ancestors-tree/shared/tree';

export type RelativeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const DIRECTION: Record<RelativeKey, RelativeDirection> = {
  ArrowUp: 'parent',
  ArrowDown: 'child',
  ArrowLeft: 'prev',
  ArrowRight: 'next',
};

export function isRelativeKey(key: string): key is RelativeKey {
  return Object.hasOwn(DIRECTION, key);
}

/**
 * The card an arrow key moves to from `personId` (spec §7.8), or null. Board cards only: the
 * answer is always a blood member or an in-law, never someone in the "Loose photos" tray.
 */
export function relativeTarget(tree: TreeState, personId: string, key: RelativeKey): string | null {
  return relativeOf(tree, personId, DIRECTION[key]);
}
