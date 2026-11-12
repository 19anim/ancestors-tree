export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Distance between the top of a child's card and the red pin where its thread ends. */
export const PIN_OFFSET = 16;

/** How far below the parents' cards a thread runs straight down before it bends. */
export const THREAD_DROP = 8;

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Facing edge points (mid-height) of two cards given by their top-left corners. */
export function stitchEnds(a: Point, b: Point, size: Size): { left: Point; right: Point } {
  const [first, second] = a.x <= b.x ? [a, b] : [b, a];
  return {
    left: { x: first.x + size.width, y: first.y + size.height / 2 },
    right: { x: second.x, y: second.y + size.height / 2 },
  };
}

export function stitchPath(left: Point, right: Point): string {
  return `M${left.x} ${left.y} L${right.x} ${right.y}`;
}

/** Where a child's thread ends: above the centre of the card's top edge. */
export function pinPoint(child: Point, size: Size): Point {
  return { x: child.x + size.width / 2, y: child.y - PIN_OFFSET };
}

/**
 * A parent → child thread: straight down from the couple's knot (or a single parent's
 * bottom edge) to `dropTo`, between the cards, then an S-curve to the child's pin.
 */
export function threadPath(from: Point, dropTo: number, to: Point): string {
  const bend = Math.max(12, (to.y - dropTo) / 2);
  return `M${from.x} ${from.y} L${from.x} ${dropTo} C${from.x} ${dropTo + bend} ${to.x} ${to.y - bend} ${to.x} ${to.y}`;
}
