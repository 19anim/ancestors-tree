import { classifyLineage } from '@ancestors-tree/shared/tree';
import { Palette, Pencil, X } from 'lucide-react';
import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, inertOthers, useMediaQuery } from '../../shared/ui';
import { withDecorate } from './decor';
import { DecorateContext } from './decorContext';
import { PhotoControl } from './PhotoControl';
import { ProfileDetails } from './ProfileDetails';
import { ProfileForm } from './ProfileForm';
import { SIDE_PANEL_CLASS, WIDE_QUERY } from './sidePanel';
import { useTreeStore } from './store';
import {
  ACTION_ICONS,
  actionLabelKey,
  availableActions,
  type PersonActionsApi,
} from './usePersonActions';

interface ProfilePanelProps {
  clanId: string;
  personId: string;
  isOwner: boolean;
  /** Null for viewers. */
  actions: PersonActionsApi | null;
  onClose: () => void;
  /** The person is not in the loaded tree: the page closes the panel and says so. */
  onMissing: () => void;
  /** The edit form went away with unsaved changes (ProfileForm). */
  onDraftLost: () => void;
}

const ICON = { 'aria-hidden': true, className: 'size-4', strokeWidth: 1.75 } as const;

/** The profile (spec §7.6): a side panel on wide screens, a bottom sheet on small ones. */
export function ProfilePanel({
  clanId,
  personId,
  isOwner,
  actions,
  onClose,
  onMissing,
  onDraftLost,
}: ProfilePanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const tree = useTreeStore((state) => state.tree);
  // "Decorate this card…" (spec §13.4) sits with the actions, before Delete; viewers get it too.
  const decorate = useContext(DecorateContext);
  const status = useTreeStore((state) => state.status);
  const person = tree.persons[personId];
  // Reported once: StrictMode runs effects twice, and a second close would go back twice.
  const reported = useRef(false);
  const inLaw = useMemo(
    () => (person ? classifyLineage(tree).get(person.id) === 'in-law' : false),
    [person, tree],
  );

  useEffect(() => {
    if (person) {
      reported.current = false;
      return;
    }
    if (status !== 'ready' || reported.current) return;
    reported.current = true;
    onMissing();
  }, [onMissing, person, status]);

  // Focus moves into the panel when it opens, so a screen reader says whose profile it is.
  const shown = person !== undefined;
  useEffect(() => {
    if (shown) heading.current?.focus();
  }, [shown]);

  // Below md the panel is a bottom sheet over the board: a modal one, so neither Tab nor a tap
  // reaches the cards and controls it hides (WCAG 2.4.11). Esc, Back and the close button close
  // it. From md up it is a column beside the board, and the page stays as it is. The cleanup
  // runs before the page puts focus back on the card. The notice banner (`role="alert"`)
  // and the change toast stay operable on purpose (see inertOthers).
  const wide = useMediaQuery(WIDE_QUERY);
  const modal = shown && !wide;
  useEffect(() => {
    const element = panel.current;
    if (!modal || element === null) return;
    const undo = inertOthers(element);
    // The window narrowed across md with focus behind the sheet (a card, the toolbar): that
    // element is inert now, so focus would drop to the page. It moves into the sheet instead.
    const active = document.activeElement;
    if (active === null || !element.contains(active)) heading.current?.focus();
    return undo;
  }, [modal]);

  // Edit mode (spec §7.6). TreePage keys the panel by person, so another person opens in read mode.
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // The form's Save or Cancel button goes with it: focus moves to the Edit button.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  // A focused control that goes away (the progenitor button, once chosen) would drop focus on
  // the page: the heading takes it (WCAG 2.4.3).
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = lastFocused.current;
    if (element === null || element.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active === null || active === document.body) heading.current?.focus();
  });

  if (!person) return null;
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    lastFocused.current = event.target;
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !event.currentTarget.contains(next)) lastFocused.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The Escape that ends an IME composition belongs to the input method.
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onClose();
  };
  const actionIds = actions ? availableActions(tree, person.id, isOwner) : [];
  const items = decorate === null ? actionIds : withDecorate(actionIds);

  return (
    <aside
      ref={panel}
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      // See SIDE_PANEL_CLASS.
      className={SIDE_PANEL_CLASS}
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-ink focus:outline-none"
        >
          {person.fullName}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {actions !== null && !editing ? (
            <Button ref={editButton} variant="secondary" onClick={() => setEditing(true)}>
              <Pencil {...ICON} />
              {t('tree.profile.edit')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('tree.profile.close')}
            title={t('tree.profile.close')}
            onClick={onClose}
          >
            <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
          </Button>
        </div>
      </div>
      <PhotoControl clanId={clanId} person={person} />
      {editing ? (
        <ProfileForm
          person={person}
          inLaw={inLaw}
          onDone={() => setEditing(false)}
          onDraftLost={onDraftLost}
        />
      ) : (
        <>
          {items.length > 0 ? (
            <section aria-label={t('tree.profile.actions')} className="flex flex-wrap gap-2">
              {items.map((item) => {
                if (item === 'decorate') {
                  return (
                    <Button
                      key={item}
                      variant="secondary"
                      onClick={() => decorate?.({ kind: 'card', personId: person.id })}
                    >
                      <Palette {...ICON} />
                      {t('tree.decor.card.open')}
                    </Button>
                  );
                }
                const Icon = ACTION_ICONS[item];
                return (
                  <Button
                    key={item}
                    variant={item === 'delete' ? 'danger' : 'secondary'}
                    onClick={() => actions?.run(person.id, item)}
                  >
                    <Icon {...ICON} />
                    {t(actionLabelKey(item))}
                  </Button>
                );
              })}
            </section>
          ) : null}
          <ProfileDetails person={person} inLaw={inLaw} />
        </>
      )}
    </aside>
  );
}
