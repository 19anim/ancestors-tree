import type { HistoryEntry } from '@ancestors-tree/shared';
import type { TFunction } from 'i18next';
import { describeAction, describeOp, lookupWith, type NameLookup } from '../tree';

/** "Lan: thêm Nguyễn Văn Bình". Names come from the tree, else from the ops themselves. */
export function entrySummary(t: TFunction, entry: HistoryEntry, lookup: NameLookup): string {
  const names = lookupWith(lookup, [entry.op, entry.inverse]);
  const action = describeAction(t, describeOp(entry.op, names));
  return t('history.entry.summary', { author: entry.authorName, action });
}

/** Which change a revert undid, or null for an ordinary change. */
export function entryNote(t: TFunction, entry: HistoryEntry): string | null {
  if (entry.revertsSeq !== undefined) return t('history.entry.reverts', { seq: entry.revertsSeq });
  if (entry.revertsToSeq !== undefined) {
    return t('history.entry.revertsTo', { seq: entry.revertsToSeq });
  }
  return null;
}
