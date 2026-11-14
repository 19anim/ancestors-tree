import type { Person } from '@ancestors-tree/shared/tree';
import { Ellipsis } from 'lucide-react';
import { useContext, useEffect, useId, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DateMark, Polaroid, tiltFor, type TapeKind } from '../../shared/ui';
import {
  birthdayOf,
  birthFamilySubtitle,
  cardLabel,
  dayMonth,
  deathAnniversaryOf,
  lifeYears,
} from './format';
import { TreeActionsContext } from './treeActions';

/**
 * React Flow turns pointer events off on nodes that are not draggable, not selectable and have
 * no node mouse handlers (all three hold here), so the card turns them back on.
 */
const POINTER_EVENTS: CSSProperties = { pointerEvents: 'auto' };

interface PersonCardProps {
  person: Person;
  tape: TapeKind;
  generation: number;
  inLaw: boolean;
}

export function PersonCard({ person, tape, generation, inLaw }: PersonCardProps) {
  const { t } = useTranslation();
  const openActions = useContext(TreeActionsContext);
  const tooltipId = useId();
  const anniversary = deathAnniversaryOf(person);
  const birthday = birthdayOf(person);
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  // Esc hides the tooltip until the pointer or focus leaves the card (WCAG 1.4.13).
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    // Hovered without focus, the card gets no keydown: listen on the window meanwhile.
    if (!hovered || family === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hovered, family]);
  return (
    <div
      className="group relative"
      style={POINTER_EVENTS}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setDismissed(true);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setDismissed(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(false);
      }}
    >
      <Polaroid
        name={person.fullName}
        label={cardLabel(t, person, generation, inLaw)}
        lifeYears={lifeYears(person)}
        tape={tape}
        tilt={tiltFor(person.id)}
        dateLine={
          anniversary ? (
            <DateMark
              kind="death-anniversary"
              label={t('scrapbook.deathAnniversaryLabel', { date: dayMonth(anniversary) })}
            >
              {t('scrapbook.deathAnniversary', { date: dayMonth(anniversary) })}
            </DateMark>
          ) : undefined
        }
        marks={
          birthday ? (
            <DateMark kind="birthday" label={t('scrapbook.birthday', { date: dayMonth(birthday) })}>
              {dayMonth(birthday)}
            </DateMark>
          ) : undefined
        }
      />
      {family !== undefined ? (
        // Padding, not a margin, above the bubble: the pointer can move onto it without leaving
        // the card's hover area (WCAG 1.4.13).
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute top-full left-1/2 z-10 hidden -translate-x-1/2 pt-1 ${dismissed ? '' : 'group-focus-within:block group-hover:block'}`}
        >
          <span className="block rounded-control bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
            {family}
          </span>
        </span>
      ) : null}
      {openActions ? (
        <Button
          variant="secondary"
          size="icon"
          // nodrag/nopan: React Flow leaves clicks on this button alone.
          className="nodrag nopan absolute -top-3 -right-3 size-8 rounded-full"
          aria-label={t('tree.card.actions', { name: person.fullName })}
          aria-describedby={family !== undefined ? tooltipId : undefined}
          // Where focus returns when a dialog opened from elsewhere closes (TreeDialogs).
          data-person-actions={person.id}
          onClick={() => openActions(person.id)}
        >
          <Ellipsis aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
    </div>
  );
}
