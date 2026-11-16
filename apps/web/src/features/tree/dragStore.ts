import type { TreeState } from '@ancestors-tree/shared/tree';
import { create } from 'zustand';
import type { Point } from '../../shared/ui';
import type { Zone, ZoneResults } from './dragZones';

export interface DragState {
  /** The person being dragged. */
  activeId: string | null;
  /** The card (person id) or TRAY_ID under the pointer. */
  overId: string | null;
  zone: Zone | null;
  /** Every zone's answer for overId, planned on seenTree. */
  results: ZoneResults | null;
  pointer: Point | null;
  seenTree: TreeState | null;
  /** performance.now() when the last drag ended: the click that follows a drop is not a click. */
  endedAt: number;
}

export const IDLE_DRAG = {
  activeId: null,
  overId: null,
  zone: null,
  results: null,
  pointer: null,
  seenTree: null,
} as const satisfies Omit<DragState, 'endedAt'>;

/** The drag in progress, for the cards' zone labels, the status line and the edge pan. */
export const useDragStore = create<DragState>(() => ({ ...IDLE_DRAG, endedAt: 0 }));

export const CLICK_AFTER_DROP_MS = 250;

export function resetDrag(): void {
  useDragStore.setState({ ...IDLE_DRAG, endedAt: performance.now() });
}

/** True right after a drag ended: the browser's click on the dragged card is ignored. */
export function justDropped(): boolean {
  return performance.now() - useDragStore.getState().endedAt < CLICK_AFTER_DROP_MS;
}
