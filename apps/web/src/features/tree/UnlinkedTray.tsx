import { useDroppable } from '@dnd-kit/core';
import {
  looseStacks,
  resolveCardStyle,
  type LooseStack,
  type Person,
} from '@ancestors-tree/shared/tree';
import { UsersRound } from 'lucide-react';
import { useContext, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../shared/lib/cn';
import { Button, Polaroid, tiltFor } from '../../shared/ui';
import { CardDrag } from './CardDrag';
import { ChangeContext } from './ChangeRunner';
import { useThemeLayers } from './decorContext';
import { justDropped, useDragStore } from './dragStore';
import { TRAY_ID } from './dragZones';
import { lifeYears, lifeYearsSpoken } from './format';
import { OpenPersonContext } from './profileParams';
import { useTreeStore } from './store';

/**
 * One loose photo, opening the person's profile. A draggable one (a stack's top person) can be
 * dragged onto the board by editors, bringing its branch along (spec §7.6).
 */
export function TrayPhoto({ person, draggable = false }: { person: Person; draggable?: boolean }) {
  const { t } = useTranslation();
  const openPerson = useContext(OpenPersonContext);
  const years = lifeYears(person);
  const spokenYears = lifeYearsSpoken(t, person);
  const label =
    spokenYears === undefined
      ? person.fullName
      : t('scrapbook.personLabel', { name: person.fullName, years: spokenYears });
  const layers = useThemeLayers();
  const style = resolveCardStyle(layers, person.id, person.cardStyle);
  return (
    <CardDrag personId={person.id} drag={draggable} drop={false} className="relative">
      <Polaroid
        aria-hidden="true"
        lod="label"
        name={person.fullName}
        label={label}
        lifeYears={years}
        tape="loose"
        tilt={tiltFor(person.id)}
        frame={style.frame}
        fastener={style.fastener}
      />
      <button
        type="button"
        // Over the photo, not around it: its caption ("~1931") is not the spoken name, and a
        // button's text must be part of its name (WCAG 2.5.3). The outline is the app's
        // :focus-visible rule (styles/index.css).
        className="absolute inset-0 cursor-pointer rounded-photo"
        aria-label={label}
        // Focus returns here when the profile or a dialog closes (TreePage, TreeDialogs).
        data-person-open={person.id}
        onClick={() => {
          // The click the browser fires on the dragged photo right after a drop is not a click.
          if (!justDropped()) openPerson?.(person.id);
        }}
      />
    </CardDrag>
  );
}

/** A branch: its topmost person on top, "+N people" opening the rest (spec §7.6). */
function TrayStack({ stack }: { stack: LooseStack }) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  // The persons map itself: a stable reference between edits, so no new object per render.
  const persons = useTreeStore((state) => state.tree.persons);
  const root = persons[stack.rootId];
  if (root === undefined) return null;
  const others = stack.personIds
    .slice(1)
    .flatMap((id) => (persons[id] === undefined ? [] : [persons[id]]));
  return (
    <li className="flex flex-col items-start gap-2">
      <div className="relative">
        {others.length > 0 ? (
          // The paper of the photos underneath: decoration only.
          <span
            aria-hidden="true"
            className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-2 rounded-photo border border-line bg-photo"
          />
        ) : null}
        {/* Only the top person is dragged: the branch comes with them (spec §7.6). */}
        <TrayPhoto person={root} draggable />
      </div>
      {others.length > 0 ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={t('tree.unlinked.stackToggle', {
              count: others.length,
              name: root.fullName,
            })}
            // Focus returns here for a member while the stack is collapsed (personCardButton).
            data-stack-toggle={stack.rootId}
            onClick={() => setOpen((was) => !was)}
          >
            {t('tree.unlinked.more', { count: others.length })}
          </Button>
          <ul
            id={listId}
            hidden={!open}
            data-stack-of={stack.rootId}
            aria-label={t('tree.unlinked.stackList', { name: root.fullName })}
            className="flex flex-wrap gap-3 border-l-2 border-line pl-3"
          >
            {others.map((person) => (
              <li key={person.id}>
                <TrayPhoto person={person} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}

/** People not linked to the progenitor (spec §8 "unlinked"), one stack per branch (§7.6). */
export function UnlinkedTray({ onAddSeveral }: { onAddSeveral?: () => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const tree = useTreeStore((state) => state.tree);
  const stacks = useMemo(() => looseStacks(tree), [tree]);
  // An empty tray is there only while dragging, to drop on. A boolean that stays false while the
  // tray has photos, so a drag starting or ending does not re-render them.
  const emptyWhileDragging = useDragStore(
    (state) => stacks.length === 0 && state.activeId !== null,
  );

  if (stacks.length === 0 && !emptyWhileDragging) return null;
  return (
    <TrayDrop headingId={headingId}>
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('tree.unlinked.title')}
      </h2>
      {stacks.length === 0 ? (
        // Shown only while dragging: the empty tray is there to drop on.
        <p className="text-sm text-ink-muted">{t('tree.drag.trayDrop')}</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{t('tree.unlinked.hint')}</p>
          {onAddSeveral ? (
            <Button variant="secondary" size="sm" className="self-start" onClick={onAddSeveral}>
              <UsersRound aria-hidden="true" strokeWidth={1.75} className="size-4" />
              {t('tree.several.open')}
            </Button>
          ) : null}
          <ul className="flex flex-wrap items-start gap-4">
            {stacks.map((stack) => (
              <TrayStack key={stack.rootId} stack={stack} />
            ))}
          </ul>
        </>
      )}
    </TrayDrop>
  );
}

/**
 * The tray as a drop target: a drop here detaches the dragged person (spec §7.6). Its own
 * component, so the drag context's changes re-render only this section, not the photos in it.
 */
function TrayDrop({ headingId, children }: { headingId: string; children: ReactNode }) {
  const canDrag = useContext(ChangeContext) !== null;
  const drop = useDroppable({ id: TRAY_ID, disabled: !canDrag });
  const over = useDragStore((state) => state.overId === TRAY_ID);
  return (
    <section
      ref={drop.setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-3',
        over && 'rounded-control outline-2 outline-ink outline-dashed',
      )}
    >
      {children}
    </section>
  );
}
