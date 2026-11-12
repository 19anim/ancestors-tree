import { threadPath, type Point } from './threads';

interface ThreadProps {
  from: Point;
  dropTo: number;
  to: Point;
  selected?: boolean;
}

/** Parent → child: a thread ending in a red pin above the child's card. Render inside <svg>. */
export function Thread({ from, dropTo, to, selected = false }: ThreadProps) {
  return (
    <g data-relation="parent-child" data-selected={selected || undefined}>
      <path
        d={threadPath(from, dropTo, to)}
        fill="none"
        strokeWidth={selected ? 2.6 : 1.5}
        className={selected ? 'stroke-stamp' : 'stroke-thread'}
      />
      <circle cx={to.x} cy={to.y} r={selected ? 5 : 4} className="fill-pin" />
    </g>
  );
}
