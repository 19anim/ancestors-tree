import { classifyLineage, type Relation, type TreeState } from '@ancestors-tree/shared/tree';
import type { Point } from '../../shared/ui';
import { planChange, type Change, type ChangeResult } from './changes';

/** A drop zone: one of the relations, or the Loose photos tray. */
export type Zone = Relation | 'tray';
export type ZoneResults = Partial<Record<Zone, ChangeResult>>;

/** The tray's droppable id (never a person's: those are 24 hex digits). */
export const TRAY_ID = 'tray';
/** Each side edge of a sibling's card that means "before" or "after" (spec §7.6: about a fifth). */
export const SIBLING_EDGE = 0.2;
/** How near the board's edge a dragged card pans it, and by how much per frame (px). */
export const EDGE_PAN_ZONE = 40;
export const EDGE_PAN_STEP = 12;

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const ALL_RELATIONS: Relation[] = ['parent', 'spouse', 'child', 'before', 'after'];
const FAMILY_RELATIONS: Relation[] = ['parent', 'spouse', 'child'];

/** The zone under the pointer on a target card (spec §7.6 "Drop zones"). */
export function zoneAt(point: Point, rect: RectLike, siblings: boolean): Relation {
  const x = (point.x - rect.left) / rect.width;
  const y = (point.y - rect.top) / rect.height;
  if (siblings && x < SIBLING_EDGE) return 'before';
  if (siblings && x > 1 - SIBLING_EDGE) return 'after';
  if (y < 1 / 3) return 'parent';
  if (y < 2 / 3) return 'spouse';
  return 'child';
}

export function areSiblings(tree: TreeState, a: string, b: string): boolean {
  const unionId = tree.persons[a]?.parentUnionId;
  return unionId !== undefined && unionId === tree.persons[b]?.parentUnionId;
}

/**
 * Every zone's answer for this target, planned once when the target changes (spec §7.6: the rules
 * run again only when the target or zone changes). Null means a drop here is a cancel.
 */
export function zoneResults(
  tree: TreeState,
  activeId: string | null,
  overId: string | null,
): ZoneResults | null {
  if (activeId === null || overId === null || overId === activeId) return null;
  if (overId === TRAY_ID) {
    if (classifyLineage(tree).get(activeId) === 'unlinked') return null;
    return { tray: planChange(tree, { kind: 'detach', personId: activeId }) };
  }
  const relations = areSiblings(tree, activeId, overId) ? ALL_RELATIONS : FAMILY_RELATIONS;
  return Object.fromEntries(
    relations.map((relation) => [
      relation,
      planChange(tree, { kind: 'relate', personId: activeId, targetId: overId, relation }),
    ]),
  );
}

export function zoneFor(
  overId: string | null,
  activeId: string | null,
  point: Point,
  rect: RectLike | null,
  results: ZoneResults | null,
): Zone | null {
  if (overId === null || overId === activeId || results === null) return null;
  if (overId === TRAY_ID) return 'tray';
  if (rect === null) return null;
  return zoneAt(point, rect, results.before !== undefined);
}

/** What a drop does; null cancels it (empty space, the card's own place). */
export function dropChange(
  activeId: string | null,
  overId: string | null,
  zone: Zone | null,
): Change | null {
  if (activeId === null || overId === null || zone === null || overId === activeId) return null;
  if (zone === 'tray') return { kind: 'detach', personId: activeId };
  return { kind: 'relate', personId: activeId, targetId: overId, relation: zone };
}

/** The board's pan for a pointer near its edge (spec §7.6 "Edges of the board"); null inside. */
export function edgePan(point: Point, rect: RectLike): Point | null {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  if (point.x < rect.left || point.x > right || point.y < rect.top || point.y > bottom) return null;
  const x =
    point.x < rect.left + EDGE_PAN_ZONE
      ? EDGE_PAN_STEP
      : point.x > right - EDGE_PAN_ZONE
        ? -EDGE_PAN_STEP
        : 0;
  const y =
    point.y < rect.top + EDGE_PAN_ZONE
      ? EDGE_PAN_STEP
      : point.y > bottom - EDGE_PAN_ZONE
        ? -EDGE_PAN_STEP
        : 0;
  return x === 0 && y === 0 ? null : { x, y };
}

/** Where the pointer is now: where the drag started, plus how far it moved. */
export function pointerOf(event: { activatorEvent: Event; delta: Point }): Point {
  const start = event.activatorEvent as MouseEvent & { touches?: TouchList };
  const origin = start.touches?.[0] ?? start;
  return { x: (origin.clientX ?? 0) + event.delta.x, y: (origin.clientY ?? 0) + event.delta.y };
}
