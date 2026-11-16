import type { Person } from '@ancestors-tree/shared/tree';
import {
  useContext,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { DateMark, Polaroid, tiltFor, type TapeKind } from '../../shared/ui';
import { CardDrag } from './CardDrag';
import { CardMenu } from './CardMenu';
import { justDropped } from './dragStore';
import { CardZones } from './DropZones';
import {
  birthdayOf,
  birthFamilySubtitle,
  cardLabel,
  dayMonth,
  deathAnniversaryOf,
  lifeYears,
} from './format';
import { OpenPersonContext, personCardButton } from './profileParams';
import { isRelativeKey, relativeTarget } from './relativeNav';
import { useTreeStore } from './store';

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
  const openPerson = useContext(OpenPersonContext);
  const tooltipId = useId();
  const marksId = useId();
  const anniversary = deathAnniversaryOf(person);
  const birthday = birthdayOf(person);
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  const label = cardLabel(t, person, generation, inLaw);
  const anniversaryLabel = anniversary
    ? t('scrapbook.deathAnniversaryLabel', { date: dayMonth(anniversary) })
    : undefined;
  const birthdayLabel = birthday
    ? t('scrapbook.birthday', { date: dayMonth(birthday) })
    : undefined;
  // The Polaroid is hidden from screen readers under the button, so the button says the marks.
  const marks = [anniversaryLabel, birthdayLabel].filter(Boolean).join(', ');
  const describedBy = [
    marks === '' ? undefined : marksId,
    family === undefined ? undefined : tooltipId,
  ]
    .filter(Boolean)
    .join(' ');
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
  // Only a card with a tooltip tracks hover and focus: the others never re-render for it.
  const tooltipHandlers =
    family === undefined
      ? undefined
      : {
          onKeyDown: (event: ReactKeyboardEvent) => {
            if (event.key === 'Escape') setDismissed(true);
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => {
            setHovered(false);
            setDismissed(false);
          },
          onBlur: (event: FocusEvent<HTMLDivElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(false);
          },
        };
  return (
    // Drag to relate (spec §7.6): editors drag the card from its button, and drop on it.
    <CardDrag
      personId={person.id}
      drag
      drop
      className="group relative"
      style={POINTER_EVENTS}
      {...tooltipHandlers}
    >
      {/* The photo, hidden from screen readers: the button over it names the person. */}
      <Polaroid
        aria-hidden="true"
        name={person.fullName}
        label={label}
        lifeYears={lifeYears(person)}
        tape={tape}
        tilt={tiltFor(person.id)}
        dateLine={
          anniversary && anniversaryLabel ? (
            <DateMark kind="death-anniversary" label={anniversaryLabel}>
              {t('scrapbook.deathAnniversary', { date: dayMonth(anniversary) })}
            </DateMark>
          ) : undefined
        }
        marks={
          birthday && birthdayLabel ? (
            <DateMark kind="birthday" label={birthdayLabel}>
              {dayMonth(birthday)}
            </DateMark>
          ) : undefined
        }
      />
      <CardZones personId={person.id} />
      {/* Right-click, the menu key or Shift+F10: the panel's actions (spec §7.6). */}
      <CardMenu personId={person.id}>
        <button
          type="button"
          // Over the Polaroid, not around it: a button holding the photo's initials and date line
          // would have text its name lacks (WCAG 2.5.3). nodrag/nopan: React Flow leaves clicks
          // on the card alone. The outline is the app's :focus-visible rule (styles/index.css).
          className="nodrag nopan absolute inset-0 cursor-pointer rounded-photo"
          aria-label={label}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          // Focus returns here when the profile or a dialog closes (TreePage, TreeDialogs).
          data-person-open={person.id}
          onClick={() => {
            // The click the browser fires on the dragged card right after a drop is not a click.
            if (!justDropped()) openPerson?.(person.id);
          }}
          // On the button, not the wrapper: keys in an open card menu bubble to the wrapper
          // through the portal, never to the button, so the menu keeps its own arrows.
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (!isRelativeKey(event.key)) return;
            // Arrows on a card never scroll the page or pan the board (spec §7.8).
            event.preventDefault();
            // Read on the key press, not subscribed: the card re-renders only for its person.
            const target = relativeTarget(useTreeStore.getState().tree, person.id, event.key);
            // A board person is never in the tray, so this is their card; the board's onFocus
            // centres it when it is off screen (WCAG 2.4.11).
            if (target !== null) personCardButton(target)?.focus();
          }}
        />
      </CardMenu>
      {marks === '' ? null : (
        <span id={marksId} className="sr-only">
          {marks}
        </span>
      )}
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
    </CardDrag>
  );
}
