import {
  treeStateFromLists,
  type Op,
  type OpError,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, fixturePerson, LOOSE, ME, OTHER_USER_ID, remoteEntry, SON } from './fixtures';
import type { PendingEntry } from './pending';
import { rebase, restoreQueue } from './rebase';

const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const CHILD = '64b7f0c2a1b2c3d4e5f6a0f2';
const LOOSE_UNION = '64b7f0c2a1b2c3d4e5f6b0f1';
const family = (): TreeState =>
  treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
const bio = (text: string): Op => ({
  type: 'updatePerson',
  payload: { id: SON, changes: { bio: text } },
});
/** Someone gave Bình (LOOSE) a child. */
const looseChild: Op = {
  type: 'batch',
  payload: {
    ops: [
      {
        type: 'addUnion',
        payload: { id: LOOSE_UNION, partnerIds: [LOOSE], order: 1, status: 'married' },
      },
      {
        type: 'addPerson',
        payload: fixturePerson(CHILD, 'Trần Văn Cường', { parentUnionId: LOOSE_UNION }),
      },
    ],
  },
};
const input = (pending: PendingEntry[], remote = [remoteEntry(4, looseChild)]) => ({
  confirmedTree: family(),
  confirmedVersion: 3,
  pending,
  remote,
  userId: ME.id,
});

describe('rebase', () => {
  it('applies the missed ops, then replays the queue on top', () => {
    const result = rebase(input([{ id: 1, op: bio('Con trưởng') }]));
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.confirmedVersion).toBe(4);
    expect(result.confirmedTree.persons[CHILD]).toBeDefined();
    expect(result.confirmedTree.persons[SON]?.bio).toBeUndefined();
    expect(result.tree.persons[CHILD]).toBeDefined();
    expect(result.tree.persons[SON]?.bio).toBe('Con trưởng');
    expect(result.pending.map((entry) => entry.id)).toEqual([1]);
    expect(result.saved).toBeNull();
  });

  it('drops a pending change the missed ops made impossible', () => {
    const result = rebase(input([{ id: 1, op: { type: 'deletePerson', payload: { id: LOOSE } } }]));
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.pending).toEqual([]);
    expect((result.dropped[0]?.error as OpError).code).toBe('PERSON_HAS_CHILDREN');
    expect(result.tree.persons[LOOSE]).toBeDefined();
  });

  it('recognises the first queued op, saved before its answer was lost', () => {
    const pending: PendingEntry[] = [
      { id: 1, op: bio('Con trưởng') },
      { id: 2, op: bio('Con cả'), reverts: { pendingId: 1 } },
    ];
    const result = rebase(input(pending, [remoteEntry(4, bio('Con trưởng'), ME.id)]));
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.saved).toEqual({ entry: pending[0], seq: 4 });
    expect(result.pending).toEqual([{ id: 2, op: bio('Con cả'), reverts: { seq: 4 } }]);
    expect(result.tree.persons[SON]?.bio).toBe('Con cả');
  });

  it('does not take the same op saved by someone else for ours', () => {
    const result = rebase(
      input([{ id: 1, op: bio('x') }], [remoteEntry(4, bio('x'), OTHER_USER_ID)]),
    );
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.saved).toBeNull();
    expect(result.pending).toHaveLength(1);
  });

  it('takes our own identical op for the queue head only when it is the first missed entry', () => {
    // The server only takes an op at clan.version === baseVersion, so a lost answer is seq 4.
    const result = rebase(
      input(
        [{ id: 1, op: bio('x') }],
        [remoteEntry(4, looseChild), remoteEntry(5, bio('x'), ME.id)],
      ),
    );
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.saved).toBeNull();
    expect(result.confirmedVersion).toBe(5);
    expect(result.pending.map((entry) => entry.id)).toEqual([1]);
  });

  it('asks for a reload when the log has a gap or does not apply', () => {
    expect(rebase(input([], [remoteEntry(5, looseChild)])).ok).toBe(false);
    const impossible: Op = { type: 'deletePerson', payload: { id: NEW_ID } };
    expect(rebase(input([], [remoteEntry(4, impossible)])).ok).toBe(false);
  });

  it('drops a revert to a point when anyone else saved a change', () => {
    const result = rebase(input([{ id: 1, op: bio('x'), revertsToSeq: 2 }]));
    if (!result.ok) throw new Error('expected a rebase');
    expect(result.pending).toEqual([]);
    expect(result.dropped[0]?.error).toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});

describe('restoreQueue', () => {
  /** The server's tree now: version 4, with Bình's child added by someone else. */
  const now = () => {
    const result = rebase(input([]));
    if (!result.ok) throw new Error('expected a rebase');
    return result.confirmedTree;
  };
  const restoring = (pending: PendingEntry[], remote = [remoteEntry(4, looseChild)]) => ({
    tree: now(),
    version: 4,
    savedVersion: 3,
    pending,
    remote,
    userId: ME.id,
  });

  it('replays the saved entries on the tree as it is now', () => {
    const result = restoreQueue(restoring([{ id: 1, op: bio('Con trưởng') }]));
    if (!result.ok) throw new Error('expected a restore');
    expect(result.tree.persons[CHILD]).toBeDefined();
    expect(result.tree.persons[SON]?.bio).toBe('Con trưởng');
    expect(result.pending).toHaveLength(1);
  });

  it('confirms a saved entry that reached the server before the reload', () => {
    const remote = [remoteEntry(4, bio('Con trưởng'), ME.id)];
    const tree = rebase(input([], remote));
    if (!tree.ok) throw new Error('expected a rebase');
    const result = restoreQueue({
      ...restoring([{ id: 1, op: bio('Con trưởng') }], remote),
      tree: tree.confirmedTree,
    });
    if (!result.ok) throw new Error('expected a restore');
    expect(result.saved.map((entry) => entry.seq)).toEqual([4]);
    expect(result.pending).toEqual([]);
  });

  it('ignores log entries after the tree it was given, and refuses a gap', () => {
    const later = [remoteEntry(4, looseChild), remoteEntry(5, bio('Sau'))];
    expect(restoreQueue(restoring([], later)).ok).toBe(true);
    expect(restoreQueue(restoring([], [])).ok).toBe(false);
    expect(restoreQueue({ ...restoring([]), savedVersion: 5 }).ok).toBe(false);
  });

  describe('a copy of a queue another tab already sent', () => {
    const e1 = bio('A');
    const e2 = bio('B');
    const queue: PendingEntry[] = [
      { id: 1, op: e1 },
      { id: 2, op: e2, reverts: { pendingId: 1 } },
    ];
    const restoreWith = (remote: ReturnType<typeof remoteEntry>[]) => {
      const tree = rebase(input([], remote));
      if (!tree.ok) throw new Error('expected a rebase');
      const result = restoreQueue({
        tree: tree.confirmedTree,
        version: 3 + remote.length,
        savedVersion: 3,
        pending: queue,
        remote,
        userId: ME.id,
      });
      if (!result.ok) throw new Error('expected a restore');
      return result;
    };

    it('confirms every entry of the run, so none is sent twice', () => {
      const result = restoreWith([remoteEntry(4, e1, ME.id), remoteEntry(5, e2, ME.id)]);
      expect(result.saved.map((entry) => entry.seq)).toEqual([4, 5]);
      expect(result.pending).toEqual([]);
    });

    it('replays what the run did not reach', () => {
      const result = restoreWith([
        remoteEntry(4, e1, ME.id),
        remoteEntry(5, looseChild, OTHER_USER_ID),
      ]);
      expect(result.saved.map((entry) => entry.seq)).toEqual([4]);
      expect(result.pending).toEqual([{ id: 2, op: e2, reverts: { seq: 4 } }]);
      expect(result.tree.persons[SON]?.bio).toBe('B');
    });

    it('does not confirm an own op that follows someone else', () => {
      const result = restoreWith([
        remoteEntry(4, looseChild, OTHER_USER_ID),
        remoteEntry(5, e1, ME.id),
      ]);
      expect(result.saved).toEqual([]);
      expect(result.pending.map((entry) => entry.id)).toEqual([1, 2]);
    });
  });
});
