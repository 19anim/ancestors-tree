import { EMPTY_VIEW_PREFERENCE } from '@ancestors-tree/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { apiErrorReply, mockApi } from '../../test/api';
import { CLAN_ID } from './fixtures';
import { SAVE_DELAY_MS, usePersonalDecor, viewPreferenceKey } from './useViewPreference';

const PATH = `/clans/${CLAN_ID}/view-preference`;

function providers() {
  const client = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <AppProviders queryClient={client}>{children}</AppProviders>
  );
}

const puts = (api: ReturnType<typeof mockApi>) => api.calls.filter((call) => call.method === 'PUT');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePersonalDecor', () => {
  it('loads my choices, shows picks at once, and saves quick picks with one PUT', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => ({ body }),
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 30 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).toEqual(EMPTY_VIEW_PREFERENCE));

    act(() => {
      result.current.change((current) => ({
        ...current,
        enabled: true,
        theme: { surface: 'fridge' },
      }));
    });
    act(() => {
      result.current.change((current) => ({
        ...current,
        theme: { ...current.theme, thread: 'yarn' },
      }));
    });
    // TanStack Query tells its observers on the next tick.
    await waitFor(() =>
      expect(result.current.preference?.theme).toEqual({ surface: 'fridge', thread: 'yarn' }),
    );

    await waitFor(() => expect(puts(api)).toHaveLength(1));
    expect(puts(api)[0]?.body).toEqual({
      enabled: true,
      theme: { surface: 'fridge', thread: 'yarn' },
      cards: {},
    });
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
  });

  it(`saves ${SAVE_DELAY_MS} ms after the last pick, not before`, async () => {
    expect(SAVE_DELAY_MS).toBe(500);
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => ({ body }),
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID), { wrapper: providers() });
    await waitFor(() => expect(result.current.preference).not.toBeNull());
    vi.useFakeTimers();

    act(() => {
      result.current.change((current) => ({
        ...current,
        enabled: true,
        theme: { thread: 'yarn' },
      }));
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    // On screen at once, long before it is saved.
    expect(result.current.preference?.theme).toEqual({ thread: 'yarn' });
    expect(puts(api)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(400));
    act(() => {
      result.current.change((current) => ({ ...current, theme: { thread: 'cotton' } }));
    });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(puts(api)).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0]?.body).toEqual({ enabled: true, theme: { thread: 'cotton' }, cards: {} });
    await act(() => vi.advanceTimersByTimeAsync(SAVE_DELAY_MS));
    expect(puts(api)).toHaveLength(1);
    expect(result.current.saveState).toBe('idle');
  });

  it('says a failed save, keeps the picks on screen, and saves them again on retry', async () => {
    let fail = true;
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => (fail ? apiErrorReply('INTERNAL_ERROR', 500) : { body }),
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 10 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).not.toBeNull());
    act(() => {
      result.current.change((current) => ({
        ...current,
        enabled: true,
        theme: { surface: 'corkboard' },
      }));
    });
    await waitFor(() => expect(result.current.saveState).toBe('failed'));
    expect(result.current.preference?.theme).toEqual({ surface: 'corkboard' });

    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(puts(api)).toHaveLength(2);
  });

  it('still sends a waiting pick when the page goes away', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) => ({ body }),
    });
    const { result, unmount } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 60_000 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).not.toBeNull());
    act(() => {
      result.current.change((current) => ({ ...current, enabled: true }));
    });
    unmount();
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });

  it('keeps a pick made while an earlier save is on its way, and saves it next', async () => {
    let answerFirst: () => void = () => {};
    const api = mockApi({
      [`GET ${PATH}`]: () => ({ body: EMPTY_VIEW_PREFERENCE }),
      [`PUT ${PATH}`]: ({ body }) =>
        puts(api).length === 1
          ? new Promise((resolve) => {
              answerFirst = () => resolve({ body });
            })
          : { body },
    });
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 10 }), {
      wrapper: providers(),
    });
    await waitFor(() => expect(result.current.preference).not.toBeNull());

    act(() => {
      result.current.change((current) => ({
        ...current,
        enabled: true,
        theme: { thread: 'yarn' },
      }));
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
    // The first save answers while the second pick still waits for its own.
    act(() => {
      result.current.change((current) => ({ ...current, theme: { thread: 'cotton' } }));
    });
    answerFirst();
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(result.current.preference?.theme).toEqual({ thread: 'cotton' });

    await waitFor(() => expect(puts(api)).toHaveLength(2));
    expect(puts(api)[1]?.body).toEqual({ enabled: true, theme: { thread: 'cotton' }, cards: {} });
    await waitFor(() => expect(result.current.saveState).toBe('idle'));
    expect(result.current.preference?.theme).toEqual({ thread: 'cotton' });
  });

  it('ignores a pick before my choices are loaded', async () => {
    const api = mockApi({ [`GET ${PATH}`]: () => new Promise(() => {}) });
    const client = createQueryClient();
    const { result } = renderHook(() => usePersonalDecor(CLAN_ID, { delay: 10 }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AppProviders queryClient={client}>{children}</AppProviders>
      ),
    });
    act(() => {
      result.current.change((current) => ({ ...current, enabled: true }));
    });
    expect(client.getQueryData(viewPreferenceKey(CLAN_ID))).toBeUndefined();
    // Past the delay and the observers' tick: still nothing shown, nothing sent.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.preference).toBeNull();
    expect(puts(api)).toHaveLength(0);
  });
});
