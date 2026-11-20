import type { LineStyle, Surface } from '@ancestors-tree/shared/tree';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export interface BoardProps extends ComponentProps<'div'> {
  width: number;
  height: number;
  /** Accessible name of the board, for example the clan or "sample tree". */
  label: string;
  /** Tree theme (spec §13.4); the defaults when left out. */
  surface?: Surface;
  /** Tree theme (spec §13.4); the defaults when left out. */
  thread?: LineStyle;
  /** Tree theme (spec §13.4); the defaults when left out. */
  stitch?: LineStyle;
}

/**
 * The scrapbook surface (grid paper by default) that holds positioned polaroids and an SVG layer
 * of threads. Its data attributes carry the tree theme to the CSS of everything inside it.
 */
export function Board({
  width,
  height,
  label,
  surface = 'grid-paper',
  thread = 'cotton',
  stitch = 'cotton',
  className,
  style,
  children,
  ...props
}: BoardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-surface={surface}
      data-thread={thread}
      data-stitch={stitch}
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
