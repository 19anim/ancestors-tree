import type { Person } from '@ancestors-tree/shared/tree';
import { Ellipsis } from 'lucide-react';
import { useContext, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Polaroid, tiltFor, type TapeKind } from '../../shared/ui';
import { cardLabel, lifeYears } from './format';
import { TreeActionsContext } from './treeActions';

/** React Flow turns pointer events off on nodes that cannot be dragged or selected. */
const POINTER_EVENTS: CSSProperties = { pointerEvents: 'auto' };

interface PersonCardProps {
  person: Person;
  tape: TapeKind;
  generation: number;
}

export function PersonCard({ person, tape, generation }: PersonCardProps) {
  const { t } = useTranslation();
  const openActions = useContext(TreeActionsContext);
  const years = lifeYears(person);
  return (
    <div className="relative" style={POINTER_EVENTS}>
      <Polaroid
        name={person.fullName}
        label={cardLabel(t, person.fullName, years, generation)}
        lifeYears={years}
        tape={tape}
        tilt={tiltFor(person.id)}
      />
      {openActions ? (
        <Button
          variant="secondary"
          size="icon"
          // nodrag/nopan: React Flow leaves clicks on this button alone.
          className="nodrag nopan absolute -top-3 -right-3 size-8 rounded-full"
          aria-label={t('tree.card.actions', { name: person.fullName })}
          onClick={() => openActions(person.id)}
        >
          <Ellipsis aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
    </div>
  );
}
