import { classifyLineage } from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { ProfileDetails } from './ProfileDetails';
import { useTreeStore } from './store';
import {
  ACTION_ICONS,
  actionLabelKey,
  availableActions,
  type PersonActionsApi,
} from './usePersonActions';

interface ProfilePanelProps {
  personId: string;
  isOwner: boolean;
  /** Null for viewers. */
  actions: PersonActionsApi | null;
  onClose: () => void;
  /** The person is not in the loaded tree: the page closes the panel and says so. */
  onMissing: () => void;
}

const ICON = { 'aria-hidden': true, className: 'size-4', strokeWidth: 1.75 } as const;

/** The profile (spec §7.6): a side panel on wide screens, a bottom sheet on small ones. */
export function ProfilePanel({
  personId,
  isOwner,
  actions,
  onClose,
  onMissing,
}: ProfilePanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const tree = useTreeStore((state) => state.tree);
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
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };
  const actionIds = actions ? availableActions(tree, person.id, isOwner) : [];

  return (
    <aside
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      // A bottom sheet on small screens. From md up, a sticky column beside the board, in the
      // page flow under the header: it never covers the header or the notices (WCAG 2.4.11).
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-t-control border-t border-line bg-paper p-4 shadow-lift md:sticky md:inset-x-auto md:top-4 md:bottom-auto md:z-auto md:max-h-[calc(100dvh-2rem)] md:w-[400px] md:shrink-0 md:rounded-control md:border md:shadow-none"
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
      {actions && actionIds.length > 0 ? (
        <section aria-label={t('tree.profile.actions')} className="flex flex-wrap gap-2">
          {actionIds.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <Button
                key={action}
                variant={action === 'delete' ? 'danger' : 'secondary'}
                onClick={() => actions.run(person.id, action)}
              >
                <Icon {...ICON} />
                {t(actionLabelKey(action))}
              </Button>
            );
          })}
        </section>
      ) : null}
      <ProfileDetails person={person} inLaw={inLaw} />
    </aside>
  );
}
