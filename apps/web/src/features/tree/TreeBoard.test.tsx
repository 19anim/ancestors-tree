import type { TreeResponse } from '@ancestors-tree/shared';
import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderWithProviders } from '../../test/render';
import { CLAN_ID, FAMILY, GRANDMA, GRANDPA, ME, SON } from './fixtures';
import { PersonCard } from './PersonCard';
import { OpenPersonContext } from './profileParams';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { TreeBoard } from './TreeBoard';

/** The Polaroid inside a card button; it is hidden from screen readers. */
function figureOf(card: HTMLElement): HTMLElement {
  const figure = card.querySelector('figure');
  if (!figure) throw new Error('no Polaroid in the card');
  return figure;
}

function showTree(tree: TreeState): void {
  useTreeStore.setState({
    clanId: CLAN_ID,
    status: 'ready',
    tree,
    confirmedTree: tree,
    confirmedVersion: 3,
  });
}

/** The family with grandma Hoa's birth family filled in: her card is an in-law card. */
function withHoaBirthFamily(): TreeState {
  const persons = FAMILY.persons.map((person) =>
    person.id === GRANDMA ? { ...person, birthFamily: { fatherName: 'Lê Văn Ba' } } : person,
  );
  return treeStateFromLists(FAMILY.progenitorId, persons, FAMILY.unions);
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
    await screen.findByRole('button', { name: /^Nguyễn Văn Tư,/ });
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
    const grandpa = await screen.findByRole('button', {
      name: 'Nguyễn Văn Tư, khoảng năm 1931–khoảng năm 2004, đời thứ 1',
    });
    expect(figureOf(grandpa)).toHaveAttribute('data-tape', 'progenitor');
    expect(figureOf(screen.getByRole('button', { name: 'Lê Thị Hoa, đời thứ 1' }))).toHaveAttribute(
      'data-tape',
      'in-law',
    );
    expect(
      figureOf(screen.getByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' })),
    ).toHaveAttribute('data-tape', 'branch-1');
    // The card is the button: the Polaroid inside it is not read a second time.
    expect(figureOf(grandpa)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    // Not linked to the progenitor: listed in the tray, not drawn.
    expect(screen.queryByRole('button', { name: /Trần Văn Bình/ })).not.toBeInTheDocument();
  });

  it('shows the anniversary line and the birthday sticker', async () => {
    const tree = {
      ...FAMILY,
      persons: FAMILY.persons.map((person) =>
        person.id === GRANDPA
          ? {
              ...person,
              death: {
                isDeceased: true,
                date: { source: 'lunar', lunar: { day: 15, month: 10, year: 2004, isLeap: false } },
              },
            }
          : person.id === SON
            ? { ...person, birth: { source: 'solar', solar: { day: 21, month: 11, year: 1990 } } }
            : person,
      ),
    } satisfies TreeResponse;
    showTree(treeStateFromLists(tree.progenitorId, tree.persons, tree.unions));
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    // The marks are inside the hidden Polaroid: the card buttons describe them.
    expect(
      await screen.findByRole('button', { name: /^Nguyễn Văn Tư,/ }),
    ).toHaveAccessibleDescription('Ngày giỗ 15/10 âm lịch');
    expect(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ })).toHaveAccessibleDescription(
      'Sinh nhật 21/11',
    );
    expect(screen.getByRole('button', { name: /^Lê Thị Hoa,/ })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('names an in-law card’s birth family and shows it as the card’s tooltip', async () => {
    showTree(withHoaBirthFamily());
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    const card = await screen.findByRole('button', {
      name: 'Lê Thị Hoa, đời thứ 1, Con gái ông Lê Văn Ba',
    });
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip).toHaveTextContent('Con gái ông Lê Văn Ba');
    expect(card).toHaveAttribute('aria-describedby', tooltip.id);
    expect(card).toHaveAccessibleDescription('Con gái ông Lê Văn Ba');
  });

  it('hides the in-law tooltip on Escape until the pointer or focus leaves', async () => {
    const user = userEvent.setup();
    showTree(withHoaBirthFamily());
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    const actions = await screen.findByRole('button', { name: /^Lê Thị Hoa,/ });
    // jsdom has no CSS: the hover and focus rules are the classes that show the tooltip.
    const tooltip = () => screen.getByRole('tooltip', { hidden: true });
    // Hoverable (WCAG 1.4.13): the pointer can move onto the tooltip without it vanishing.
    expect(tooltip()).not.toHaveClass('pointer-events-none');
    act(() => actions.focus());
    expect(tooltip()).toHaveClass('group-focus-within:block', 'group-hover:block');
    await user.keyboard('{Escape}');
    expect(tooltip()).not.toHaveClass('group-focus-within:block');
    expect(tooltip()).not.toHaveClass('group-hover:block');
    expect(actions).toHaveFocus();
    act(() => actions.blur());
    expect(tooltip()).toHaveClass('group-focus-within:block');

    await user.hover(actions);
    await user.keyboard('{Escape}');
    expect(tooltip()).not.toHaveClass('group-hover:block');
    await user.unhover(actions);
    expect(tooltip()).toHaveClass('group-hover:block');
  });

  it('shows an edit at once', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    act(() => {
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { fullName: 'Nguyễn Văn Năm' } },
      });
    });
    expect(
      await screen.findByRole('button', { name: 'Nguyễn Văn Năm, đời thứ 2' }),
    ).toBeInTheDocument();
  });

  it('asks for a progenitor when none is chosen', () => {
    showTree({ ...family, progenitorId: null });
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    expect(screen.getByText(/Chưa chọn thuỷ tổ/)).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('opens a person’s profile from their card, by click or by Enter', async () => {
    const user = userEvent.setup();
    const openPerson = vi.fn();
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={openPerson}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    const card = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    expect(card).toHaveAttribute('data-person-open', SON);
    await user.click(card);
    expect(openPerson).toHaveBeenLastCalledWith(SON);
    act(() => screen.getByRole('button', { name: /^Lê Thị Hoa,/ }).focus());
    await user.keyboard('{Enter}');
    expect(openPerson).toHaveBeenLastCalledWith(GRANDMA);
  });

  it('re-renders only the edited person’s card', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
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
    await screen.findByRole('button', { name: 'Nguyễn Văn Năm, đời thứ 2' });
    expect(renderedFor(SON)).toBeGreaterThan(before.son);
    expect(renderedFor(GRANDMA)).toBe(before.grandma);
  });

  it('does not re-render a card without a tooltip on hover', async () => {
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    const card = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const renderedFor = (id: string) =>
      vi.mocked(PersonCard).mock.calls.filter(([props]) => props.person.id === id).length;
    const before = renderedFor(SON);
    await user.hover(card);
    await user.unhover(card);
    expect(renderedFor(SON)).toBe(before);
  });

  it('tabs to the board, then the cards, then the zoom buttons', async () => {
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <button type="button">Before</button>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const stops: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      await user.tab();
      const focused = document.activeElement as HTMLElement;
      stops.push(focused.getAttribute('aria-label') ?? focused.textContent ?? '');
    }
    expect(stops).toEqual([
      'Before',
      'Cây gia phả',
      'Nguyễn Văn Tư, khoảng năm 1931–khoảng năm 2004, đời thứ 1',
      'Lê Thị Hoa, đời thứ 1',
      'Nguyễn Văn Nam, đời thứ 2',
      'React Flow attribution',
      'Phóng to',
      'Thu nhỏ',
      'Xem cả cây',
    ]);
  });

  it('gives a viewer’s board one stop, the cards and the zoom buttons, with the keys described', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    expect(board).toHaveAttribute('tabindex', '0');
    expect(board).toHaveAccessibleDescription(
      'Dùng phím mũi tên để di chuyển, phím + và − để phóng to, thu nhỏ, phím 0 để xem cả cây.',
    );
    // No node or edge wrapper is a tab stop; the only buttons are the cards (a viewer opens
    // profiles too) and the zoom buttons.
    expect(board.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect([...board.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Nguyễn Văn Tư, khoảng năm 1931–khoảng năm 2004, đời thứ 1',
      'Lê Thị Hoa, đời thứ 1',
      'Nguyễn Văn Nam, đời thứ 2',
      'Phóng to',
      'Thu nhỏ',
      'Xem cả cây',
    ]);
  });

  it('pans with the arrow keys and zooms with +, only when the board itself has focus', async () => {
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    act(() => board.focus());
    const start = viewportOf(board);

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(viewportOf(board).x).toBeCloseTo(start.x + 80));
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(viewportOf(board).y).toBeCloseTo(start.y + 80));
    await user.keyboard('+');
    await waitFor(() => expect(viewportOf(board).zoom).toBeGreaterThan(start.zoom));

    act(() => screen.getByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' }).focus());
    const onCard = viewportOf(board);
    await user.keyboard('{ArrowLeft}');
    expect(viewportOf(board).x).toBeCloseTo(onCard.x);
  });

  it('brings a card into view when its button gets focus', async () => {
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    // jsdom boards are 1×1 pixel (test/reactFlow.ts), so no card is ever fully in view.
    const before = viewportOf(board);
    act(() => screen.getByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' }).focus());
    await waitFor(() => expect(viewportOf(board)).not.toEqual(before));
  });
});
