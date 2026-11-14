import { classifyLineage } from '@ancestors-tree/shared/tree';
import { Ellipsis } from 'lucide-react';
import { useContext, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Polaroid, tiltFor } from '../../shared/ui';
import { lifeYears } from './format';
import { useTreeStore } from './store';
import { TreeActionsContext } from './treeActions';

/** People not linked to the progenitor (spec §8 "unlinked"), with their actions for editors. */
export function UnlinkedTray() {
  const { t } = useTranslation();
  const headingId = useId();
  const tree = useTreeStore((state) => state.tree);
  const openActions = useContext(TreeActionsContext);
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
          return (
            <li key={person.id} className="flex items-center gap-2">
              <Polaroid
                lod="label"
                name={person.fullName}
                label={
                  years === undefined
                    ? person.fullName
                    : t('scrapbook.personLabel', { name: person.fullName, years })
                }
                lifeYears={years}
                tape="loose"
                tilt={tiltFor(person.id)}
              />
              {openActions ? (
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-8 rounded-full"
                  aria-label={t('tree.card.actions', { name: person.fullName })}
                  data-person-actions={person.id}
                  onClick={() => openActions(person.id)}
                >
                  <Ellipsis aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
