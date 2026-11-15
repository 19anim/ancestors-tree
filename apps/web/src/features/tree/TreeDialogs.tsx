import type { Clan } from '@ancestors-tree/shared';
import { buildTreeIndex } from '@ancestors-tree/shared/tree';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { AddSeveralDialog } from './AddSeveralDialog';
import { DeletePersonDialog } from './DeletePersonDialog';
import {
  addChildOp,
  addFirstPersonOp,
  addParentOp,
  addSeveralOp,
  addSpouseOp,
  deletePersonOp,
  parentSlot,
} from './ops';
import { PersonFormDialog, type UnionChoice } from './PersonFormDialog';
import { personCardButton } from './profileParams';
import { useTreeStore } from './store';

export type TreeDialog =
  | { kind: 'first' }
  | { kind: 'several' }
  | { kind: 'child' | 'spouse' | 'parent' | 'delete'; personId: string }
  | null;

/**
 * The tree page's dialog, and where focus goes when the last one closes (WCAG 2.4.3). The
 * dialogs open without a Radix trigger, so they record what opened them: on close, focus goes
 * back to that element, else to the person's card (after an add, the new person's),
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
        personId: 'personId' in next ? next.personId : null,
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
    // Handed on to another dialog: focus belongs to that one.
    if (current.current !== null) return;
    const from = opener.current;
    opener.current = null;
    const target =
      (from?.element?.isConnected ? from.element : null) ??
      (from?.personId ? personCardButton(from.personId) : null) ??
      document.querySelector<HTMLElement>('main');
    target?.focus();
  }, []);

  return { dialog, changeDialog, firstPersonAdded, returnFocus };
}

interface TreeDialogsProps {
  dialog: TreeDialog;
  onDialogChange: (next: TreeDialog) => void;
  onFirstPersonAdded: (personId: string) => void;
  /** The user deleted this person here (the profile then closes without a notice). */
  onPersonDeleted: (personId: string) => void;
  /** Given to every dialog's onCloseAutoFocus. */
  onCloseAutoFocus: (event: Event) => void;
}

/** One dialog at a time; each is mounted only while open, so its form starts empty. */
export function TreeDialogs({
  dialog,
  onDialogChange,
  onFirstPersonAdded,
  onPersonDeleted,
  onCloseAutoFocus,
}: TreeDialogsProps) {
  const { t } = useTranslation();
  // The page's family tree, as TreePage reads it: only its Manager may move the progenitor.
  const isOwner = useOutletContext<Clan>().role === 'owner';
  const tree = useTreeStore((state) => state.tree);
  const apply = useTreeStore((state) => state.apply);
  // Only the forms that link people read the index; building it on every edit is wasted work.
  const needsIndex =
    dialog?.kind === 'child' || dialog?.kind === 'spouse' || dialog?.kind === 'parent';
  const index = useMemo(() => (needsIndex ? buildTreeIndex(tree) : null), [needsIndex, tree]);
  const close = () => onDialogChange(null);
  // A dialog whose person is gone (deleted meanwhile, for example by a reload after a conflict)
  // is reset, so the next dialog records its opener again.
  const missing =
    dialog !== null && 'personId' in dialog && tree.persons[dialog.personId] === undefined;
  useEffect(() => {
    if (missing) onDialogChange(null);
  }, [missing, onDialogChange]);

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
  if (dialog.kind === 'several') {
    return (
      <AddSeveralDialog
        onSubmit={(inputs) => apply(addSeveralOp(inputs))}
        onClose={close}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );
  }
  const person = tree.persons[dialog.personId];
  // Deleted meanwhile (for example by a reload after a conflict).
  if (!person) return null;

  switch (dialog.kind) {
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
    case 'parent': {
      if (index === null) return null;
      const slot = parentSlot(tree, index, person.id);
      const offerProgenitor = isOwner && tree.progenitorId === person.id;
      return (
        <PersonFormDialog
          title={t('tree.form.parentTitle', { name: person.fullName })}
          defaultGender={slot.kind === 'one' && slot.parent.gender === 'male' ? 'female' : 'male'}
          note={
            slot.kind === 'one' && slot.siblings.length > 0
              ? t('tree.form.parentAlsoOf', {
                  names: slot.siblings.map((sibling) => sibling.fullName).join(', '),
                })
              : undefined
          }
          checkbox={
            offerProgenitor
              ? { label: t('tree.form.makeProgenitor'), defaultChecked: true }
              : undefined
          }
          onSubmit={(input, _unionId, checked) =>
            // Both parents became known while the form was open (another device, an undo):
            // a new union would take the child away from them, so the form says to look again.
            slot.kind === 'full'
              ? { ok: false, reason: 'OUT_OF_DATE' }
              : apply(addParentOp(tree, index, person.id, input, offerProgenitor && checked))
          }
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
    }
    case 'delete':
      return (
        <DeletePersonDialog
          person={person}
          onConfirm={() => {
            const result = apply(deletePersonOp(person.id));
            if (result.ok) onPersonDeleted(person.id);
            return result;
          }}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
  }
}
