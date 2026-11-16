import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { withSpare, type SeveralRow } from './AddSeveralDialog';
import { CLAN, CLAN_ID, FAMILY, ME } from './fixtures';
import { MAX_SEVERAL } from './ops';
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

  it('keeps typed names on Escape or a click outside; Cancel still closes', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openFromToolbar(user);
    await user.type(within(row(dialog, 1)).getByLabelText('Họ và tên'), 'Nguyễn Thị Mai');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Thêm nhiều người' })).toBe(dialog);
    expect(within(row(dialog, 1)).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Thị Mai');
    // Nor does a click outside it (the modal makes the page underneath inert to pointers).
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    expect(screen.getByRole('dialog', { name: 'Thêm nhiều người' })).toBe(dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const toolbar = screen.getByRole('group', { name: 'Công cụ của cây' });
    await waitFor(() =>
      expect(within(toolbar).getByRole('button', { name: 'Thêm nhiều người' })).toHaveFocus(),
    );
    expect(sent()).toEqual([]);
  });

  it('closes on Escape while every row is blank', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openFromToolbar(user);
    // A blank name (spaces only) is not a typed row.
    await user.type(within(row(dialog, 1)).getByLabelText('Họ và tên'), '  ');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ties the missing-name error to the first name, and clears it once a name is typed', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openFromToolbar(user);
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    const name = within(row(dialog, 1)).getByLabelText('Họ và tên');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Nhập ít nhất một họ tên.');

    await user.type(name, 'N');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Nhập ít nhất một họ tên.')).not.toBeInTheDocument();
  });

  it('is not offered to viewers', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    expect(screen.queryByRole('button', { name: 'Thêm nhiều người' })).not.toBeInTheDocument();
  });
});

describe('withSpare', () => {
  const filled = (count: number): SeveralRow[] =>
    Array.from({ length: count }, (_, at) => ({
      key: at + 1,
      fullName: `Người ${at + 1}`,
      gender: 'male',
      isDeceased: false,
    }));
  const nextKey = () => 0;

  it('adds a spare row after a filled last row, up to the cap', () => {
    expect(withSpare(filled(MAX_SEVERAL - 1), nextKey)).toHaveLength(MAX_SEVERAL);
    expect(withSpare(filled(MAX_SEVERAL), nextKey)).toHaveLength(MAX_SEVERAL);
  });

  it('adds none while the last row is blank', () => {
    const rows = [
      ...filled(1),
      { key: 2, fullName: ' ', gender: 'male' as const, isDeceased: false },
    ];
    expect(withSpare(rows, nextKey)).toBe(rows);
  });
});
