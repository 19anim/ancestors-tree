import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderWithProviders } from '../../test/render';
import { CLAN_ID, FAMILY, SON } from './fixtures';
import { resetTreeStore, useTreeStore } from './store';
import { TreeActionsContext } from './treeActions';
import { TreeBoard } from './TreeBoard';

function showTree(tree: TreeState): void {
  useTreeStore.setState({
    clanId: CLAN_ID,
    status: 'ready',
    tree,
    confirmedTree: tree,
    confirmedVersion: 3,
  });
}

const family = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

beforeEach(() => {
  mockReactFlow();
  resetTreeStore();
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('TreeBoard', () => {
  it('draws everyone linked to the progenitor with name, years, generation and tape', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả: Họ Nguyễn" />);
    expect(screen.getByRole('group', { name: 'Cây gia phả: Họ Nguyễn' })).toBeInTheDocument();
    expect(
      await screen.findByRole('figure', { name: 'Nguyễn Văn Tư, 1931–2004, đời thứ 1' }),
    ).toHaveAttribute('data-tape', 'progenitor');
    expect(screen.getByRole('figure', { name: 'Lê Thị Hoa, đời thứ 1' })).toHaveAttribute(
      'data-tape',
      'in-law',
    );
    expect(screen.getByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' })).toHaveAttribute(
      'data-tape',
      'branch-1',
    );
    // Not linked to the progenitor: listed in the tray, not drawn.
    expect(screen.queryByRole('figure', { name: /Trần Văn Bình/ })).not.toBeInTheDocument();
  });

  it('shows an edit at once', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    act(() => {
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { fullName: 'Nguyễn Văn Năm' } },
      });
    });
    expect(
      await screen.findByRole('figure', { name: 'Nguyễn Văn Năm, đời thứ 2' }),
    ).toBeInTheDocument();
  });

  it('asks for a progenitor when none is chosen', () => {
    showTree({ ...family, progenitorId: null });
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    expect(screen.getByText(/Chưa chọn thuỷ tổ/)).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('offers a card’s actions only when editing is possible', async () => {
    const user = userEvent.setup();
    const openActions = vi.fn();
    showTree(family);
    const { unmount } = renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    expect(screen.queryByRole('button', { name: /Thao tác với/ })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <TreeActionsContext value={openActions}>
        <TreeBoard label="Cây gia phả" />
      </TreeActionsContext>,
    );
    await user.click(await screen.findByRole('button', { name: 'Thao tác với Nguyễn Văn Nam' }));
    expect(openActions).toHaveBeenCalledWith(SON);
  });
});
