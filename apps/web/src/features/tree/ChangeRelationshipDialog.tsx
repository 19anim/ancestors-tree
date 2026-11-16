import {
  classifyLineage,
  relationshipsOf,
  type Relation,
  type UnionStatus,
} from '@ancestors-tree/shared/tree';
import {
  useContext,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import { ChangeContext, HandOffButton, type ChangeDone } from './ChangeRunner';
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
const BY_NAME = new Intl.Collator('vi');

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
  // The last change made here, told here: the modal covers the runner's toast and its Undo.
  const [done, setDone] = useState<ChangeDone | null>(null);
  // Its Undo while it is the latest change, as the toast's; a boolean, so the selector is stable.
  const canUndo = useTreeStore((state) => done !== null && state.undoStack.at(-1)?.op === done.op);
  // Typing stays quick in a large tree: the list follows when there is time.
  const searched = useDeferredValue(query);
  const links = useMemo(() => relationshipsOf(tree, personId), [tree, personId]);
  const lineage = useMemo(() => classifyLineage(tree), [tree]);
  // Folded and sorted once per change to the people, not on every key.
  const people = useMemo(
    () =>
      Object.values(tree.persons)
        .map((other) => ({ id: other.id, name: other.fullName, key: foldName(other.fullName) }))
        .sort((a, b) => BY_NAME.compare(a.name, b.name)),
    [tree.persons],
  );
  const matches = useMemo(() => {
    const needle = foldName(searched.trim());
    if (needle === '') return null;
    const shown: typeof people = [];
    let total = 0;
    for (const other of people) {
      if (other.id === personId || !other.key.includes(needle)) continue;
      total += 1;
      if (shown.length < MAX_PICKS) shown.push(other);
    }
    return { shown, total };
  }, [people, personId, searched]);
  // Only the people shown are checked against the rules.
  const options = useMemo<PickerOption[]>(
    () =>
      (matches?.shown ?? []).map((other) => {
        const result = planChange(tree, {
          kind: 'relate',
          personId: other.id,
          targetId: personId,
          relation,
        });
        return {
          id: other.id,
          name: other.name,
          note: lineage.get(other.id) === 'unlinked' ? t('tree.relationships.inTray') : undefined,
          blockedReason: result.kind === 'blocked' ? blockMessage(t, result.reason) : undefined,
        };
      }),
    [lineage, matches, personId, relation, t, tree],
  );

  const person = tree.persons[personId];
  if (person === undefined || requestChange === null) return null;
  const name = (id: string) => tree.persons[id]?.fullName ?? t('tree.relate.someone');
  // Focus stays in the dialog: on the control that made the change, or on the dialog's content
  // when that control's row is gone. `then` runs only once the change is applied.
  const run = (change: Change, then?: () => void) =>
    requestChange({
      change,
      focusFallback: () => body.current,
      onDone: (applied) => {
        setDone(applied);
        then?.();
      },
    });
  const marriages = links.marriages.filter((marriage) => marriage.partnerId !== null);
  const childIds = links.marriages.flatMap((marriage) => marriage.childIds);
  // A pick that the latest tree blocks (an undo, another device) is no pick.
  const pickedId =
    options.find((option) => option.id === selectedId && option.blockedReason === undefined)?.id ??
    null;
  const status =
    matches === null
      ? ''
      : matches.total === 0
        ? t('tree.relationships.noMatch')
        : matches.total > MAX_PICKS
          ? `${t('tree.relationships.found', { count: matches.total })} ${t('tree.relationships.narrow', { max: MAX_PICKS })}`
          : t('tree.relationships.found', { count: matches.total });

  const apply = () => {
    if (pickedId === null) {
      setPickError(t('tree.relationships.pick'));
      return;
    }
    setPickError(null);
    // Cancelled, blocked or out of date: the search and the pick stay, to try again.
    run({ kind: 'relate', personId: pickedId, targetId: personId, relation }, () => {
      setSelectedId(null);
      setQuery('');
    });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={t('tree.relationships.title', { name: person.fullName })}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {/* The lists scroll; the last change, its Undo, Apply and Done stay in view (a phone,
            200% zoom). */}
        <div
          ref={body}
          tabIndex={-1}
          className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1"
        >
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
                // The child leaves this parent only, as "Gỡ cha/mẹ" does from the child's side.
                onRemove={() => run({ kind: 'removeParent', childId: id, parentId: personId })}
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
                    onChange={() => {
                      setRelation(choice);
                      setSelectedId(null);
                    }}
                  />
                  {t(RELATION_LABEL[choice], { name: person.fullName })}
                </label>
              ))}
            </fieldset>
            <PersonPicker
              label={t('tree.relationships.search')}
              listLabel={t('tree.relationships.results')}
              status={status}
              query={query}
              onQueryChange={(next) => {
                setQuery(next);
                setSelectedId(null);
              }}
              options={options}
              selectedId={pickedId}
              onSelect={(id) => {
                setSelectedId(id);
                setPickError(null);
              }}
            />
          </section>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          {pickError === null ? null : (
            <p role="alert" className="text-sm font-medium text-stamp">
              {pickError}
            </p>
          )}
          {/* Not a live region: the runner's toast announces the same sentence. */}
          {done === null ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-ink">{done.text}</p>
              {canUndo ? (
                <HandOffButton
                  // Focus stays in the dialog when the focused Undo goes away.
                  onFocusLost={() => body.current?.focus()}
                  variant="secondary"
                  size="sm"
                  aria-label={t('tree.relate.undoThis')}
                  onClick={() => {
                    done.undo();
                    setDone(null);
                  }}
                >
                  {t('tree.undo.label')}
                </HandOffButton>
              ) : null}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('tree.relationships.close')}
            </Button>
            <Button onClick={apply}>{t('tree.relationships.apply')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
