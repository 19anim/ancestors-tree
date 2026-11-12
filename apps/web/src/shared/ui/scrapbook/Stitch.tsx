import { cn } from '../../lib/cn';
import { midpoint, stitchPath, type Point } from './threads';

interface StitchProps {
  left: Point;
  right: Point;
  selected?: boolean;
}

/** Marriage: a dashed stitch with a round knot in the middle. Render inside <svg>. */
export function Stitch({ left, right, selected = false }: StitchProps) {
  const knot = midpoint(left, right);
  const stroke = selected ? 'stroke-stamp' : 'stroke-thread';
  return (
    <g data-relation="marriage" data-selected={selected || undefined}>
      <path
        d={stitchPath(left, right)}
        fill="none"
        strokeDasharray="4 4"
        strokeWidth={selected ? 2.6 : 1.6}
        className={stroke}
      />
      <circle
        cx={knot.x}
        cy={knot.y}
        r={6}
        strokeWidth={1.8}
        className={cn('fill-photo', stroke)}
      />
    </g>
  );
}
