import { buildTreeIndex, classifyLineage, type TreeState } from '@ancestors-tree/shared/tree';
import { Baby, Crown, HeartPlus, Trash2, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { createContext } from 'react';
import { parentSlot } from './ops';

export type PersonActionId = 'addChild' | 'addSpouse' | 'addParent' | 'setProgenitor' | 'delete';

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
  if (isOwner && !isProgenitor) actions.push('setProgenitor');
  actions.push('delete');
  return actions;
}

export const ACTION_ICONS: Record<PersonActionId, LucideIcon> = {
  addChild: Baby,
  addSpouse: HeartPlus,
  addParent: UserRoundPlus,
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
