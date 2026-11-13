import { useTranslation } from 'react-i18next';

/** Shaped like the tree page (board plus tray) while it loads; never a bare spinner. */
export function TreeSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {t('tree.loading')}
      </p>
      <div
        aria-hidden="true"
        className="board-grid min-h-[320px] animate-pulse rounded-control border border-line"
      />
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-6 w-40 animate-pulse rounded-control bg-paper-grid" />
        <div className="flex gap-4">
          <div className="h-24 w-28 animate-pulse rounded-control bg-paper-grid" />
          <div className="h-24 w-28 animate-pulse rounded-control bg-paper-grid" />
        </div>
      </div>
    </div>
  );
}
