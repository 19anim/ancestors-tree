import { Palette, UsersRound } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { SaveStatus } from './SaveStatus';
import { UndoRedoButtons } from './UndoRedoButtons';

/**
 * The tree page's toolbar (spec §7.5): ↶ ↷ and "Add several people" for editors, then Decorate
 * for everyone (spec §13.4), then the save status.
 */
export function TreeToolbar({
  canEdit,
  onAddSeveral,
  onDecorate,
  decorateRef,
}: {
  canEdit: boolean;
  onAddSeveral?: () => void;
  onDecorate?: () => void;
  decorateRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('tree.toolbar.label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {canEdit ? <UndoRedoButtons /> : null}
      {canEdit && onAddSeveral ? (
        <Button variant="secondary" size="sm" onClick={onAddSeveral}>
          <UsersRound aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {t('tree.several.open')}
        </Button>
      ) : null}
      {onDecorate ? (
        <Button ref={decorateRef} variant="secondary" size="sm" onClick={onDecorate}>
          <Palette aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {t('tree.decor.open')}
        </Button>
      ) : null}
      <SaveStatus />
    </div>
  );
}
