import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderWithProviders } from '../../test/render';
import { CLAN_ID, FAMILY, GRANDMA, SON } from './fixtures';
import { PersonCard } from './PersonCard';
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

// Spy on the real card to count renders (spec §7.4: an edit re-renders only that person's card).
vi.mock('./PersonCard', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, PersonCard: vi.fn(original.PersonCard as typeof PersonCard) };
});

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
  it('keeps threads and union knots away from screen readers', async () => {
    showTree(family);
    const { container } = renderWithProviders(<TreeBoard label="Cây gia phả: Họ Nguyễn" />);
    await screen.findByRole('figure', { name: /Nguyễn Văn Tư/ });
    // React Flow names every edge "Edge from <id> to <id>" (role="img"); the threads carry
    // aria-hidden (flowElements.test.ts), so none is exposed. jsdom measures no handles, so the
    // edges themselves are not drawn here; the union knots are.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Edge from/)).not.toBeInTheDocument();
    const knots = container.querySelectorAll('.react-flow__node-union');
    expect(knots.length).toBeGreaterThan(0);
    for (const knot of knots) expect(knot).toHaveAttribute('aria-hidden', 'true');
  });

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

  it('re-renders only the edited person’s card', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const renderedFor = (id: string) =>
      vi.mocked(PersonCard).mock.calls.filter(([props]) => props.person.id === id).length;
    const before = { son: renderedFor(SON), grandma: renderedFor(GRANDMA) };
    expect(before.grandma).toBeGreaterThan(0);
    act(() => {
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { fullName: 'Nguyễn Văn Năm' } },
      });
    });
    await screen.findByRole('figure', { name: 'Nguyễn Văn Năm, đời thứ 2' });
    expect(renderedFor(SON)).toBeGreaterThan(before.son);
    expect(renderedFor(GRANDMA)).toBe(before.grandma);
  });

  it('tabs only through the actions buttons, never through unnamed node wrappers', async () => {
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(
      <TreeActionsContext value={vi.fn()}>
        <button type="button">Before</button>
        <TreeBoard label="Cây gia phả" />
      </TreeActionsContext>,
    );
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const stops: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      const focused = document.activeElement as HTMLElement;
      expect(focused.tagName).toBe('BUTTON');
      stops.push(focused.getAttribute('aria-label') ?? focused.textContent ?? '');
    }
    expect(stops).toEqual([
      'Before',
      'Thao tác với Nguyễn Văn Tư',
      'Thao tác với Lê Thị Hoa',
      'Thao tác với Nguyễn Văn Nam',
    ]);
  });

  it('gives a viewer’s board no keyboard stops', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    expect(board.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(board.querySelectorAll('button')).toHaveLength(0);
  });
});
