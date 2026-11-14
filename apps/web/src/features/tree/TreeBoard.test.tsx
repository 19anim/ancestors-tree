import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderWithProviders } from '../../test/render';
import { CLAN_ID, FAMILY, GRANDMA, ME, SON } from './fixtures';
import { PersonCard } from './PersonCard';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
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

/** React Flow writes the viewport as `translate(Xpx, Ypx) scale(Z)` on its viewport element. */
function viewportOf(board: HTMLElement): { x: number; y: number; zoom: number } {
  const element = board.querySelector<HTMLElement>('.react-flow__viewport');
  const match = element?.style.transform.match(
    /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\) scale\(([\d.]+)\)/,
  );
  if (!match) throw new Error(`no viewport transform: ${element?.style.transform ?? 'none'}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

// Spy on the real card to count renders (spec §7.4: an edit re-renders only that person's card).
vi.mock('./PersonCard', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, PersonCard: vi.fn(original.PersonCard as typeof PersonCard) };
});

const family = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
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
    // aria-hidden (flowElements.test.ts), so none is exposed. The board is rendered inside its own
    // ReactFlowProvider, so jsdom draws the edges; the union knots are drawn too.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const edges = container.querySelectorAll('.react-flow__edge');
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) expect(edge).toHaveAttribute('aria-hidden', 'true');
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

  it('tabs to the board, then the actions buttons, then the zoom buttons', async () => {
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
    for (let i = 0; i < 9; i += 1) {
      await user.tab();
      const focused = document.activeElement as HTMLElement;
      stops.push(focused.getAttribute('aria-label') ?? focused.textContent ?? '');
    }
    expect(stops).toEqual([
      'Before',
      'Cây gia phả',
      'Thao tác với Nguyễn Văn Tư',
      'Thao tác với Lê Thị Hoa',
      'Thao tác với Nguyễn Văn Nam',
      'React Flow attribution',
      'Phóng to',
      'Thu nhỏ',
      'Xem cả cây',
    ]);
  });

  it('gives a viewer’s board one stop and the zoom buttons, with the keys described', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    expect(board).toHaveAttribute('tabindex', '0');
    expect(board).toHaveAccessibleDescription(
      'Dùng phím mũi tên để di chuyển, phím + và − để phóng to, thu nhỏ, phím 0 để xem cả cây.',
    );
    // No node or edge wrapper is a tab stop; the only buttons are the zoom buttons.
    expect(board.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect([...board.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Phóng to',
      'Thu nhỏ',
      'Xem cả cây',
    ]);
  });

  it('pans with the arrow keys and zooms with +, only when the board itself has focus', async () => {
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(
      <TreeActionsContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </TreeActionsContext>,
    );
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    act(() => board.focus());
    const start = viewportOf(board);

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(viewportOf(board).x).toBeCloseTo(start.x + 80));
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(viewportOf(board).y).toBeCloseTo(start.y + 80));
    await user.keyboard('+');
    await waitFor(() => expect(viewportOf(board).zoom).toBeGreaterThan(start.zoom));

    act(() => screen.getByRole('button', { name: 'Thao tác với Nguyễn Văn Nam' }).focus());
    const onCard = viewportOf(board);
    await user.keyboard('{ArrowLeft}');
    expect(viewportOf(board).x).toBeCloseTo(onCard.x);
  });

  it('brings a card into view when its button gets focus', async () => {
    showTree(family);
    renderWithProviders(
      <TreeActionsContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </TreeActionsContext>,
    );
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    // jsdom boards are 1×1 pixel (test/reactFlow.ts), so no card is ever fully in view.
    const before = viewportOf(board);
    act(() => screen.getByRole('button', { name: 'Thao tác với Nguyễn Văn Nam' }).focus());
    await waitFor(() => expect(viewportOf(board)).not.toEqual(before));
  });
});
