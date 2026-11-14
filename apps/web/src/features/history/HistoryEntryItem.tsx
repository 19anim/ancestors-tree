import type { HistoryEntry } from '@ancestors-tree/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { NameLookup } from '../tree';
import { entryNote, entrySummary } from './historyText';

interface HistoryEntryItemProps {
  entry: HistoryEntry;
  lookup: NameLookup;
  /** The entry's buttons. */
  children?: ReactNode;
}

export function HistoryEntryItem({ entry, lookup, children }: HistoryEntryItemProps) {
  const { t, i18n } = useTranslation();
  const note = entryNote(t, entry);
  const time = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(entry.createdAt));
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-ink">{entrySummary(t, entry, lookup)}</p>
        <div className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
          <span className="font-mono">{t('history.entry.number', { seq: entry.seq })}</span>
          <time dateTime={entry.createdAt}>{time}</time>
          {note !== null ? <span>{note}</span> : null}
        </div>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </li>
  );
}
