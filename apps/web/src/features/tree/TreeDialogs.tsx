import { buildTreeIndex } from '@ancestors-tree/shared/tree';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeletePersonDialog } from './DeletePersonDialog';
import { addChildOp, addFirstPersonOp, addSpouseOp, deletePersonOp, setProgenitorOp } from './ops';
import { PersonActionsDialog } from './PersonActionsDialog';
import { PersonFormDialog, type UnionChoice } from './PersonFormDialog';
import { useTreeStore } from './store';

export type TreeDialog =
  { kind: 'first' } | { kind: 'actions' | 'child' | 'spouse' | 'delete'; personId: string } | null;

/** The person's actions button (on the board or in the tray): see PersonCard and UnlinkedTray. */
function actionsButtonOf(personId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-person-actions="${personId}"]`);
}

/**
 * The tree page's dialog, and where focus goes when the last one closes (WCAG 2.4.3). The
 * dialogs open without a Radix trigger, so they record what opened them: on close, focus goes
 * back to that element, else to the person's actions button (after an add, the new person's),
 * else to the main content.
 */
export function useTreeDialog() {
  const [dialog, setDialog] = useState<TreeDialog>(null);
  const current = useRef<TreeDialog>(null);
  const opener = useRef<{ element: HTMLElement | null; personId: string | null } | null>(null);

  const changeDialog = useCallback((next: TreeDialog) => {
    if (current.current === null && next !== null) {
      const active = document.activeElement;
      opener.current = {
        element: active instanceof HTMLElement ? active : null,
        personId: next.kind === 'first' ? null : next.personId,
      };
    }
    current.current = next;
    setDialog(next);
  }, []);

  /** The first person was added: the button that opened the form is gone, theirs is the place. */
  const firstPersonAdded = useCallback((personId: string) => {
    if (opener.current) opener.current.personId = personId;
  }, []);

  const returnFocus = useCallback((event: Event) => {
    event.preventDefault();
    // Handed on to the next dialog (actions, then add a child): focus belongs to that one.
    if (current.current !== null) return;
    const from = opener.current;
    opener.current = null;
    const target =
      (from?.element?.isConnected ? from.element : null) ??
      (from?.personId ? actionsButtonOf(from.personId) : null) ??
      document.querySelector<HTMLElement>('main');
    target?.focus();
  }, []);

  return { dialog, changeDialog, firstPersonAdded, returnFocus };
}

interface TreeDialogsProps {
  dialog: TreeDialog;
  isOwner: boolean;
  onDialogChange: (next: TreeDialog) => void;
  onFirstPersonAdded: (personId: string) => void;
  /** Given to every dialog's onCloseAutoFocus. */
  onCloseAutoFocus: (event: Event) => void;
}

/** One dialog at a time; each is mounted only while open, so its form starts empty. */
export function TreeDialogs({
  dialog,
  isOwner,
  onDialogChange,
  onFirstPersonAdded,
  onCloseAutoFocus,
}: TreeDialogsProps) {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const apply = useTreeStore((state) => state.apply);
  // Only the forms that link people read the index; building it on every edit is wasted work.
  const needsIndex = dialog?.kind === 'child' || dialog?.kind === 'spouse';
  const index = useMemo(() => (needsIndex ? buildTreeIndex(tree) : null), [needsIndex, tree]);
  const close = () => onDialogChange(null);

  if (dialog === null) return null;
  if (dialog.kind === 'first') {
    return (
      <PersonFormDialog
        title={t('tree.form.firstTitle')}
        onSubmit={(input) => {
          const op = addFirstPersonOp(input);
          const result = apply(op);
          if (result.ok) onFirstPersonAdded(op.payload.id);
          return result;
        }}
        onClose={close}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );
  }
  const person = tree.persons[dialog.personId];
  // Deleted meanwhile (for example by a reload after a conflict).
  if (!person) return null;

  switch (dialog.kind) {
    case 'actions':
      return (
        <PersonActionsDialog
          person={person}
          isOwner={isOwner}
          isProgenitor={tree.progenitorId === person.id}
          onAddChild={() => onDialogChange({ kind: 'child', personId: person.id })}
          onAddSpouse={() => onDialogChange({ kind: 'spouse', personId: person.id })}
          onSetProgenitor={() => apply(setProgenitorOp(person.id))}
          onDelete={() => onDialogChange({ kind: 'delete', personId: person.id })}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
    case 'child': {
      if (index === null) return null;
      const choices: UnionChoice[] = index.unionsOf(person.id).map((union) => {
        const partnerId = union.partnerIds.find((id) => id !== person.id);
        const partner = partnerId === undefined ? undefined : tree.persons[partnerId];
        return {
          id: union.id,
          label: partner
            ? t('tree.form.unionWith', { name: person.fullName, partner: partner.fullName })
            : t('tree.form.unionAlone', { name: person.fullName }),
        };
      });
      return (
        <PersonFormDialog
          title={t('tree.form.childTitle', { name: person.fullName })}
          unionChoices={choices}
          onSubmit={(input, unionId) => apply(addChildOp(index, person.id, input, unionId))}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
    }
    case 'spouse':
      if (index === null) return null;
      return (
        <PersonFormDialog
          title={t('tree.form.spouseTitle', { name: person.fullName })}
          onSubmit={(input) => apply(addSpouseOp(index, person.id, input))}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
    case 'delete':
      return (
        <DeletePersonDialog
          person={person}
          onConfirm={() => apply(deletePersonOp(person.id))}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
  }
}
