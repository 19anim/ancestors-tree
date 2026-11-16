import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { foldName } from './ChangeRelationshipDialog';
import { CLAN_ID, FAMILY, GRANDMA, LOOSE, ME, PARENTS_UNION } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function openDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: cardName(name) }));
  const profile = screen.getByRole('complementary', { name });
  await user.click(within(profile).getByRole('button', { name: 'Đổi quan hệ…' }));
  return screen.getByRole('dialog', { name: `Đổi quan hệ của ${name}` });
}

function group(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole('region', { name });
}

describe('Change relationship…', () => {
  it('searches without accents or case', () => {
    expect(foldName('Đặng Thị Bình')).toBe('dang thi binh');
    expect(foldName('Nguyễn Văn DŨNG')).toBe('nguyen van dung');
  });

  it('lists parents, removes one with Remove, and keeps focus in the dialog', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    const parents = group(dialog, 'Cha mẹ');
    expect(within(parents).getByText('Nguyễn Văn Tư')).toBeInTheDocument();
    expect(within(group(dialog, 'Vợ/chồng')).getByText('Chưa có ai.')).toBeInTheDocument();

    await user.click(within(parents).getByRole('button', { name: 'Gỡ cha/mẹ: Lê Thị Hoa' }));
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Lê Thị Hoa'),
    ).toBeInTheDocument();
    // Announced while the dialog is open: the modal hides the page from screen readers, but not
    // the toast's live region.
    expect(
      screen
        .getAllByRole('status')
        .some((status) =>
          status.textContent?.includes('Nguyễn Văn Nam không còn là con của Lê Thị Hoa'),
        ),
    ).toBe(true);
    expect(within(parents).queryByText('Lê Thị Hoa')).not.toBeInTheDocument();
    // The row's button is gone: focus goes to the dialog's content (the change's fallback), not
    // to its frame, where Radix's focus trap would put it.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await waitFor(() => expect(dialog).not.toHaveFocus());
    await waitFor(() => expect(sent()).toHaveLength(1));
  });

  it('adds a child found by a name typed without accents, from the tray', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.click(within(dialog).getByRole('radio', { name: 'Con của Nguyễn Văn Tư' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Tìm theo tên' }), 'binh');
    const option = within(dialog).getByRole('option', { name: /Trần Văn Bình/ });
    expect(option).toHaveTextContent('Ảnh chưa dán');
    await user.click(option);
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    expect(
      screen.getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setParents', payload: { personId: LOOSE, parentUnionId: PARENTS_UNION } },
    ]);
  });

  it('keeps a blocked choice in the list, with its reason', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    await user.click(within(dialog).getByRole('radio', { name: 'Cha/mẹ của Nguyễn Văn Nam' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Tìm theo tên' }), 'Tư');
    const option = within(dialog).getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('Quan hệ này đã có rồi.');
  });

  it('asks who keeps the children when a spouse is removed, and can change nothing', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    const spouses = group(dialog, 'Vợ/chồng');
    await user.click(within(spouses).getByRole('button', { name: 'Gỡ vợ/chồng: Lê Thị Hoa' }));
    const question = screen.getByRole('dialog', { name: 'Các con ở với ai?' });
    await user.click(within(question).getByRole('button', { name: 'Thôi, không đổi' }));
    expect(screen.queryByRole('dialog', { name: 'Các con ở với ai?' })).not.toBeInTheDocument();
    expect(sent()).toEqual([]);

    await user.click(within(spouses).getByRole('button', { name: 'Gỡ vợ/chồng: Lê Thị Hoa' }));
    await user.click(screen.getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Tư và Lê Thị Hoa không còn là vợ chồng'),
    ).toBeInTheDocument();
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.partnerIds).toEqual([GRANDMA]);
  });

  it('changes a marriage’s status, and returns focus to the card when closed', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Tình trạng hôn nhân với Lê Thị Hoa' }),
      'Goá',
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'updateUnion', payload: { id: PARENTS_UNION, changes: { status: 'widowed' } } },
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Xong' }));
    // Opened from the profile's button: focus goes back there, inside the open profile.
    await waitFor(() =>
      expect(
        within(screen.getByRole('complementary', { name: 'Nguyễn Văn Tư' })).getByRole('button', {
          name: 'Đổi quan hệ…',
        }),
      ).toHaveFocus(),
    );
    expect(card('Nguyễn Văn Tư')).toBeInTheDocument();
  });
});
