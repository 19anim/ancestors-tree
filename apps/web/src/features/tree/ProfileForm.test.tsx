import type { TreeResponse } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { routes } from '../../app/routes';
import { renderRoute, renderWithProviders } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, ME, SON, treeRoutes } from './fixtures';
import { discardProfileDraft, useProfileDraft } from './profileDraft';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

const OPS = `POST /clans/${CLAN_ID}/ops`;
const DRAFT_TITLE = 'Bỏ các thay đổi trong hồ sơ?';

/** Mocks the tree and accepts every op; returns the ops the page sent (as TreeEditing.test). */
function editableTree(tree: TreeResponse, clan = CLAN) {
  let seq = tree.version;
  const api = mockApi({
    ...treeRoutes(tree, clan),
    [OPS]: () => {
      seq += 1;
      return { body: { seq } };
    },
  });
  return () =>
    api.calls.filter((call) => call.method === 'POST').map((call) => (call.body as { op: Op }).op);
}

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  discardProfileDraft();
  vi.unstubAllGlobals();
});

async function editSon(user: ReturnType<typeof userEvent.setup>) {
  renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
  const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
  await user.click(within(panel).getByRole('button', { name: 'Sửa' }));
  return panel;
}

async function renameSon(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  const name = within(panel).getByLabelText('Họ và tên');
  await user.clear(name);
  await user.type(name, 'Nguyễn Văn Năm');
}

describe('editing a profile', () => {
  it('saves one updatePerson with only the changed fields', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await user.click(within(panel).getByRole('radio', { name: 'Đã mất' }));
    const death = within(panel).getByRole('group', { name: 'Ngày mất' });
    await user.type(within(death).getByLabelText('Ngày'), '15');
    await user.type(within(death).getByLabelText('Tháng'), '10');
    await user.type(within(death).getByLabelText('Năm'), '1990');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument(),
    );
    // Back in read mode, focus is on the Edit button that opened the form.
    expect(within(panel).getByRole('button', { name: 'Sửa' })).toHaveFocus();
    await waitFor(() => expect(sent()).toHaveLength(1));
    const op = sent()[0] as Extract<Op, { type: 'updatePerson' }>;
    expect(op.type).toBe('updatePerson');
    expect(op.payload.id).toBe(SON);
    expect(Object.keys(op.payload.changes)).toEqual(['death']);
    expect(op.payload.changes.death).toMatchObject({
      isDeceased: true,
      date: { source: 'lunar', lunar: { day: 15, month: 10, year: 1990, isLeap: false } },
    });
  });

  it('closes without sending anything when nothing changed', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    // The Edit button is gone with read mode: focus moves to the first field.
    expect(within(panel).getByLabelText('Họ và tên')).toHaveFocus();
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Sửa' })).toBeInTheDocument(),
    );
    expect(sent()).toHaveLength(0);
  });

  it('asks before closing with unsaved changes, and keeps them on "stay"', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    await user.click(within(panel).getByRole('button', { name: 'Đóng hồ sơ' }));
    const ask = await screen.findByRole('dialog', { name: DRAFT_TITLE });
    await user.click(within(ask).getByRole('button', { name: 'Ở lại sửa tiếp' }));
    expect(within(panel).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Năm');
    await user.click(within(panel).getByRole('button', { name: 'Đóng hồ sơ' }));
    const again = await screen.findByRole('dialog', { name: DRAFT_TITLE });
    await user.click(within(again).getByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a date error at the field and does not save', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    const birth = within(panel).getByRole('group', { name: 'Ngày sinh' });
    await user.type(within(birth).getByLabelText('Năm'), '1950');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    expect(
      await within(birth).findByText('Chỉ biết năm? Hãy chọn “Chỉ biết năm”.'),
    ).toBeInTheDocument();
    expect(sent()).toHaveLength(0);
  });

  it('waits until focus leaves the whole date before saying it is not finished', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    const birth = within(panel).getByRole('group', { name: 'Ngày sinh' });
    await user.type(within(birth).getByLabelText('Ngày'), '1');
    await user.tab();
    expect(within(birth).getByLabelText('Tháng')).toHaveFocus();
    expect(within(birth).queryByText('Nhập đủ ngày, tháng và năm.')).not.toBeInTheDocument();
    await user.click(within(panel).getByLabelText('Họ và tên'));
    expect(await within(birth).findByText('Nhập đủ ngày, tháng và năm.')).toBeInTheDocument();
  });

  it('says the unsaved changes went when the person leaves the tree', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    act(() => {
      useTreeStore.setState((state) => {
        const { [SON]: _gone, ...persons } = state.tree.persons;
        return { tree: { ...state.tree, persons } };
      });
    });
    expect(
      await screen.findByText(
        'Nguyễn Văn Nam không còn trong cây nên hồ sơ đã đóng. Các thay đổi chưa lưu đã bị bỏ.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: DRAFT_TITLE })).not.toBeInTheDocument();
    expect(useProfileDraft.getState().dirty).toBe(false);
  });

  it('says the unsaved changes went when the tree reloads, and asks nothing after', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    // A reload shows the skeleton, so the panel and its form unmount meanwhile.
    act(() => useTreeStore.setState({ status: 'loading' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(useProfileDraft.getState().dirty).toBe(false);
    act(() => useTreeStore.setState({ status: 'ready' }));
    expect(
      await screen.findByText(
        'Cây vừa được tải lại nên các thay đổi chưa lưu trong hồ sơ đã bị bỏ.',
      ),
    ).toBeInTheDocument();
    const reopened = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(within(reopened).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    await user.click(within(reopened).getByRole('button', { name: 'Đóng hồ sơ' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: DRAFT_TITLE })).not.toBeInTheDocument();
  });

  it('cancels without asking, and does not count the cancelled changes as lost', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    await user.click(within(panel).getByRole('button', { name: 'Huỷ' }));
    expect(within(panel).getByRole('button', { name: 'Sửa' })).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: DRAFT_TITLE })).not.toBeInTheDocument();
    expect(useProfileDraft.getState().dirty).toBe(false);
    act(() => useTreeStore.setState({ status: 'loading' }));
    act(() => useTreeStore.setState({ status: 'ready' }));
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(
      screen.queryByText('Cây vừa được tải lại nên các thay đổi chưa lưu trong hồ sơ đã bị bỏ.'),
    ).not.toBeInTheDocument();
    expect(sent()).toHaveLength(0);
  });

  it('says nothing about a reload when the form had no changes', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    await editSon(user);
    act(() => useTreeStore.setState({ status: 'loading' }));
    act(() => useTreeStore.setState({ status: 'ready' }));
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(
      screen.queryByText('Cây vừa được tải lại nên các thay đổi chưa lưu trong hồ sơ đã bị bỏ.'),
    ).not.toBeInTheDocument();
  });

  it('neither checks nor saves the death fields hidden by "living"', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await user.click(within(panel).getByRole('radio', { name: 'Đã mất' }));
    const death = within(panel).getByRole('group', { name: 'Ngày mất' });
    await user.type(within(death).getByLabelText('Ngày'), '15');
    await user.type(within(panel).getByLabelText('Nơi an táng'), 'Nghĩa trang làng');
    await user.click(within(panel).getByRole('radio', { name: 'Còn sống' }));
    await renameSon(user, panel);
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    const op = sent()[0] as Extract<Op, { type: 'updatePerson' }>;
    expect(op.payload.changes).toEqual({ fullName: 'Nguyễn Văn Năm' });
  });

  it('moves focus to a date that is wrong on save', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    const birth = within(panel).getByRole('group', { name: 'Ngày sinh' });
    await user.type(within(birth).getByLabelText('Năm'), '1950');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(within(birth).getByLabelText('Ngày')).toHaveFocus());
  });
});

describe('unsaved profile changes and the rest of the app', () => {
  const OTHER_ID = '64b7f0c2a1b2c3d4e5f60002';
  const OTHER_CLAN = { ...CLAN, id: OTHER_ID, name: 'Họ Trần' };

  function beforeUnloadPrevented(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('asks the browser before the tab unloads while only the profile is dirty', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    expect(beforeUnloadPrevented()).toBe(false);
    await renameSon(user, panel);
    expect(useTreeStore.getState().pending).toHaveLength(0);
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it('asks before another person opens from a card', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    await user.click(screen.getByRole('button', { name: /^Lê Thị Hoa,/ }));
    const ask = await screen.findByRole('dialog', { name: DRAFT_TITLE });
    await user.click(within(ask).getByRole('button', { name: 'Ở lại sửa tiếp' }));
    expect(within(panel).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Năm');
    await user.click(screen.getByRole('button', { name: /^Lê Thị Hoa,/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: DRAFT_TITLE })).getByRole('button', {
        name: 'Bỏ thay đổi',
      }),
    );
    expect(await screen.findByRole('complementary', { name: 'Lê Thị Hoa' })).toBeInTheDocument();
  });

  it('says the profile changes go too when another tree opens with unsent changes', async () => {
    mockApi({
      ...treeRoutes(FAMILY),
      // Never answers: the saved change stays unsent.
      [OPS]: () => new Promise(() => undefined),
      [`GET /clans/${OTHER_ID}`]: () => ({ body: OTHER_CLAN }),
      [`GET /clans/${OTHER_ID}/tree`]: () => ({ body: FAMILY }),
    });
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, {
      initialEntries: [`/clans/${CLAN_ID}/tree?person=${SON}`],
    });
    renderWithProviders(<RouterProvider router={router} />);
    const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    await user.click(within(panel).getByRole('button', { name: 'Sửa' }));
    await user.type(within(panel).getByLabelText('Chi, nhánh'), 'Chi hai');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(useTreeStore.getState().pending).toHaveLength(1));
    await user.click(within(panel).getByRole('button', { name: 'Sửa' }));
    await renameSon(user, panel);
    await act(() => router.navigate(`/clans/${OTHER_ID}/tree`));
    const ask = await screen.findByRole('dialog', { name: 'Mở cây gia phả khác?' });
    expect(ask).toHaveTextContent(
      'Còn 1 thay đổi chưa lưu ở cây gia phả bạn vừa sửa. Mở cây khác thì các thay đổi này sẽ bị bỏ. Các thay đổi chưa lưu trong hồ sơ cũng sẽ mất.',
    );
    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(within(panel).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Năm');
  });

  it('asks before signing out with only profile changes, and keeps them on "stay"', async () => {
    const api = mockApi({
      ...treeRoutes(FAMILY),
      'POST /auth/logout': () => ({ status: 204 }),
    });
    const user = userEvent.setup();
    const panel = await editSon(user);
    await renameSon(user, panel);
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    const ask = await screen.findByRole('dialog', { name: 'Đăng xuất?' });
    expect(ask).toHaveTextContent(
      'Bạn đã sửa hồ sơ nhưng chưa lưu. Đăng xuất thì những thay đổi này sẽ mất.',
    );
    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(within(panel).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Năm');
    expect(api.calls.some((call) => call.path === '/auth/logout')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Đăng xuất?' })).getByRole('button', {
        name: 'Vẫn đăng xuất',
      }),
    );
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(useProfileDraft.getState().dirty).toBe(false);
  });
});
