import { useTranslation } from 'react-i18next';
import { SaveStatus } from './SaveStatus';
import { UndoRedoButtons } from './UndoRedoButtons';

/**
 * The tree page's toolbar (spec §7.5): ↶ ↷ for editors, then the save status. It stays above
 * the board on every screen size until the toolbar's other controls arrive.
 */
export function TreeToolbar({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('tree.toolbar.label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {canEdit ? <UndoRedoButtons /> : null}
      <SaveStatus />
    </div>
  );
}
