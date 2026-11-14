import { OpError, treeStateFromLists, type Op, type TreeState } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/lib/apiError';
import { FAMILY, fixturePerson, LOOSE, SON } from './fixtures';
import { replayPending, resolveRefs, revertFieldsOf, type PendingEntry } from './pending';

const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const family = (): TreeState =>
  treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
const bio = (text: string): Op => ({
  type: 'updatePerson',
  payload: { id: SON, changes: { bio: text } },
});
const add: Op = { type: 'addPerson', payload: fixturePerson(NEW_ID, 'Nguyễn Văn Út') };
const removeNew: Op = { type: 'deletePerson', payload: { id: NEW_ID } };

describe('replayPending', () => {
  it('applies the entries that fit and reports why the others were dropped', () => {
    const entries: PendingEntry[] = [
      { id: 1, op: bio('Con trưởng') },
      { id: 2, op: removeNew },
      { id: 3, op: { type: 'deletePerson', payload: { id: LOOSE } } },
    ];
    const result = replayPending(family(), entries);
    expect(result.kept.map((entry) => entry.id)).toEqual([1, 3]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.entry.id).toBe(2);
    expect(result.dropped[0]?.error).toBeInstanceOf(OpError);
    expect((result.dropped[0]?.error as OpError).code).toBe('PERSON_NOT_FOUND');
    expect(result.tree.persons[SON]?.bio).toBe('Con trưởng');
    expect(result.tree.persons[LOOSE]).toBeUndefined();
    // The inverse of each kept entry, computed on the replayed tree.
    expect(result.inverses.get(1)).toEqual({
      type: 'updatePerson',
      payload: { id: SON, changes: { bio: null } },
    });
    expect(result.inverses.get(3)?.type).toBe('restorePerson');
  });

  it('drops the undo of a change that was dropped, even when it would still apply', () => {
    const entries: PendingEntry[] = [
      { id: 7, op: bio('Lần hai'), reverts: { pendingId: 5 } },
      { id: 8, op: bio('Lần ba') },
    ];
    const result = replayPending(family(), entries, { alreadyDropped: [5] });
    expect(result.dropped).toEqual([{ entry: entries[0], error: null }]);
    expect(result.kept).toEqual([entries[1]]);
  });

  it('drops a revert to a point when someone else saved a change', () => {
    const entry: PendingEntry = { id: 1, op: bio('x'), revertsToSeq: 2 };
    expect(replayPending(family(), [entry]).kept).toEqual([entry]);
    const outdated = replayPending(family(), [entry], { othersSaved: true });
    expect(outdated.kept).toEqual([]);
    expect(outdated.dropped[0]?.error).toBeInstanceOf(ApiError);
    expect(outdated.dropped[0]?.error).toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});

describe('resolveRefs and revertFieldsOf', () => {
  it('names a saved change by its seq', () => {
    const entries: PendingEntry[] = [
      { id: 2, op: removeNew, reverts: { pendingId: 1 } },
      { id: 3, op: add, reverts: { pendingId: 9 } },
    ];
    const resolved = resolveRefs(entries, 1, 12);
    expect(resolved[0]?.reverts).toEqual({ seq: 12 });
    expect(resolved[1]).toBe(entries[1]);
    expect(revertFieldsOf(resolved[0] as PendingEntry)).toEqual({ revertsSeq: 12 });
    // Not saved yet: nothing to name.
    expect(revertFieldsOf(resolved[1] as PendingEntry)).toEqual({});
    expect(revertFieldsOf({ id: 4, op: add, revertsToSeq: 3 })).toEqual({ revertsToSeq: 3 });
  });
});
