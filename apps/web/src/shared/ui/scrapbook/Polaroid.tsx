import type { CardFastener, CardFrame } from '@ancestors-tree/shared/tree';
import { useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { initialsOf } from './initials';
import { BRANCH_TAPE_COUNT, tapeColor, type TapeKind } from './tape';

/** Level of detail by zoom (spec §7.4): full card > 0.8, name label 0.4–0.8, tape strip < 0.4. */
export type PolaroidLod = 'full' | 'label' | 'strip';

export const POLAROID_SIZE: Record<PolaroidLod, { width: number; height: number }> = {
  full: { width: 100, height: 138 },
  label: { width: 100, height: 40 },
  strip: { width: 100, height: 14 },
};

export interface PolaroidProps extends Omit<ComponentProps<'figure'>, 'children'> {
  /** Shown in the handwritten caption. */
  name: string;
  /** Accessible name: name, life years and, on the tree, the generation (spec §7.8). */
  label: string;
  tape: TapeKind;
  /** Degrees; use tiltFor(person.id). */
  tilt?: number;
  lod?: PolaroidLod;
  photoUrl?: string;
  lifeYears?: string;
  /**
   * The quiet line under the caption on the full card: the death anniversary (a DateMark).
   * Falls back to `lifeYears`, so every full card has the same height (spec §13.3).
   */
  dateLine?: ReactNode;
  /** Stickers (birthdays) stuck on the photo's corner, shown on the full card only. */
  marks?: ReactNode;
  /** Tree theme (spec §13.4); the classic white frame by default. */
  frame?: CardFrame;
  /** Tree theme; drawn on the full card only, in the branch colour. */
  fastener?: CardFastener;
}

function tapeName(tape: TapeKind): string {
  return typeof tape === 'number'
    ? `branch-${(Math.abs(Math.trunc(tape)) % BRANCH_TAPE_COUNT) + 1}`
    : tape;
}

export function Polaroid({
  name,
  label,
  tape,
  tilt = 0,
  lod = 'full',
  photoUrl,
  lifeYears,
  dateLine,
  marks,
  frame = 'classic',
  fastener = 'washi',
  className,
  style,
  ...props
}: PolaroidProps) {
  // The URL that failed to load: its card shows the initials until the URL changes. Before the
  // early returns, so the hook always runs.
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const showPhoto = photoUrl !== undefined && failedUrl !== photoUrl;
  const tapeBackground = tapeColor(tape);
  const { width, height } = POLAROID_SIZE[lod];
  // `rotate` (not `transform`) so it combines with Tailwind's translate/scale utilities.
  const box: CSSProperties = { width, height, rotate: `${tilt}deg`, ...style };
  const common = {
    'aria-label': label,
    'data-lod': lod,
    'data-tape': tapeName(tape),
    'data-frame': frame,
    'data-fastener': fastener,
    ...props,
  };

  if (lod === 'strip') {
    return (
      <figure
        {...common}
        className={cn('m-0 rounded-photo', className)}
        style={{ ...box, backgroundColor: tapeBackground }}
      />
    );
  }

  if (lod === 'label') {
    return (
      <figure
        {...common}
        className={cn(
          'relative m-0 flex items-center gap-2 overflow-hidden rounded-photo border border-line bg-photo pr-2 text-photo-ink',
          className,
        )}
        style={box}
      >
        <span
          aria-hidden="true"
          className="h-full w-2 shrink-0"
          style={{ backgroundColor: tapeBackground }}
        />
        <figcaption className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-hand text-base">{name}</span>
          {lifeYears ? (
            <span className="block font-mono text-[10px] text-photo-muted">{lifeYears}</span>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      {...common}
      className={cn('relative m-0 px-[7px] pt-[7px] text-photo-ink', className)}
      style={box}
    >
      <span
        aria-hidden="true"
        data-part="paper"
        className="polaroid-paper absolute inset-0 rounded-photo border border-line"
      />
      {/* Stickers are stuck on the photo's corner, so they never cover the caption. */}
      <div data-part="photo" className="relative">
        {showPhoto ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-[74px] w-full object-cover"
            onError={() => setFailedUrl(photoUrl)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[74px] items-center justify-center text-2xl font-bold"
            style={{ backgroundColor: `color-mix(in oklab, ${tapeBackground} 18%, var(--photo))` }}
          >
            {initialsOf(name)}
          </span>
        )}
        {marks ? (
          <div className="absolute -right-3 bottom-1 flex flex-col items-end gap-1">{marks}</div>
        ) : null}
      </div>
      <figcaption className="relative mt-1.5 text-center">
        <span className="block truncate font-hand text-base leading-5">{name}</span>
        <span
          data-part="date-line"
          className="mt-0.5 block h-3.5 truncate font-mono text-[11px] leading-[14px] text-photo-muted"
        >
          {dateLine ?? lifeYears}
        </span>
      </figcaption>
      <span
        aria-hidden="true"
        data-part="fastener"
        className="fastener"
        style={{ '--fastener-color': tapeBackground } as CSSProperties}
      />
    </figure>
  );
}
