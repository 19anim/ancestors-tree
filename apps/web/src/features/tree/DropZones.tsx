import type { Relation } from '@ancestors-tree/shared/tree';
import { useTranslation } from 'react-i18next';
import { cn } from '../../shared/lib/cn';
import { useDragStore } from './dragStore';
import type { Zone, ZoneResults } from './dragZones';

const BANDS: { zone: Relation; className: (edges: boolean) => string }[] = [
  {
    zone: 'parent',
    className: (edges) => cn('top-0 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0'),
  },
  {
    zone: 'spouse',
    className: (edges) => cn('top-1/3 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0'),
  },
  {
    zone: 'child',
    className: (edges) => cn('bottom-0 h-1/3', edges ? 'inset-x-[20%]' : 'inset-x-0'),
  },
  { zone: 'before', className: () => 'inset-y-0 left-0 w-[20%]' },
  { zone: 'after', className: () => 'inset-y-0 right-0 w-[20%]' },
];

/**
 * The zones on the card under a dragged card (spec §7.6): the one under the pointer stands out,
 * blocked ones are crossed out. Hidden from screen readers: the status line says the same.
 */
function DropZones({ results, zone }: { results: ZoneResults; zone: Zone | null }) {
  const { t } = useTranslation();
  const edges = results.before !== undefined;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-photo border-2 border-dashed border-ink"
    >
      {BANDS.map(({ zone: band, className }) => {
        const result = results[band];
        if (result === undefined) return null;
        return (
          <span
            key={band}
            className={cn(
              'absolute flex items-center justify-center px-1 text-center text-xs font-medium',
              className(edges),
              band === zone ? 'bg-ink text-paper' : 'bg-paper/85 text-ink',
              result.kind === 'blocked' && 'line-through',
            )}
          >
            {t(`tree.drag.zone.${band}`)}
          </span>
        );
      })}
    </div>
  );
}

/** The zones on this person's card while a dragged card is over it; nothing otherwise. */
export function CardZones({ personId }: { personId: string }) {
  const zone = useDragStore((state) => (state.overId === personId ? state.zone : null));
  const results = useDragStore((state) => (state.overId === personId ? state.results : null));
  return results === null ? null : <DropZones results={results} zone={zone} />;
}
