import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, ME } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function openFromToolbar(user: ReturnType<typeof userEvent.setup>) {
  const toolbar = await screen.findByRole('group', { name: 'Công cụ của cây' });
  await user.click(within(toolbar).getByRole('button', { name: 'Thêm nhiều người' }));
  return screen.getByRole('dialog', { name: 'Thêm nhiều người' });
}

function row(dialog: HTMLElement, n: number): HTMLElement {
  return within(dialog).getByRole('group', { name: `Người thứ ${n}` });
}

describe('Add several people', () => {
  it('adds the filled rows in one batch, as Loose photos, undone in one step', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openFromToolbar(user);
    expect(within(dialog).queryByRole('group', { name: 'Người thứ 2' })).not.toBeInTheDocument();

    await user.type(within(row(dialog, 1)).getByLabelText('Họ và tên'), 'Nguyễn Thị Mai');
    await user.selectOptions(within(row(dialog, 1)).getByLabelText('Giới tính'), 'Nữ');
    // Filling the last row adds an empty one.
    await user.type(within(row(dialog, 2)).getByLabelText('Họ và tên'), 'Nguyễn Văn Hùng');
    await user.click(within(row(dialog, 2)).getByRole('checkbox', { name: 'Đã mất' }));
    expect(row(dialog, 3)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      {
        type: 'addPerson',
        payload: expect.objectContaining({
          fullName: 'Nguyễn Thị Mai',
          gender: 'female',
          death: { isDeceased: false },
        }),
      },
      {
        type: 'addPerson',
        payload: expect.objectContaining({
          fullName: 'Nguyễn Văn Hùng',
          gender: 'male',
          death: { isDeceased: true },
        }),
      },
    ]);
    const tray = screen.getByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByRole('button', { name: 'Nguyễn Thị Mai' })).toBeInTheDocument();
    // Focus is back on the toolbar button that opened the form.
    const toolbar = screen.getByRole('group', { name: 'Công cụ của cây' });
    await waitFor(() =>
      expect(within(toolbar).getByRole('button', { name: 'Thêm nhiều người' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(within(tray).queryByRole('button', { name: 'Nguyễn Thị Mai' })).not.toBeInTheDocument();
    expect(within(tray).queryByRole('button', { name: 'Nguyễn Văn Hùng' })).not.toBeInTheDocument();
  });

  it('asks for at least one name, and opens from the tray too', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    await user.click(within(tray).getByRole('button', { name: 'Thêm nhiều người' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm nhiều người' });
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nhập ít nhất một họ tên.');
    expect(within(row(dialog, 1)).getByLabelText('Họ và tên')).toHaveFocus();
    expect(sent()).toEqual([]);
  });

  it('is not offered to viewers', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    expect(screen.queryByRole('button', { name: 'Thêm nhiều người' })).not.toBeInTheDocument();
  });
});
