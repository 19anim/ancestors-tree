import { buildTreeIndex } from '@ancestors-tree/shared/tree';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeletePersonDialog } from './DeletePersonDialog';
import { addChildOp, addFirstPersonOp, addSpouseOp, deletePersonOp, setProgenitorOp } from './ops';
import { PersonActionsDialog } from './PersonActionsDialog';
import { PersonFormDialog, type UnionChoice } from './PersonFormDialog';
import { useTreeStore } from './store';

export type TreeDialog =
  { kind: 'first' } | { kind: 'actions' | 'child' | 'spouse' | 'delete'; personId: string } | null;

interface TreeDialogsProps {
  dialog: TreeDialog;
  isOwner: boolean;
  onDialogChange: (next: TreeDialog) => void;
}

/** One dialog at a time; each is mounted only while open, so its form starts empty. */
export function TreeDialogs({ dialog, isOwner, onDialogChange }: TreeDialogsProps) {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const apply = useTreeStore((state) => state.apply);
  const index = useMemo(() => buildTreeIndex(tree), [tree]);
  const close = () => onDialogChange(null);

  if (dialog === null) return null;
  if (dialog.kind === 'first') {
    return (
      <PersonFormDialog
        title={t('tree.form.firstTitle')}
        onSubmit={(input) => apply(addFirstPersonOp(input))}
        onClose={close}
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
          onSetProgenitor={() => {
            if (apply(setProgenitorOp(person.id)).ok) close();
          }}
          onDelete={() => onDialogChange({ kind: 'delete', personId: person.id })}
          onClose={close}
        />
      );
    case 'child': {
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
        />
      );
    }
    case 'spouse':
      return (
        <PersonFormDialog
          title={t('tree.form.spouseTitle', { name: person.fullName })}
          onSubmit={(input) => apply(addSpouseOp(index, person.id, input))}
          onClose={close}
        />
      );
    case 'delete':
      return (
        <DeletePersonDialog
          person={person}
          onConfirm={() => apply(deletePersonOp(person.id))}
          onClose={close}
        />
      );
  }
}
