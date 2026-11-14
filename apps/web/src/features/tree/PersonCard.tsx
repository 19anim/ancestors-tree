import type { Person } from '@ancestors-tree/shared/tree';
import { Ellipsis } from 'lucide-react';
import { useContext, useId, type CSSProperties } from 'react';
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
  return (
    <div className="group relative" style={POINTER_EVENTS}>
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
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden -translate-x-1/2 rounded-control bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-focus-within:block group-hover:block"
        >
          {family}
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
