import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, ME, SIBLINGS, SISTER, SON } from './fixtures';
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

describe('Move earlier / later', () => {
  it('moves a sibling earlier in one op, confirms it, and undoes it from the toast', async () => {
    // From md up the profile is a column beside the board, so the moved card takes focus. Below
    // md it is inert behind the sheet, and focus goes elsewhere (TreePage.test.tsx).
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 48rem)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const user = userEvent.setup();
    const sent = editableTree(SIBLINGS, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: cardName('Nguyễn Thị Lan') }));
    const profile = screen.getByRole('complementary', { name: 'Nguyễn Thị Lan' });
    expect(within(profile).queryByRole('button', { name: 'Xếp ra sau' })).not.toBeInTheDocument();

    await user.click(within(profile).getByRole('button', { name: 'Xếp lên trước' }));
    expect(screen.getByText('Đã đổi: Nguyễn Thị Lan xếp trước Nguyễn Văn Nam')).toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Thị Lan')).toHaveFocus());
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'updatePerson', payload: { id: SISTER, changes: { siblingOrder: 1 } } },
      { type: 'updatePerson', payload: { id: SON, changes: { siblingOrder: 2 } } },
    ]);
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi này' }));
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Hoàn tác thay đổi này' })).not.toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Thị Lan')).toHaveFocus());
  });

  it('undoes only its own change from the toast', async () => {
    const user = userEvent.setup();
    editableTree(SIBLINGS, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: cardName('Nguyễn Thị Lan') }));
    const profile = screen.getByRole('complementary', { name: 'Nguyễn Thị Lan' });
    await user.click(within(profile).getByRole('button', { name: 'Xếp lên trước' }));
    await user.click(within(profile).getByRole('button', { name: 'Xếp ra sau' }));
    expect(screen.getByText('Đã đổi: Nguyễn Thị Lan xếp sau Nguyễn Văn Nam')).toBeInTheDocument();
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi này' }));
    // The earlier move stays, and stays undoable from the toolbar, but not from this toast.
    expect(useTreeStore.getState().tree.persons[SISTER]?.siblingOrder).toBe(1);
    expect(useTreeStore.getState().undoStack).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Hoàn tác thay đổi này' })).not.toBeInTheDocument();
  });
});
