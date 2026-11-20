import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverAwake } from '../../shared/lib/wake';
import { apiErrorReply, mockApi } from '../../test/api';
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

  it('leaves a refused load alone after a recovery (403, 404)', async () => {
    for (const reply of [apiErrorReply('FORBIDDEN', 403), apiErrorReply('NOT_FOUND', 404)]) {
      signOutTreeStore();
      useTreeStore.getState().setAccount(ME.id);
      const api = mockApi({ [`GET /clans/${CLAN_ID}/tree`]: () => reply });
      const { result, unmount } = renderHook(() => useClanTree(CLAN_ID));
      await waitFor(() => expect(result.current.state).toBe('error'));
      const loads = treeLoads(api);

      act(() => serverAwake());
      await settle();
      expect(treeLoads(api), String(reply.status)).toBe(loads);
      expect(result.current.state).toBe('error');
      unmount();
    }
  });

  it('leaves a loaded tree alone after a recovery', async () => {
    const api = mockApi({ [`GET /clans/${CLAN_ID}/tree`]: () => ({ body: FAMILY }) });
    const { result } = renderHook(() => useClanTree(CLAN_ID));
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => serverAwake());
    await settle();
    expect(treeLoads(api)).toBe(1);
    expect(result.current.state).toBe('ready');
  });

  it('leaves a load still on its way alone after a recovery', async () => {
    let answer: (reply: { body: unknown }) => void = () => {};
    const api = mockApi({
      [`GET /clans/${CLAN_ID}/tree`]: () => new Promise((resolve) => (answer = resolve)),
    });
    const { result } = renderHook(() => useClanTree(CLAN_ID));
    await waitFor(() => expect(treeLoads(api)).toBe(1));

    act(() => serverAwake());
    await settle();
    expect(treeLoads(api)).toBe(1);
    expect(result.current.state).toBe('loading');

    answer({ body: FAMILY });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(treeLoads(api)).toBe(1);
  });

  it('does not load again on mount for a recovery that came before', async () => {
    act(() => serverAwake());
    const api = mockApi({
      [`GET /clans/${CLAN_ID}/tree`]: () => ({ status: 502, body: 'Bad gateway' }),
    });
    const { result } = renderHook(() => useClanTree(CLAN_ID));
    await waitFor(() => expect(result.current.state).toBe('error'));
    await settle();
    expect(treeLoads(api)).toBe(1);
  });
});

function treeLoads(api: ReturnType<typeof mockApi>): number {
  return api.calls.filter((call) => call.path === `/clans/${CLAN_ID}/tree`).length;
}

/** Long enough for an effect's load to reach fetch; shorter than the store's 1 s retry. */
async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}
