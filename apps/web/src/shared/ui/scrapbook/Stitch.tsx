import { cn } from '../../lib/cn';
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
  const knot = midpoint(left, right);
  const stroke = selected ? 'stroke-stamp' : 'stroke-thread';
  const paths = broken
    ? [
        stitchPath(left, { x: knot.x - GAP, y: knot.y }),
        stitchPath({ x: knot.x + GAP, y: knot.y }, right),
      ]
    : [stitchPath(left, right)];
  return (
    <g
      data-relation="marriage"
      data-selected={selected || undefined}
      data-broken={broken || undefined}
    >
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeDasharray="4 4"
          strokeWidth={selected ? 2.6 : 1.6}
          className={stroke}
        />
      ))}
      <circle
        cx={knot.x}
        cy={knot.y}
        r={6}
        strokeWidth={1.8}
        className={cn(broken ? 'fill-none' : selected ? 'fill-stamp' : 'fill-thread', stroke)}
      />
    </g>
  );
}
