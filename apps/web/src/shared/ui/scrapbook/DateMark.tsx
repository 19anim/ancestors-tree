import { Cake } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type DateMarkKind = 'death-anniversary' | 'birthday';

interface DateMarkProps {
  kind: DateMarkKind;
  /** Full text for screen readers ("Ngày giỗ 15/10 âm lịch", "Sinh nhật 21/11"). */
  label: string;
  /** Short visible text ("Giỗ 15/10 ÂL", "21/11"). */
  children: ReactNode;
  className?: string;
}

/**
 * Date marks (spec §13.3): a quiet line for a death anniversary, because it remembers someone
 * who has died, and a round sticker with a cake for a birthday.
 */
export function DateMark({ kind, label, children, className }: DateMarkProps) {
  if (kind === 'death-anniversary') {
    return (
      <span
        data-kind={kind}
        className={cn(
          'block truncate font-mono text-[11px] leading-[14px] text-photo-muted',
          className,
        )}
      >
        <span className="sr-only">{label}</span>
        <span aria-hidden="true">{children}</span>
      </span>
    );
  }
  return (
    <span
      data-kind={kind}
      className={cn(
        'inline-flex size-11 rotate-[8deg] flex-col items-center justify-center gap-0.5 rounded-full bg-sticker font-mono text-[11px] leading-none font-bold text-on-sticker',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <Cake aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      <span aria-hidden="true">{children}</span>
    </span>
  );
}
