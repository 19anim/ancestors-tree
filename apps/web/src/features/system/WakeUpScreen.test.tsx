import { act, fireEvent, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/providers';
import {
  AWAKE_REFETCH_WAIT_MS,
  GIVE_UP_MS,
  POLL_INTERVAL_MS,
  startWaking,
  useWakeStore,
  wakeFailed,
} from '../../shared/lib/wake';
import { Dialog, DialogContent, TextField } from '../../shared/ui';
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
  vi.restoreAllMocks();
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

  it('leaves the screen after a while even when the refetch never settles', async () => {
    vi.useFakeTimers();
    health(() => true);
    const { invalidate } = renderScreen();
    // apiClient has no request timeout: a refetch can hang for good.
    invalidate.mockReturnValue(new Promise<void>(() => {}));

    act(() => startWaking());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(AWAKE_REFETCH_WAIT_MS - 1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useWakeStore.getState()).toEqual({ phase: 'awake', recoveries: 1 });
  });

  it('keeps a dialog open underneath, with what was typed in it', async () => {
    health(() => false);
    // The screen's own button must stay clickable while a Radix modal sets pointer-events: none
    // on <body>; jsdom has no Tailwind to apply pointer-events-auto.
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    const onOpenChange = vi.fn();
    renderWithProviders(
      <>
        <Dialog defaultOpen onOpenChange={onOpenChange}>
          <DialogContent title="Thêm người">
            <TextField label="Họ và tên" />
          </DialogContent>
        </Dialog>
        <WakeUpScreen />
      </>,
    );
    await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn An');

    act(() => startWaking());
    fireEvent.keyDown(screen.getByRole('heading', { level: 1, name: TITLE }), { key: 'Escape' });
    act(() => wakeFailed());
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(useWakeStore.getState().phase).toBe('waking');

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Thêm người', hidden: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn An');
  });
});
