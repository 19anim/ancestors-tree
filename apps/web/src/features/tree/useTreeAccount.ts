import { useLayoutEffect } from 'react';
import { useTreeStore } from './store';

/**
 * Tells the tree store which account is signed in. `updatedAt` is the current-user query's
 * `dataUpdatedAt`: it changes whenever a sign-in sets the user again, also with the same account,
 * so a queue stopped by a lost session (or by another account's cookie) resumes then.
 *
 * A layout effect runs before every passive effect of the same commit, so the queue of another
 * account is gone before a page (such as the tree page loading its tree) can send it.
 */
export function useTreeAccount(userId: string | undefined, updatedAt: number): void {
  useLayoutEffect(() => {
    if (userId !== undefined) useTreeStore.getState().setAccount(userId);
  }, [userId, updatedAt]);
}
