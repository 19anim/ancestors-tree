import type { Viewport } from '@xyflow/react';
import { CARD, type TreeLayout } from './layout';

/** Screen pixels moved by one arrow key. */
export const PAN_STEP = 80;
/** A card closer than this to the board's edge counts as off screen. */
export const REVEAL_MARGIN = 16;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The arrow keys move the view the way the arrow points: ArrowLeft shows what is to the left. */
export function panned(viewport: Viewport, key: string): Viewport | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...viewport, x: viewport.x + PAN_STEP };
    case 'ArrowRight':
      return { ...viewport, x: viewport.x - PAN_STEP };
    case 'ArrowUp':
      return { ...viewport, y: viewport.y + PAN_STEP };
    case 'ArrowDown':
      return { ...viewport, y: viewport.y - PAN_STEP };
    default:
      return null;
  }
}

/** True when the whole rectangle (board coordinates) is on screen, `margin` pixels from the edge. */
export function isRectVisible(
  rect: Rect,
  viewport: Viewport,
  size: Size,
  margin = REVEAL_MARGIN,
): boolean {
  const left = rect.x * viewport.zoom + viewport.x;
  const top = rect.y * viewport.zoom + viewport.y;
  const right = left + rect.width * viewport.zoom;
  const bottom = top + rect.height * viewport.zoom;
  return (
    left >= margin &&
    top >= margin &&
    right <= size.width - margin &&
    bottom <= size.height - margin
  );
}

/** How far to move one axis so `[start, start + length]` sits inside the span; start wins. */
function shiftInto(start: number, length: number, span: number, margin: number): number {
  if (start < margin) return margin - start;
  const overflow = start + length - (span - margin);
  return overflow > 0 ? Math.max(-overflow, margin - start) : 0;
}

/**
 * The smallest pan that puts the whole rectangle on screen, `margin` pixels from the edge, at
 * the current zoom; null when it is already there. What was next to it stays in view.
 */
export function pannedToShow(
  rect: Rect,
  viewport: Viewport,
  size: Size,
  margin = REVEAL_MARGIN,
): Viewport | null {
  if (isRectVisible(rect, viewport, size, margin)) return null;
  const { zoom } = viewport;
  const dx = shiftInto(rect.x * zoom + viewport.x, rect.width * zoom, size.width, margin);
  const dy = shiftInto(rect.y * zoom + viewport.y, rect.height * zoom, size.height, margin);
  return { x: viewport.x + dx, y: viewport.y + dy, zoom };
}

export function personRect(layout: TreeLayout, personId: string): Rect | null {
  const person = layout.persons.find((placed) => placed.id === personId);
  return person ? { x: person.x, y: person.y, width: CARD.width, height: CARD.height } : null;
}

/** The first person on the board (in layout order) who was not on it before. */
export function firstNewPerson(previous: ReadonlySet<string>, layout: TreeLayout): string | null {
  return layout.persons.find((placed) => !previous.has(placed.id))?.id ?? null;
}
