import type { Person } from '@ancestors-tree/shared/tree';
import { Baby, Crown, HeartPlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';

interface PersonActionsDialogProps {
  person: Person;
  isOwner: boolean;
  isProgenitor: boolean;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onSetProgenitor: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ICON = { 'aria-hidden': true, className: 'size-4', strokeWidth: 1.75 } as const;

export function PersonActionsDialog({
  person,
  isOwner,
  isProgenitor,
  onAddChild,
  onAddSpouse,
  onSetProgenitor,
  onDelete,
  onClose,
}: PersonActionsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={person.fullName} description={t('tree.actions.description')}>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" className="justify-start" onClick={onAddChild}>
            <Baby {...ICON} />
            {t('tree.actions.addChild')}
          </Button>
          <Button variant="secondary" className="justify-start" onClick={onAddSpouse}>
            <HeartPlus {...ICON} />
            {t('tree.actions.addSpouse')}
          </Button>
          {isOwner && !isProgenitor ? (
            <Button variant="secondary" className="justify-start" onClick={onSetProgenitor}>
              <Crown {...ICON} />
              {t('tree.actions.setProgenitor')}
            </Button>
          ) : null}
          <Button variant="danger" className="justify-start" onClick={onDelete}>
            <Trash2 {...ICON} />
            {t('tree.actions.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
