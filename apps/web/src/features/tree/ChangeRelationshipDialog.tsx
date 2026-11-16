import {
  classifyLineage,
  relationshipsOf,
  type Relation,
  type UnionStatus,
} from '@ancestors-tree/shared/tree';
import { useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { planChange, type Change } from './changes';
import { PersonPicker, type PickerOption } from './PersonPicker';
import { blockMessage } from './relateText';
import { useTreeStore } from './store';

const ADDABLE = ['parent', 'spouse', 'child'] as const satisfies readonly Relation[];
type Addable = (typeof ADDABLE)[number];
const RELATION_LABEL = {
  parent: 'tree.relationships.asParent',
  spouse: 'tree.relationships.asSpouse',
  child: 'tree.relationships.asChild',
} as const satisfies Record<Addable, string>;
const STATUSES: UnionStatus[] = ['married', 'divorced', 'widowed'];
/** The list shows this many matches; typing more narrows it (5,000 people would be too long). */
const MAX_PICKS = 20;

/** A search key without accents or case: "binh" finds "Bình", "dung" finds "Dũng". */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');
}

function RelationGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-bold text-ink">
        {title}
      </h3>
      {children.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function RelationRow({
  name,
  removeLabel,
  onRemove,
  children,
}: {
  name: string;
  removeLabel: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-base text-ink">{name}</span>
      {children}
      <Button variant="secondary" size="sm" aria-label={removeLabel} onClick={onRemove}>
        {t('tree.relationships.remove')}
      </Button>
    </li>
  );
}

interface ChangeRelationshipDialogProps {
  personId: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** "Change relationship…" (spec §7.6): the keyboard's way to do what dragging does. */
export function ChangeRelationshipDialog({
  personId,
  onClose,
  onCloseAutoFocus,
}: ChangeRelationshipDialogProps) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const tree = useTreeStore((state) => state.tree);
  const body = useRef<HTMLDivElement>(null);
  const radioName = useId();
  const addId = useId();
  const [relation, setRelation] = useState<Addable>('child');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const links = useMemo(() => relationshipsOf(tree, personId), [tree, personId]);
  const lineage = useMemo(() => classifyLineage(tree), [tree]);
  const options = useMemo<PickerOption[]>(() => {
    const needle = foldName(query.trim());
    if (needle === '') return [];
    return Object.values(tree.persons)
      .filter((other) => other.id !== personId && foldName(other.fullName).includes(needle))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
      .slice(0, MAX_PICKS)
      .map((other) => {
        const result = planChange(tree, {
          kind: 'relate',
          personId: other.id,
          targetId: personId,
          relation,
        });
        return {
          id: other.id,
          name: other.fullName,
          note: lineage.get(other.id) === 'unlinked' ? t('tree.relationships.inTray') : undefined,
          blockedReason: result.kind === 'blocked' ? blockMessage(t, result.reason) : undefined,
        };
      });
  }, [lineage, personId, query, relation, t, tree]);

  const person = tree.persons[personId];
  if (person === undefined || requestChange === null) return null;
  const name = (id: string) => tree.persons[id]?.fullName ?? t('tree.relate.someone');
  // Focus stays in the dialog: on the control that made the change, or on the dialog when that
  // control's row is gone.
  const run = (change: Change) => requestChange({ change, focusFallback: () => body.current });
  const marriages = links.marriages.filter((marriage) => marriage.partnerId !== null);
  const childIds = links.marriages.flatMap((marriage) => marriage.childIds);

  const apply = () => {
    if (selectedId === null) {
      setPickError(t('tree.relationships.pick'));
      return;
    }
    setPickError(null);
    run({ kind: 'relate', personId: selectedId, targetId: personId, relation });
    setSelectedId(null);
    setQuery('');
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.relationships.title', { name: person.fullName })}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div ref={body} tabIndex={-1} className="flex flex-col gap-5 outline-none">
          <RelationGroup
            title={t('tree.relationships.parents')}
            empty={t('tree.relationships.none')}
          >
            {links.parentIds.map((id) => (
              <RelationRow
                key={id}
                name={name(id)}
                removeLabel={t('tree.relationships.removeParent', { name: name(id) })}
                onRemove={() => run({ kind: 'removeParent', childId: personId, parentId: id })}
              />
            ))}
          </RelationGroup>
          <RelationGroup
            title={t('tree.relationships.spouses')}
            empty={t('tree.relationships.none')}
          >
            {marriages.map(({ union, partnerId }) => {
              const partner = name(partnerId as string);
              return (
                <RelationRow
                  key={union.id}
                  name={partner}
                  removeLabel={t('tree.relationships.removeSpouse', { name: partner })}
                  onRemove={() => run({ kind: 'cutMarriage', unionId: union.id })}
                >
                  <select
                    aria-label={t('tree.relationships.statusOf', { name: partner })}
                    value={union.status}
                    onChange={(event) =>
                      run({
                        kind: 'status',
                        unionId: union.id,
                        status: event.target.value as UnionStatus,
                      })
                    }
                    className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`tree.relate.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </RelationRow>
              );
            })}
          </RelationGroup>
          <RelationGroup
            title={t('tree.relationships.children')}
            empty={t('tree.relationships.none')}
          >
            {childIds.map((id) => (
              <RelationRow
                key={id}
                name={name(id)}
                removeLabel={t('tree.relationships.removeChild', { name: name(id) })}
                onRemove={() => run({ kind: 'cutThread', childId: id })}
              />
            ))}
          </RelationGroup>
          <section aria-labelledby={addId} className="flex flex-col gap-3">
            <h3 id={addId} className="font-bold text-ink">
              {t('tree.relationships.add')}
            </h3>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink">
                {t('tree.relationships.relation')}
              </legend>
              {ADDABLE.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-base text-ink">
                  <input
                    type="radio"
                    name={radioName}
                    className="size-4"
                    checked={relation === choice}
                    onChange={() => setRelation(choice)}
                  />
                  {t(RELATION_LABEL[choice], { name: person.fullName })}
                </label>
              ))}
            </fieldset>
            <PersonPicker
              label={t('tree.relationships.search')}
              listLabel={t('tree.relationships.results')}
              empty={t('tree.relationships.noMatch')}
              query={query}
              onQueryChange={(next) => {
                setQuery(next);
                setSelectedId(null);
              }}
              options={options}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setPickError(null);
              }}
            />
            {pickError === null ? null : (
              <p role="alert" className="text-sm font-medium text-stamp">
                {pickError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t('tree.relationships.close')}
              </Button>
              <Button onClick={apply}>{t('tree.relationships.apply')}</Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
