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
        // The colour, width and caps come from the board's thread style (spec §13.4). A selected
        // thread is the stamp colour and thicker in every style.
        {...(selected
          ? { strokeWidth: 2.6, className: 'stroke-stamp' }
          : { className: 'thread-line' })}
      />
      <circle cx={to.x} cy={to.y} r={selected ? 5 : 4} className="fill-pin" />
    </g>
  );
}
