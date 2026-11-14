import { EMPTY_TREE } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { lookupIn } from '../tree';
import { FAMILY_HISTORY, historyEntry } from './fixtures';
import { entryNote, entrySummary } from './historyText';

const t = i18n.t;
// Nobody on the tree: the names come from the ops.
const nobody = lookupIn(EMPTY_TREE);

describe('history text', () => {
  it('names the author and the change, using the names the ops carry', () => {
    const [, , first] = FAMILY_HISTORY;
    expect(entrySummary(t, first!, nobody)).toBe('Lan: thêm Nguyễn Văn Tư');
  });

  it('says which change a revert undid', () => {
    const op = { type: 'setProgenitor', payload: { personId: null } } as const;
    expect(entryNote(t, historyEntry(4, op, op, { revertsSeq: 2 }))).toBe('Hoàn tác thay đổi #2');
    expect(entryNote(t, historyEntry(5, op, op, { revertsToSeq: 1 }))).toBe(
      'Quay về sau thay đổi #1',
    );
    expect(entryNote(t, historyEntry(6, op, op))).toBeNull();
  });
});
