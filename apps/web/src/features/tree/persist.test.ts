import { describe, expect, it, vi } from 'vitest';
import { CLAN_ID, ME, SON } from './fixtures';
import {
  clearSavedQueue,
  readSavedQueue,
  SAVED_QUEUE_KEY,
  writeSavedQueue,
  type SavedQueue,
} from './persist';

const QUEUE: SavedQueue = {
  format: 1,
  userId: ME.id,
  clanId: CLAN_ID,
  version: 3,
  entries: [
    { id: 1, op: { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Con trưởng' } } } },
    {
      id: 2,
      op: { type: 'updatePerson', payload: { id: SON, changes: { bio: null } } },
      reverts: { pendingId: 1 },
    },
  ],
};

describe('the saved queue', () => {
  it('reads back what was written, and nothing after clearing', () => {
    expect(readSavedQueue()).toEqual({ kind: 'none' });
    writeSavedQueue(QUEUE);
    expect(readSavedQueue()).toEqual({ kind: 'saved', queue: QUEUE });
    clearSavedQueue();
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('is unreadable when broken or of another format', () => {
    sessionStorage.setItem(SAVED_QUEUE_KEY, '{broken');
    expect(readSavedQueue()).toEqual({ kind: 'unreadable' });
    sessionStorage.setItem(SAVED_QUEUE_KEY, JSON.stringify({ ...QUEUE, format: 2 }));
    expect(readSavedQueue()).toEqual({ kind: 'unreadable' });
    sessionStorage.setItem(
      SAVED_QUEUE_KEY,
      JSON.stringify({ ...QUEUE, entries: [{ id: 1, op: { type: 'nope' } }] }),
    );
    expect(readSavedQueue()).toEqual({ kind: 'unreadable' });
  });

  it('removes the old snapshot when a write fails, so none is left stale', () => {
    writeSavedQueue(QUEUE);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      writeSavedQueue({ ...QUEUE, version: 4 });
    } finally {
      setItem.mockRestore();
    }
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });
});
