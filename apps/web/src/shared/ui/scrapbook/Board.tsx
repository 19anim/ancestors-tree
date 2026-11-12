import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export interface BoardProps extends ComponentProps<'div'> {
  width: number;
  height: number;
  /** Accessible name of the board, for example the clan or "sample tree". */
  label: string;
}

/** Grid-paper surface that holds positioned polaroids and an SVG layer of threads. */
export function Board({ width, height, label, className, style, children, ...props }: BoardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'board-grid relative shrink-0 overflow-hidden rounded-control border border-line',
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
