import {
  buildTreeIndex,
  classifyLineage,
  type TreeIndex,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  Crown,
  HeartPlus,
  Trash2,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import { createContext } from 'react';
import { parentSlot } from './ops';

export type PersonActionId =
  'addChild' | 'addSpouse' | 'addParent' | 'moveEarlier' | 'moveLater' | 'setProgenitor' | 'delete';

/** The sibling just before or after the person, as the chart orders them; null when none. */
export function siblingNeighbour(
  tree: TreeState,
  index: TreeIndex,
  personId: string,
  side: 'earlier' | 'later',
): string | null {
  const unionId = tree.persons[personId]?.parentUnionId;
  if (unionId === undefined) return null;
  const ids = index.childrenOf(unionId).map((child) => child.id);
  const at = ids.indexOf(personId);
  if (at === -1) return null;
  return ids[side === 'earlier' ? at - 1 : at + 1] ?? null;
}

/** What an editor can do to a person (spec §7.6), in the order the panel and the menu list them. */
export function availableActions(
  tree: TreeState,
  personId: string,
  isOwner: boolean,
): PersonActionId[] {
  if (!tree.persons[personId]) return [];
  const actions: PersonActionId[] = ['addChild', 'addSpouse'];
  const isProgenitor = tree.progenitorId === personId;
  const index = buildTreeIndex(tree);
  // In-laws' parents belong in their birth family (spec §7.6, §8).
  const inLaw = classifyLineage(tree, index).get(personId) === 'in-law';
  const slot = parentSlot(tree, index, personId).kind;
  if (!inLaw && slot !== 'full' && (!isProgenitor || isOwner)) actions.push('addParent');
  if (siblingNeighbour(tree, index, personId, 'earlier') !== null) actions.push('moveEarlier');
  if (siblingNeighbour(tree, index, personId, 'later') !== null) actions.push('moveLater');
  if (isOwner && !isProgenitor) actions.push('setProgenitor');
  actions.push('delete');
  return actions;
}

export const ACTION_ICONS: Record<PersonActionId, LucideIcon> = {
  addChild: Baby,
  addSpouse: HeartPlus,
  addParent: UserRoundPlus,
  moveEarlier: ArrowLeft,
  moveLater: ArrowRight,
  setProgenitor: Crown,
  delete: Trash2,
};

/** Typed, so `t` checks the key exists in the locales. */
export function actionLabelKey(action: PersonActionId): `tree.actions.${PersonActionId}` {
  return `tree.actions.${action}`;
}

export interface PersonActionsApi {
  /** Read when a menu opens, from the latest tree. */
  actionsFor: (personId: string) => PersonActionId[];
  run: (personId: string, action: PersonActionId) => void;
}

/** Null for viewers: no menu, no actions. Stable, so cards do not re-render with the page. */
export const PersonActionsContext = createContext<PersonActionsApi | null>(null);
