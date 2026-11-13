import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/lib/apiError';
import { apiErrorReply, mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, EMPTY_TREE_RESPONSE, FAMILY, treeRoutes } from './fixtures';
import { resetTreeStore, useTreeStore } from './store';

const VIEWER = { ...CLAN, role: 'viewer' as const };

beforeEach(() => {
  mockReactFlow();
  resetTreeStore();
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('TreePage', () => {
  it('shows the board, the save status and the people not linked yet', async () => {
    mockApi(treeRoutes(FAMILY, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    expect(
      await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' }),
    ).toBeInTheDocument();
    // The footer's server status is also a status region, so find ours by its text.
    expect(screen.getByText('Đã lưu')).toHaveAttribute('role', 'status');
    const tray = screen.getByRole('region', { name: 'Chưa nối vào cây' });
    expect(within(tray).getByText('Trần Văn Bình')).toBeInTheDocument();
    // Viewers get no editing controls.
    expect(screen.queryByRole('button', { name: /Thao tác với/ })).not.toBeInTheDocument();
  });

  it('says when the family tree is empty', async () => {
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    expect(await screen.findByText('Chưa có ai trong cây gia phả này.')).toBeInTheDocument();
  });

  it('shows a load error with a way to try again', async () => {
    const user = userEvent.setup();
    let calls = 0;
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, VIEWER),
      [`GET /clans/${CLAN_ID}/tree`]: () => {
        calls += 1;
        return calls === 1 ? apiErrorReply('INTERNAL_ERROR', 500) : { body: EMPTY_TREE_RESPONSE };
      },
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra.');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có ai trong cây gia phả này.')).toBeInTheDocument();
  });

  it('keeps a discarded-changes notice when the load fails', async () => {
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, VIEWER),
      [`GET /clans/${CLAN_ID}/tree`]: () => apiErrorReply('INTERNAL_ERROR', 500),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: 'Thử lại' });
    act(() => useTreeStore.setState({ notice: { kind: 'discarded', count: 2 } }));
    expect(screen.getByText('2 thay đổi chưa lưu đã bị bỏ.')).toBeInTheDocument();
  });

  it('lets a signed-out editor sign in again and come back to this page', async () => {
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');
    act(() => useTreeStore.setState({ notice: { kind: 'signedOut' } }));
    const link = screen.getByRole('link', { name: 'Đăng nhập lại' });
    expect(new URLSearchParams(link.getAttribute('href')?.split('?')[1]).get('returnTo')).toBe(
      `/clans/${CLAN_ID}/tree`,
    );
  });

  it('explains every notice and lets the user dismiss it', async () => {
    const user = userEvent.setup();
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');

    act(() => useTreeStore.setState({ notice: { kind: 'reloaded' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Đã tải lại bản mới nhất');
    act(() =>
      useTreeStore.setState({
        notice: {
          kind: 'rejected',
          error: new ApiError('RULE_VIOLATION', 'No', 422, undefined, 'CYCLE'),
        },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Thay đổi này sẽ khiến một người thành tổ tiên của chính mình.',
    );
    act(() => useTreeStore.setState({ notice: { kind: 'signedOut' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn.');
    act(() => useTreeStore.setState({ notice: { kind: 'discarded', count: 3 } }));
    expect(screen.getByRole('alert')).toHaveTextContent('3 thay đổi chưa lưu đã bị bỏ.');
    await user.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
