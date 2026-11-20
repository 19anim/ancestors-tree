import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/providers';
import { GIVE_UP_MS, POLL_INTERVAL_MS, startWaking, useWakeStore } from '../../shared/lib/wake';
import { renderWithProviders } from '../../test/render';
import { WakeUpScreen } from './WakeUpScreen';

const TITLE = 'Đang đánh thức máy chủ…';

function renderScreen() {
  const queryClient = createQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderWithProviders(
    <>
      <button type="button">Thêm người</button>
      <WakeUpScreen />
    </>,
    queryClient,
  );
  return { invalidate, before: screen.getByRole('button', { name: 'Thêm người' }) };
}

function health(up: () => boolean) {
  const fetchMock = vi.fn(async () =>
    up() ? new Response('{}', { status: 200 }) : new Response('Bad gateway', { status: 502 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WakeUpScreen', () => {
  it('stays out of the way while the server is awake', () => {
    renderScreen();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('covers the page, checks every 3 s, and goes away once the server answers', async () => {
    vi.useFakeTimers();
    let up = false;
    const fetchMock = health(() => up);
    const { invalidate, before } = renderScreen();
    before.focus();

    act(() => startWaking());
    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Đang chờ máy chủ trả lời…');
    // The app stays mounted underneath, inert.
    expect(before.closest('[inert]')).not.toBeNull();
    expect(dialog.closest('[inert]')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/health', expect.any(Object)]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    up = true;
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(useWakeStore.getState()).toEqual({ phase: 'awake', recoveries: 1 });
    expect(before.closest('[inert]')).toBeNull();
    expect(before).toHaveFocus();
  });

  it('says the server did not wake up after 2 minutes, and "Thử lại" starts again', async () => {
    vi.useFakeTimers();
    const fetchMock = health(() => false);
    renderScreen();
    act(() => startWaking());

    await act(() => vi.advanceTimersByTimeAsync(GIVE_UP_MS));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Máy chủ chưa thức dậy' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã chờ 2 phút mà máy chủ vẫn chưa trả lời. Hãy thử lại sau ít phút.',
    );
    const checks = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3));
    expect(fetchMock).toHaveBeenCalledTimes(checks);

    act(() => screen.getByRole('button', { name: 'Thử lại' }).click());
    expect(useWakeStore.getState().phase).toBe('waking');
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toHaveFocus();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(checks + 1);
  });
});
