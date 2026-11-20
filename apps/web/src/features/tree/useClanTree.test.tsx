import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverAwake } from '../../shared/lib/wake';
import { mockApi } from '../../test/api';
import { CLAN_ID, FAMILY, ME } from './fixtures';
import { signOutTreeStore, useTreeStore } from './store';
import { useClanTree } from './useClanTree';

beforeEach(() => {
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useClanTree', () => {
  it('loads the tree again once the server has woken up', async () => {
    let up = false;
    mockApi({
      [`GET /clans/${CLAN_ID}/tree`]: () =>
        up ? { body: FAMILY } : { status: 502, body: 'Bad gateway' },
    });
    const { result } = renderHook(() => useClanTree(CLAN_ID));
    await waitFor(() => expect(result.current.state).toBe('error'));

    up = true;
    act(() => serverAwake());
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });
});
