import type { TreeResponse } from '@ancestors-tree/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import type * as changes from './changes';
import { planChange } from './changes';
import { foldName } from './ChangeRelationshipDialog';
import {
  CLAN_ID,
  FAMILY,
  fixturePerson,
  GRANDMA,
  GRANDPA,
  LOOSE,
  ME,
  PARENTS_UNION,
  SON,
} from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree } from './testKit';

// The real planChange, watched: the picker asks it only about the people it shows.
vi.mock('./changes', async (importOriginal) => {
  const actual = await importOriginal<typeof changes>();
  return { ...actual, planChange: vi.fn(actual.planChange) };
});

const UNDO = 'Hoàn tác thay đổi này';
const WIDOWED = 'Đã đổi: Hôn nhân của Nguyễn Văn Tư và Lê Thị Hoa: Goá';
const DIVORCED = 'Đã đổi: Hôn nhân của Nguyễn Văn Tư và Lê Thị Hoa: Đã ly hôn';

/** FAMILY with 30 more people named Nguyễn, none of them linked yet. */
const MANY_NGUYEN: TreeResponse = {
  ...FAMILY,
  persons: [
    ...FAMILY.persons,
    ...Array.from({ length: 30 }, (_, at) =>
      fixturePerson(
        `64b7f0c2a1b2c3d4e5f6c0${String(at).padStart(2, '0')}`,
        `Nguyễn Văn Khách ${at + 1}`,
      ),
    ),
  ],
};

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

function search(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('searchbox', { name: 'Tìm theo tên' });
}

/** Focus is on the dialog's content, not on its frame (where Radix's focus trap would put it). */
async function focusInContent(dialog: HTMLElement) {
  await waitFor(() => {
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog).not.toHaveFocus();
  });
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
      within(dialog).getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Lê Thị Hoa'),
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
    // The row's button is gone: focus goes to the dialog's content (the change's fallback).
    await focusInContent(dialog);
    await waitFor(() => expect(sent()).toHaveLength(1));
  });

  it('removes a child from this parent only', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Lê Thị Hoa');
    const children = group(dialog, 'Con');
    await user.click(within(children).getByRole('button', { name: 'Gỡ con: Nguyễn Văn Nam' }));
    expect(
      within(dialog).getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Lê Thị Hoa'),
    ).toBeInTheDocument();
    expect(within(children).getByText('Chưa có ai.')).toBeInTheDocument();
    const tree = useTreeStore.getState().tree;
    const unionId = tree.persons[SON]?.parentUnionId;
    expect(unionId === undefined ? undefined : tree.unions[unionId]?.partnerIds).toEqual([GRANDPA]);
  });

  it('adds a child found by a name typed without accents, from the tray', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.click(within(dialog).getByRole('radio', { name: 'Con của Nguyễn Văn Tư' }));
    await user.type(search(dialog), 'binh');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Tìm thấy 1 người.');
    const option = within(dialog).getByRole('option', { name: /Trần Văn Bình/ });
    expect(option).toHaveTextContent('Ảnh chưa dán');
    await user.click(option);
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    expect(
      within(dialog).getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    // Applied: the search starts over.
    expect(search(dialog)).toHaveValue('');
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
    await user.type(search(dialog), 'Tư');
    const option = within(dialog).getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('Quan hệ này đã có rồi.');
  });

  it('says when no one matches', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.type(search(dialog), 'zz');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Không có ai trùng tên này.');
  });

  it('shows the first 20 matches, says so, and checks only those', async () => {
    const user = userEvent.setup();
    editableTree(MANY_NGUYEN, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Lê Thị Hoa');
    await user.type(search(dialog), 'nguyen');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Tìm thấy 32 người. Chỉ hiện 20 người đầu tiên, gõ thêm để thu hẹp.',
    );
    const shown = within(within(dialog).getByRole('listbox', { name: 'Người tìm được' }))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(shown).toHaveLength(20);

    vi.mocked(planChange).mockClear();
    await user.click(within(dialog).getByRole('radio', { name: 'Cha/mẹ của Lê Thị Hoa' }));
    const asked = new Set(vi.mocked(planChange).mock.calls.map(([, change]) => change));
    expect(asked.size).toBeGreaterThan(0);
    const tree = useTreeStore.getState().tree;
    for (const change of asked) {
      expect(change.kind).toBe('relate');
      const name = change.kind === 'relate' ? tree.persons[change.personId]?.fullName : '';
      expect(shown.some((text) => name !== undefined && text?.startsWith(name))).toBe(true);
    }
  });

  it('forgets the pick when the relation changes, or when the pick becomes blocked', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    await user.type(search(dialog), 'binh');
    const binh = within(dialog).getByRole('option', { name: /Trần Văn Bình/ });
    await user.click(binh);
    expect(binh).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('radio', { name: 'Vợ/chồng của Nguyễn Văn Nam' }));
    expect(within(dialog).getByRole('option', { name: /Trần Văn Bình/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // Hoa stops being Nam's parent and is picked as one; Undo makes her his parent again.
    await user.click(
      within(group(dialog, 'Cha mẹ')).getByRole('button', { name: 'Gỡ cha/mẹ: Lê Thị Hoa' }),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Cha/mẹ của Nguyễn Văn Nam' }));
    await user.clear(search(dialog));
    await user.type(search(dialog), 'hoa');
    await user.click(within(dialog).getByRole('option', { name: /Lê Thị Hoa/ }));
    expect(within(dialog).getByRole('option', { name: /Lê Thị Hoa/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: UNDO }));
    const hoa = within(dialog).getByRole('option', { name: /Lê Thị Hoa/ });
    expect(hoa).toHaveAttribute('aria-disabled', 'true');
    expect(hoa).toHaveAttribute('aria-selected', 'false');
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Hãy chọn một người trong danh sách.',
    );
  });

  it('keeps the search and the pick when the change is not made', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Nam');
    await user.click(within(dialog).getByRole('radio', { name: 'Cha/mẹ của Nguyễn Văn Nam' }));
    await user.type(search(dialog), 'binh');
    await user.click(within(dialog).getByRole('option', { name: /Trần Văn Bình/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    await user.click(screen.getByRole('button', { name: 'Thôi, không đổi' }));
    expect(sent()).toEqual([]);
    expect(search(dialog)).toHaveValue('binh');
    expect(within(dialog).getByRole('option', { name: /Trần Văn Bình/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));
    await user.click(screen.getByRole('button', { name: 'Thay Lê Thị Hoa' }));
    expect(search(dialog)).toHaveValue('');
    await waitFor(() => expect(sent()).toHaveLength(1));
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
      within(dialog).getByText('Đã đổi: Nguyễn Văn Tư và Lê Thị Hoa không còn là vợ chồng'),
    ).toBeInTheDocument();
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.partnerIds).toEqual([GRANDMA]);
  });

  it('offers Undo in the dialog, which reverts the change in one undo step', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Tình trạng hôn nhân với Lê Thị Hoa' }),
      'Goá',
    );
    expect(within(dialog).getByText(WIDOWED)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: UNDO }));
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.status).toBe('married');
    expect(useTreeStore.getState().undoStack).toHaveLength(0);
    expect(useTreeStore.getState().redoStack).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: UNDO })).not.toBeInTheDocument();
    // The focused Undo went away: focus stays on the dialog's content.
    await focusInContent(dialog);
    await waitFor(() => expect(sent()).toHaveLength(2));
  });

  it('offers Undo only for the latest change', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    const status = within(dialog).getByRole('combobox', {
      name: 'Tình trạng hôn nhân với Lê Thị Hoa',
    });
    await user.selectOptions(status, 'Goá');
    await user.selectOptions(status, 'Đã ly hôn');
    expect(within(dialog).queryByText(WIDOWED)).not.toBeInTheDocument();
    expect(within(dialog).getByText(DIVORCED)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: UNDO })).toHaveLength(1);

    // Another edit came after it (straight to the store here): Undo would now undo that one.
    act(
      () =>
        void useTreeStore.getState().apply({
          type: 'updatePerson',
          payload: { id: SON, changes: { fullName: 'Nguyễn Văn Nam Anh' } },
        }),
    );
    expect(within(dialog).queryByRole('button', { name: UNDO })).not.toBeInTheDocument();
    expect(within(dialog).getByText(DIVORCED)).toBeInTheDocument();
  });

  it('scrolls its lists, while Apply and Done stay in view', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openDialog(user, 'Nguyễn Văn Tư');
    const scroller = group(dialog, 'Cha mẹ').closest('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    expect(scroller).toHaveClass('max-h-[55vh]');
    expect(scroller?.contains(within(dialog).getByRole('button', { name: 'Áp dụng' }))).toBe(false);
    expect(scroller?.contains(within(dialog).getByRole('button', { name: 'Xong' }))).toBe(false);
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
