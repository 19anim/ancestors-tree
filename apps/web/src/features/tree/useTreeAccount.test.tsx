import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ME } from './fixtures';
import { signOutTreeStore, useTreeStore } from './store';
import { useTreeAccount } from './useTreeAccount';

afterEach(() => {
  signOutTreeStore();
});

describe('useTreeAccount', () => {
  it('tells the store who is signed in, and again when the user is set again', () => {
    signOutTreeStore();
    const { rerender } = renderHook(
      ({ id, at }: { id: string | undefined; at: number }) => useTreeAccount(id, at),
      { initialProps: { id: undefined as string | undefined, at: 0 } },
    );
    expect(useTreeStore.getState().userId).toBeNull();
    rerender({ id: ME.id, at: 1 });
    expect(useTreeStore.getState().userId).toBe(ME.id);
    useTreeStore.setState({ signedOut: true });
    // The same account signed in again: the query was set again, with a new timestamp.
    rerender({ id: ME.id, at: 2 });
    expect(useTreeStore.getState().signedOut).toBe(false);
  });
});
