import { hasRoleAtLeast, type Clan } from '@ancestors-tree/shared';
import { buildTreeIndex } from '@ancestors-tree/shared/tree';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { ChangeContext, useChangeRunner } from './ChangeRunner';
import { changesToMatch, showsOwnTheme, type DecorMode, type DecorTarget } from './decor';
import { DecoratePanel } from './DecoratePanel';
import { DecorateContext, PersonalThemeContext } from './decorContext';
import { EmptyTree } from './EmptyTree';
import { applyFailureMessage } from './format';
import { setProgenitorOp } from './ops';
import { useProfileDraft } from './profileDraft';
import { ProfilePanel } from './ProfilePanel';
import { OpenPersonContext, personCardButton, useProfileParam } from './profileParams';
import { useTreeStore } from './store';
import { TreeBoard } from './TreeBoard';
import { TreeDialogs, useTreeDialog } from './TreeDialogs';
import { TreeDnd } from './TreeDnd';
import { ThemeBanner, DecorSaveError } from './ThemeBanner';
import { TreeSkeleton } from './TreeSkeleton';
import { TreeToolbar } from './TreeToolbar';
import { UnlinkedTray } from './UnlinkedTray';
import {
  availableActions,
  PersonActionsContext,
  siblingNeighbour,
  type PersonActionsApi,
} from './usePersonActions';
import { useClanTree } from './useClanTree';
import { usePersonalDecor } from './useViewPreference';

export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const decor = usePersonalDecor(clan.id);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);
  const { dialog, changeDialog, firstPersonAdded, returnFocus } = useTreeDialog();
  const runner = useChangeRunner();
  const { requestChange } = runner;
  // openPerson and closeProfile are stable (and so is openPersonHere, below), so the cards
  // (context consumers) do not re-render when the page does.
  const { personId, openPerson, closeProfile } = useProfileParam();
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  // The open person, deleted on this page: their panel closes without a notice. Set only for
  // the open person, so an earlier deletion (undone since) cannot silence a later removal.
  const removedHere = useRef<string | null>(null);
  // The open person's last known name, kept here because the panel unmounts while the tree
  // reloads (the skeleton shows): the notice can still name someone deleted meanwhile.
  const openName = useTreeStore((state) =>
    personId === null ? undefined : state.tree.persons[personId]?.fullName,
  );
  const knownName = useRef<{ personId: string; name: string } | null>(null);
  useEffect(() => {
    if (personId !== null && openName !== undefined)
      knownName.current = { personId, name: openName };
  }, [personId, openName]);
  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';
  const addSeveral = canEdit ? () => changeDialog({ kind: 'several' }) : undefined;

  const actions = useMemo<PersonActionsApi | null>(() => {
    if (!canEdit) return null;
    return {
      actionsFor: (id) => availableActions(useTreeStore.getState().tree, id, isOwner),
      run: (id, action) => {
        setActionError(null);
        switch (action) {
          case 'addChild':
            changeDialog({ kind: 'child', personId: id });
            return;
          case 'addSpouse':
            changeDialog({ kind: 'spouse', personId: id });
            return;
          case 'delete':
            changeDialog({ kind: 'delete', personId: id });
            return;
          case 'setProgenitor': {
            const result = useTreeStore.getState().apply(setProgenitorOp(id));
            if (!result.ok) setActionError(applyFailureMessage(t, result.reason));
            return;
          }
          case 'addParent':
            changeDialog({ kind: 'parent', personId: id });
            return;
          case 'changeRelationship':
            changeDialog({ kind: 'relationships', personId: id });
            return;
          case 'moveEarlier':
          case 'moveLater': {
            const tree = useTreeStore.getState().tree;
            const side = action === 'moveEarlier' ? 'earlier' : 'later';
            const targetId = siblingNeighbour(tree, buildTreeIndex(tree), id, side);
            if (targetId !== null) {
              requestChange({
                change: {
                  kind: 'relate',
                  personId: id,
                  targetId,
                  relation: side === 'earlier' ? 'before' : 'after',
                },
                focusPersonId: id,
              });
            }
            return;
          }
          default: {
            const unknown: never = action;
            throw new Error(`Unknown person action: ${String(unknown)}`);
          }
        }
      },
    };
  }, [canEdit, changeDialog, isOwner, requestChange, t]);

  // An open profile form went away with unsaved changes (ProfileForm's onDraftLost). Its
  // unmount comes before the panel reports a missing person, and before the tree is back from a
  // reload: whichever comes next says the changes were dropped.
  const draftLost = useRef(false);
  const onDraftLost = useCallback(() => {
    draftLost.current = true;
  }, []);

  const onMissing = useCallback(() => {
    const silent = removedHere.current !== null && removedHere.current === personId;
    removedHere.current = null;
    const known = knownName.current;
    const name = known !== null && known.personId === personId ? known.name : undefined;
    const hadDraft = draftLost.current;
    // No draft to drop here: the form unmounted first and its cleanup cleared it, so the guard
    // does not ask about someone who is gone.
    draftLost.current = false;
    if (!silent) {
      setNotice(
        name === undefined
          ? t('tree.profile.missingUnnamed')
          : t(hadDraft ? 'tree.profile.missingWithDraft' : 'tree.profile.missing', { name }),
      );
    }
    closeProfile();
  }, [closeProfile, personId, t]);

  // The tree reloaded (the skeleton replaced the page, and the open form with it): once it is
  // back, say the unsaved profile changes were dropped. The panel's effects run first, so a
  // person who left the tree meanwhile gets onMissing's notice instead.
  const ready = view.state === 'ready';
  useEffect(() => {
    if (!ready || !draftLost.current) return;
    draftLost.current = false;
    setNotice(t('tree.profile.reloadedWithDraft'));
  }, [ready, t]);

  // The panel closed with focus inside it (Esc, the close button, Back): back to the card.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = personId;
    // An action's error belongs to the profile it came from.
    setActionError(null);
    if (personId !== null) setNotice('');
    if (was === null || personId !== null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (personCardButton(was) ?? document.querySelector<HTMLElement>('main'))?.focus();
  }, [personId]);

  // Decorate (spec §13.4). Viewers decorate only for themselves. Editors start where they are:
  // on their own theme while it is on, else on the family's; a switch they made stays.
  const [decorating, setDecorating] = useState<DecorTarget | null>(null);
  const [chosenMode, setChosenMode] = useState<DecorMode | null>(null);
  const mode: DecorMode = !canEdit
    ? 'me'
    : (chosenMode ?? (decor.preference?.enabled === true ? 'me' : 'clan'));
  const decorOpener = useRef<HTMLElement | null>(null);
  const openDecorate = useCallback(
    (target: DecorTarget) => {
      // The panel takes the profile's column: a profile form with unsaved changes would lose them.
      if (useProfileDraft.getState().dirty) {
        setNotice(t('tree.decor.saveFirst'));
        return;
      }
      const active = document.activeElement;
      decorOpener.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      setDecorating(target);
    },
    [t],
  );
  const closeDecorate = useCallback(() => setDecorating(null), []);

  // "Use for the whole family": the parts of my theme the family's lacks (none: no button).
  const clanTheme = useTreeStore((state) => state.tree.theme);
  const myTheme = decor.preference?.theme;
  const toShare = useMemo(
    () => (canEdit && myTheme !== undefined ? changesToMatch(clanTheme, myTheme) : null),
    [canEdit, clanTheme, myTheme],
  );
  const backButton = useRef<HTMLButtonElement>(null);
  const decorateButton = useRef<HTMLButtonElement>(null);
  const shareMyTheme = useCallback(() => {
    if (toShare === null) return;
    // Once nothing is left to share this button goes: focus stays in the banner, on Back.
    requestChange({
      change: { kind: 'treeTheme', changes: toShare },
      focusFallback: () => backButton.current,
    });
  }, [requestChange, toShare]);
  const { change: changeMine } = decor;
  const backPressed = useRef(false);
  const backToShared = useCallback(() => {
    backPressed.current = true;
    changeMine((current) => ({ ...current, enabled: false }));
  }, [changeMine]);

  // Back took the banner, and the focus in it, away: on to Decorate, else the main content.
  const ownTheme = showsOwnTheme(decor.preference);
  useEffect(() => {
    if (ownTheme || !backPressed.current) return;
    backPressed.current = false;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (decorateButton.current ?? document.querySelector<HTMLElement>('main'))?.focus();
  }, [ownTheme]);

  // Opening someone's profile closes Decorate: the profile takes the column.
  useEffect(() => {
    setDecorating(null);
  }, [personId]);
  // So does a click on the card whose profile is already open (its Decorate swapped in): the
  // address stays the same, so the effect above does not run.
  const openPersonHere = useCallback(
    (...args: Parameters<typeof openPerson>) => {
      setDecorating(null);
      openPerson(...args);
    },
    [openPerson],
  );

  // Decorate closed with focus inside it: back to what opened it, else the card it decorated.
  const lastTarget = useRef<DecorTarget | null>(null);
  useEffect(() => {
    const previous = lastTarget.current;
    lastTarget.current = decorating;
    if (previous === null || decorating !== null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const opener = decorOpener.current;
    const card = previous.kind === 'card' ? personCardButton(previous.personId) : null;
    (opener?.isConnected ? opener : (card ?? document.querySelector<HTMLElement>('main')))?.focus();
  }, [decorating]);

  if (view.state === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-medium text-stamp">
          {t(errorMessageKey(view.error))}
        </p>
        <Button variant="secondary" onClick={view.retry}>
          {t('tree.retry')}
        </Button>
      </div>
    );
  }
  if (view.state === 'loading') return <TreeSkeleton />;
  return (
    <OpenPersonContext value={openPersonHere}>
      <PersonalThemeContext value={decor.preference}>
        <PersonActionsContext value={actions}>
          <ChangeContext value={canEdit ? requestChange : null}>
            <DecorateContext value={openDecorate}>
              {/* From md up the profile is a column beside the content, so nothing hides under it. */}
              <div className="md:flex md:items-start md:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <TreeToolbar
                    canEdit={canEdit}
                    onAddSeveral={addSeveral}
                    onDecorate={isEmpty ? undefined : () => openDecorate({ kind: 'tree' })}
                    decorateRef={decorateButton}
                  />
                  {ownTheme ? (
                    <ThemeBanner
                      backRef={backButton}
                      onBack={backToShared}
                      onUseForClan={toShare === null ? null : shareMyTheme}
                    />
                  ) : null}
                  {decor.saveState === 'failed' ? <DecorSaveError onRetry={decor.retry} /> : null}
                  {/* Always in the accessibility tree, so a later message is announced; while empty,
                  sr-only takes it out of the layout without hiding it from screen readers. */}
                  <p role="status" className="font-medium text-ink empty:sr-only">
                    {notice}
                  </p>
                  {actionError ? (
                    <p role="alert" className="font-medium text-stamp">
                      {actionError}
                    </p>
                  ) : null}
                  {isEmpty ? (
                    <EmptyTree
                      onAddFirst={canEdit ? () => changeDialog({ kind: 'first' }) : undefined}
                    />
                  ) : (
                    <TreeDnd canEdit={canEdit}>
                      <TreeBoard
                        label={t('tree.board.label', { name: clan.name })}
                        openPersonId={personId}
                      />
                      <UnlinkedTray onAddSeveral={addSeveral} />
                    </TreeDnd>
                  )}
                </div>
                {decorating !== null ? (
                  <DecoratePanel
                    key={decorating.kind === 'card' ? decorating.personId : 'tree'}
                    target={decorating}
                    mode={mode}
                    onModeChange={setChosenMode}
                    canEdit={canEdit}
                    decor={decor}
                    onClose={closeDecorate}
                  />
                ) : personId !== null ? (
                  <ProfilePanel
                    key={personId}
                    clanId={clan.id}
                    personId={personId}
                    isOwner={isOwner}
                    actions={actions}
                    onClose={closeProfile}
                    onMissing={onMissing}
                    onDraftLost={onDraftLost}
                  />
                ) : null}
              </div>
              {canEdit ? (
                <TreeDialogs
                  dialog={dialog}
                  onDialogChange={changeDialog}
                  onFirstPersonAdded={firstPersonAdded}
                  onPersonDeleted={(id) => {
                    if (id === personId) removedHere.current = id;
                  }}
                  onCloseAutoFocus={returnFocus}
                />
              ) : null}
              {canEdit ? runner.element : null}
            </DecorateContext>
          </ChangeContext>
        </PersonActionsContext>
      </PersonalThemeContext>
    </OpenPersonContext>
  );
}
