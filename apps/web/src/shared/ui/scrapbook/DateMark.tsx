import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type DateMarkKind = 'death-anniversary' | 'birthday';

interface DateMarkProps {
  kind: DateMarkKind;
  children: ReactNode;
  className?: string;
}

/** A rubber stamp for death anniversaries, a round sticker for birthdays (spec §13.3). */
export function DateMark({ kind, children, className }: DateMarkProps) {
  if (kind === 'death-anniversary') {
    return (
      <span
        data-kind={kind}
        className={cn(
          'inline-block -rotate-[10deg] rounded-[3px] border-[1.5px] border-photo-stamp bg-photo px-1 py-px font-mono text-[11px] leading-tight font-bold whitespace-nowrap text-photo-stamp uppercase',
          className,
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      data-kind={kind}
      className={cn(
        'inline-flex size-11 rotate-[8deg] items-center justify-center rounded-full bg-sticker text-center font-mono text-[11px] leading-tight font-bold text-on-sticker',
        className,
      )}
    >
      {children}
    </span>
  );
}
