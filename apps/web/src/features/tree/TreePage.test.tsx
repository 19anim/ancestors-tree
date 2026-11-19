import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/lib/apiError';
import { apiErrorReply, mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, EMPTY_TREE_RESPONSE, FAMILY, ME, treeRoutes } from './fixtures';
import { useProfileDraft } from './profileDraft';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, editableTree } from './testKit';

const VIEWER = { ...CLAN, role: 'viewer' as const };

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
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
    const tray = screen.getByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByText('Trần Văn Bình')).toBeInTheDocument();
    // The photo is drawn under the tray's buttons: no text in them that their names lack
    // (WCAG 2.5.3, axe's label-content-name-mismatch).
    const loose = within(tray).getByRole('button', { name: /^Trần Văn Bình/ });
    expect(loose.textContent).toBe('');
    // Viewers get no editing controls: the toolbar has no undo.
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
  });

  it('draws my own theme once it loads', async () => {
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET /clans/${CLAN_ID}/view-preference`]: () => ({
        body: { enabled: true, theme: { surface: 'corkboard' }, cards: {} },
      }),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await waitFor(() => expect(board).toHaveAttribute('data-surface', 'corkboard'));
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
    act(() =>
      useTreeStore.setState({
        notice: { clanId: CLAN_ID, kind: 'discarded', count: 2, inFlight: false },
      }),
    );
    expect(screen.getByText('2 thay đổi chưa lưu đã bị bỏ.')).toBeInTheDocument();
  });

  it('lets a signed-out editor sign in again and come back to this page', async () => {
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');
    act(() => useTreeStore.setState({ notice: { clanId: CLAN_ID, kind: 'signedOut' } }));
    const link = screen.getByRole('link', { name: 'Đăng nhập lại' });
    expect(new URLSearchParams(link.getAttribute('href')?.split('?')[1]).get('returnTo')).toBe(
      `/clans/${CLAN_ID}/tree`,
    );
  });

  it('shows a notice on other pages too, because the changes may have been lost there', async () => {
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET /clans/${CLAN_ID}/members`]: () => ({ body: [] }),
    });
    useTreeStore.setState({ notice: { kind: 'reloaded', clanId: CLAN_ID } });
    renderRoute(`/clans/${CLAN_ID}/members`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Đã tải lại bản mới nhất');
  });

  it('shows the unreadable saved queue notice plainly, without naming a tree', async () => {
    mockApi();
    useTreeStore.setState({ notice: { kind: 'savedUnreadable', clanId: null } });
    renderRoute('/login');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không đọc được các thay đổi chưa lưu');
    expect(alert).not.toHaveTextContent('Về cây gia phả bạn vừa sửa');
  });

  it('names the family tree a notice is about when another page is on screen', async () => {
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET /clans/${CLAN_ID}/members`]: () => ({ body: [] }),
    });
    useTreeStore.setState({ notice: { kind: 'reloaded', clanId: '64b7f0c2a1b2c3d4e5f60002' } });
    renderRoute(`/clans/${CLAN_ID}/members`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Về cây gia phả bạn vừa sửa: Đã tải lại bản mới nhất',
    );
  });

  it('does not offer to sign in again on the sign-in page itself', async () => {
    mockApi();
    useTreeStore.setState({ notice: { kind: 'signedOut', clanId: CLAN_ID } });
    renderRoute('/login');
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(screen.queryByRole('link', { name: 'Đăng nhập lại' })).not.toBeInTheDocument();
  });

  it('shows a notice once on the tree page', async () => {
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');
    act(() => useTreeStore.setState({ notice: { kind: 'reloaded', clanId: CLAN_ID } }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('loads the tree again when the store is reset while the page stays open', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, VIEWER),
      [`GET /clans/${CLAN_ID}/tree`]: () => {
        loads += 1;
        return { body: EMPTY_TREE_RESPONSE };
      },
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');
    expect(loads).toBe(1);

    act(() => resetTreeStore());
    expect(await screen.findByText('Chưa có ai trong cây gia phả này.')).toBeInTheDocument();
    expect(loads).toBe(2);
    expect(useTreeStore.getState()).toMatchObject({ clanId: CLAN_ID, status: 'ready' });
  });

  it('explains every notice and lets the user dismiss it', async () => {
    const user = userEvent.setup();
    mockApi(treeRoutes(EMPTY_TREE_RESPONSE, VIEWER));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Chưa có ai trong cây gia phả này.');

    act(() => useTreeStore.setState({ notice: { clanId: CLAN_ID, kind: 'reloaded' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Đã tải lại bản mới nhất');
    act(() =>
      useTreeStore.setState({
        notice: {
          clanId: CLAN_ID,
          kind: 'rejected',
          dropped: 0,
          error: new ApiError('RULE_VIOLATION', 'No', 422, undefined, 'CYCLE'),
        },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Thay đổi này sẽ khiến một người thành tổ tiên của chính mình.',
    );
    act(() => useTreeStore.setState({ notice: { clanId: CLAN_ID, kind: 'signedOut' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn.');
    act(() =>
      useTreeStore.setState({
        notice: { clanId: CLAN_ID, kind: 'discarded', count: 3, inFlight: false },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('3 thay đổi chưa lưu đã bị bỏ.');
    await user.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Decorate on the tree page', () => {
  const PREFERENCE = `/clans/${CLAN_ID}/view-preference`;

  it('opens the panel; a whole-family pick is one undoable change', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    const panel = screen.getByRole('complementary', { name: 'Trang trí cây' });
    expect(within(panel).getByRole('radio', { name: 'Cả họ' })).toBeChecked();

    await user.click(within(panel).getByRole('radio', { name: 'Bảng gỗ bần' }));
    expect(board).toHaveAttribute('data-surface', 'corkboard');
    expect(await screen.findByText('Đã đổi: chủ đề cây')).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setTreeTheme', payload: { changes: { surface: 'corkboard', fastener: 'pushpin' } } },
    ]);

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi này' }));
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
  });

  it("re-picking the family's choice sends nothing and shows no error", async () => {
    const sent = editableTree({ ...FAMILY, theme: { surface: 'corkboard', fastener: 'pushpin' } });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    const corkboard = screen.getByRole('radio', { name: 'Bảng gỗ bần' });
    expect(corkboard).toBeChecked();
    // As a radio whose checked state went stale would send it: React reports a change.
    (corkboard as HTMLInputElement).checked = false;
    await user.click(corkboard);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Quan hệ này đã có rồi/)).not.toBeInTheDocument();
    expect(sent()).toHaveLength(0);
  });

  it('only me: the board changes at once and one PUT saves it, with no op', async () => {
    const api = mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    await user.click(screen.getByRole('radio', { name: 'Chỉ mình tôi' }));
    await user.click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(board).toHaveAttribute('data-surface', 'fridge');
    await waitFor(
      () =>
        expect(
          api.calls.filter((call) => call.method === 'PUT' && call.path === PREFERENCE),
        ).toHaveLength(1),
      { timeout: 2000 },
    );
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('closes the panel when a profile opens, and gives focus back on close', async () => {
    mockApi(treeRoutes(FAMILY, VIEWER));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    const open = screen.getByRole('button', { name: 'Trang trí' });
    await user.click(open);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }));
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
  });

  it('does not open over unsaved profile changes', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    act(() => useProfileDraft.setState({ dirty: true }));
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    expect(screen.queryByRole('complementary', { name: 'Trang trí cây' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Hãy lưu hoặc huỷ thay đổi trong hồ sơ trước khi trang trí.'),
    ).toBeInTheDocument();
    act(() => useProfileDraft.setState({ dirty: false }));
  });
});

describe('my own theme on the tree page', () => {
  const PREFERENCE = `/clans/${CLAN_ID}/view-preference`;
  const MINE = { enabled: true, theme: { surface: 'corkboard' }, cards: {} };

  it('says I see my own theme, and goes back to the shared one', async () => {
    const api = mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    expect(await screen.findByText('Bạn đang xem chủ đề của riêng mình.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dùng cho cả họ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Về chủ đề chung' }));
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(screen.queryByText('Bạn đang xem chủ đề của riêng mình.')).not.toBeInTheDocument();
    await waitFor(
      () => {
        const put = api.calls.find((call) => call.method === 'PUT' && call.path === PREFERENCE);
        expect(put?.body).toEqual({ ...MINE, enabled: false });
      },
      { timeout: 2000 },
    );
  });

  it('lets an editor use my theme for the whole family, as one change', async () => {
    const api = mockApi({
      ...treeRoutes(FAMILY),
      [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: FAMILY.version + 1 } }),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Bạn đang xem chủ đề của riêng mình.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng cho cả họ' }));
    expect(await screen.findByText('Đã đổi: chủ đề cây')).toBeInTheDocument();
    expect(useTreeStore.getState().tree.theme).toEqual({ surface: 'corkboard' });
    await waitFor(() => expect(api.calls.some((call) => call.method === 'POST')).toBe(true));
    const sent = api.calls.find((call) => call.method === 'POST');
    expect(batchOps(sent?.body)).toEqual([
      { type: 'setTreeTheme', payload: { changes: { surface: 'corkboard' } } },
    ]);
    // The family's theme now matches mine: nothing is left to share.
    expect(screen.queryByRole('button', { name: 'Dùng cho cả họ' })).not.toBeInTheDocument();
  });

  it('moves focus to Decorate when the banner goes away under it', async () => {
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Bạn đang xem chủ đề của riêng mình.');
    screen.getByRole('button', { name: 'Về chủ đề chung' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.queryByText('Bạn đang xem chủ đề của riêng mình.')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang trí' })).toHaveFocus());
  });

  it('moves focus to the main content when there is no Decorate button', async () => {
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, VIEWER),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Bạn đang xem chủ đề của riêng mình.');
    expect(screen.queryByRole('button', { name: 'Trang trí' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Về chủ đề chung' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('moves focus to "Back to the shared theme" once nothing is left to share', async () => {
    mockApi({
      ...treeRoutes(FAMILY),
      [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: FAMILY.version + 1 } }),
      [`GET ${PREFERENCE}`]: () => ({ body: MINE }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByText('Bạn đang xem chủ đề của riêng mình.');
    screen.getByRole('button', { name: 'Dùng cho cả họ' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Dùng cho cả họ' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Về chủ đề chung' })).toHaveFocus(),
    );
  });

  it('says when my choices were not saved, and saves them again', async () => {
    let fail = true;
    mockApi({
      ...treeRoutes(FAMILY, VIEWER),
      [`PUT ${PREFERENCE}`]: ({ body }) => (fail ? apiErrorReply('INTERNAL_ERROR', 500) : { body }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const board = await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: 'Trang trí' }));
    await user.click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(
      await screen.findByText('Chưa lưu được phần trang trí của bạn.', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(board).toHaveAttribute('data-surface', 'fridge');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    await waitFor(() =>
      expect(screen.queryByText('Chưa lưu được phần trang trí của bạn.')).not.toBeInTheDocument(),
    );
  });

  it("opens a viewer's card panel from the profile, and goes back to the profile", async () => {
    mockApi(treeRoutes(FAMILY, VIEWER));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('group', { name: 'Cây gia phả: Họ Nguyễn' });
    await user.click(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }));
    const profile = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    await user.click(within(profile).getByRole('button', { name: 'Trang trí thẻ này…' }));
    expect(
      screen.getByRole('complementary', { name: 'Trang trí thẻ của Nguyễn Văn Nam' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    const back = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(within(back).getByRole('heading', { name: 'Nguyễn Văn Nam' })).toHaveFocus();
  });
});
