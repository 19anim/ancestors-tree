import { midpoint, stitchPath, type Point } from './threads';

interface StitchProps {
  left: Point;
  right: Point;
  selected?: boolean;
  /** A divorce: the stitch is broken at the knot. */
  broken?: boolean;
}

/** Half the break in a divorced stitch, measured from the knot's centre. */
const GAP = 12;

/**
 * Marriage: a dashed stitch with a solid round knot in the middle, in the thread's colour. A
 * divorce is two halves with a gap where the knot was, and the knot an open ring: a filled knot
 * stays distinct from the ring on both the light and the dark board. Render inside <svg>.
 */
export function Stitch({ left, right, selected = false, broken = false }: StitchProps) {
  const centre = midpoint(left, right);
  const paths = broken
    ? [
        stitchPath(left, { x: centre.x - GAP, y: centre.y }),
        stitchPath({ x: centre.x + GAP, y: centre.y }, right),
      ]
    : [stitchPath(left, right)];
  // The colour, width, dashes and caps come from the board's stitch style (spec §13.4); a
  // selected stitch is the stamp colour in every style.
  const line = selected
    ? { className: 'stroke-stamp', strokeWidth: 2.6, strokeDasharray: '4 4' }
    : { className: 'stitch-line' };
  const knot = broken
    ? selected
      ? 'fill-none stroke-stamp'
      : 'stitch-ring'
    : selected
      ? 'fill-stamp stroke-stamp'
      : 'stitch-knot';
  return (
    <g
      data-relation="marriage"
      data-selected={selected || undefined}
      data-broken={broken || undefined}
    >
      {paths.map((d) => (
        <path key={d} d={d} fill="none" {...line} />
      ))}
      <circle cx={centre.x} cy={centre.y} r={6} strokeWidth={1.8} className={knot} />
    </g>
  );
}
