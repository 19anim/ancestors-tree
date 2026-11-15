import { looseStacks, type LooseStack, type Person } from '@ancestors-tree/shared/tree';
import { useContext, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Polaroid, tiltFor } from '../../shared/ui';
import { lifeYears, lifeYearsSpoken } from './format';
import { OpenPersonContext } from './profileParams';
import { useTreeStore } from './store';

/** One loose photo, opening the person's profile. */
export function TrayPhoto({ person }: { person: Person }) {
  const { t } = useTranslation();
  const openPerson = useContext(OpenPersonContext);
  const years = lifeYears(person);
  const spokenYears = lifeYearsSpoken(t, person);
  const label =
    spokenYears === undefined
      ? person.fullName
      : t('scrapbook.personLabel', { name: person.fullName, years: spokenYears });
  return (
    <div className="relative">
      <Polaroid
        aria-hidden="true"
        lod="label"
        name={person.fullName}
        label={label}
        lifeYears={years}
        tape="loose"
        tilt={tiltFor(person.id)}
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
        onClick={() => openPerson?.(person.id)}
      />
    </div>
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
        <TrayPhoto person={root} />
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
            onClick={() => setOpen((was) => !was)}
          >
            {t('tree.unlinked.more', { count: others.length })}
          </Button>
          <ul
            id={listId}
            hidden={!open}
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
export function UnlinkedTray() {
  const { t } = useTranslation();
  const headingId = useId();
  const tree = useTreeStore((state) => state.tree);
  const stacks = useMemo(() => looseStacks(tree), [tree]);

  if (stacks.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('tree.unlinked.title')}
      </h2>
      <p className="text-sm text-ink-muted">{t('tree.unlinked.hint')}</p>
      <ul className="flex flex-wrap items-start gap-4">
        {stacks.map((stack) => (
          <TrayStack key={stack.rootId} stack={stack} />
        ))}
      </ul>
    </section>
  );
}
