import { classifyLineage } from '@ancestors-tree/shared/tree';
import { useContext, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Polaroid, tiltFor } from '../../shared/ui';
import { lifeYears, lifeYearsSpoken } from './format';
import { OpenPersonContext } from './profileParams';
import { useTreeStore } from './store';

/** People not linked to the progenitor (spec §8 "unlinked"), each opening their profile. */
export function UnlinkedTray() {
  const { t } = useTranslation();
  const headingId = useId();
  const tree = useTreeStore((state) => state.tree);
  const openPerson = useContext(OpenPersonContext);
  const people = useMemo(() => {
    const lineage = classifyLineage(tree);
    return Object.values(tree.persons)
      .filter((person) => lineage.get(person.id) === 'unlinked')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }, [tree]);

  if (people.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-bold text-ink">
        {t('tree.unlinked.title')}
      </h2>
      <p className="text-sm text-ink-muted">{t('tree.unlinked.hint')}</p>
      <ul className="flex flex-wrap gap-4">
        {people.map((person) => {
          const years = lifeYears(person);
          const spokenYears = lifeYearsSpoken(t, person);
          const label =
            spokenYears === undefined
              ? person.fullName
              : t('scrapbook.personLabel', { name: person.fullName, years: spokenYears });
          return (
            <li key={person.id} className="relative">
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
                // Over the photo, not around it: its caption ("~1931") is not the spoken name, and
                // a button's text must be part of its name (WCAG 2.5.3). The outline is the app's
                // :focus-visible rule (styles/index.css).
                className="absolute inset-0 cursor-pointer rounded-photo"
                aria-label={label}
                // Focus returns here when the profile or a dialog closes (TreePage, TreeDialogs).
                data-person-open={person.id}
                onClick={() => openPerson?.(person.id)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
