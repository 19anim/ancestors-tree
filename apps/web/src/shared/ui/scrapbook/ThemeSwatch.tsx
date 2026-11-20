import type { ThemePart } from '@ancestors-tree/shared/tree';
import type { ParseKeys } from 'i18next';
import type { CSSProperties } from 'react';

/** The i18n key of an option's name; ThemeSwatch.test checks every one exists. */
export function themeOptionKey(part: ThemePart, value: string): ParseKeys {
  return `tree.decor.options.${part}.${value}` as ParseKeys;
}

const PREVIEW_FASTENER = { '--fastener-color': 'var(--tape-2)' } as CSSProperties;

/**
 * A small live preview of one theme option (spec §13.4), drawn by the same CSS as the board.
 * Decorative: the control around it names the option.
 */
export function ThemeSwatch({ part, value }: { part: ThemePart; value: string }) {
  switch (part) {
    case 'surface':
      return (
        <span
          aria-hidden="true"
          data-surface={value}
          className="board-grid block h-12 w-16 rounded-control border border-line"
        />
      );
    case 'frame':
      return (
        <span aria-hidden="true" data-frame={value} className="relative block h-12 w-10">
          <span className="polaroid-paper absolute inset-0 rounded-photo border border-line" />
          <span className="absolute inset-x-1 top-1 h-6 bg-paper-grid" />
        </span>
      );
    case 'fastener':
      return (
        <span aria-hidden="true" data-fastener={value} className="relative block h-12 w-16">
          <span className="absolute inset-x-1 top-3 bottom-0 rounded-photo border border-line bg-photo" />
          <span
            className="fastener"
            style={{ ...PREVIEW_FASTENER, top: 4, left: '50%', translate: '-50% 0' }}
          />
        </span>
      );
    case 'thread':
      return (
        <svg aria-hidden="true" data-thread={value} width={64} height={48} className="block">
          <path d="M12 4 L12 20 C12 32 52 30 52 36" fill="none" className="thread-line" />
          <circle cx={52} cy={40} r={4} className="fill-pin" />
        </svg>
      );
    case 'stitch':
      return (
        <svg aria-hidden="true" data-stitch={value} width={64} height={48} className="block">
          <path d="M4 24 L60 24" fill="none" className="stitch-line" />
          <circle cx={32} cy={24} r={5} strokeWidth={1.8} className="stitch-knot" />
        </svg>
      );
  }
}
