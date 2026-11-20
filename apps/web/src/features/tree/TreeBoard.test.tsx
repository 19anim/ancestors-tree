import type { TreeResponse } from '@ancestors-tree/shared';
import { treeStateFromLists, type TreeState } from '@ancestors-tree/shared/tree';
import type * as XyFlow from '@xyflow/react';
import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow, resizeObserved } from '../../test/reactFlow';
import { renderWithProviders } from '../../test/render';
import { centredOn, isRectVisible, pannedToShow, personRect, type Rect } from './boardView';
import { PersonalThemeContext } from './decorContext';
import {
  CLAN_ID,
  FAMILY,
  fixturePerson,
  GRANDMA,
  GRANDPA,
  ME,
  PARENTS_UNION,
  SON,
} from './fixtures';
import type * as Layout from './layout';
import { layoutTree } from './layout';
import { PersonCard } from './PersonCard';
import { OpenPersonContext } from './profileParams';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { TreeBoard } from './TreeBoard';

/** The Polaroid beside a card button, under it; it is hidden from screen readers. */
function figureOf(card: HTMLElement): HTMLElement {
  const figure = card.parentElement?.querySelector('figure');
  if (!figure) throw new Error('no Polaroid in the card');
  return figure;
}

/** WCAG 2.5.3: any text a card button holds is part of its accessible name. */
function expectTextInName(card: HTMLElement): void {
  const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
  expect(card.getAttribute('aria-label') ?? '').toContain(text);
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

// Count layouts (spec §13.4: a theme switch never lays the tree out again).
vi.mock('./layout', async (importOriginal) => {
  const original = await importOriginal<typeof Layout>();
  return { ...original, layoutTree: vi.fn(original.layoutTree) };
});

/**
 * Methods of React Flow's instance a test replaces, to watch the board's view calls without
 * jsdom running the transitions; null uses the real instance.
 */
const flowOverride = vi.hoisted(() => ({ current: null as Partial<ReactFlowInstance> | null }));
vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof XyFlow>();
  return {
    ...original,
    useReactFlow: () => {
      const real = original.useReactFlow();
      return flowOverride.current === null ? real : { ...real, ...flowOverride.current };
    },
  };
});

const family = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
/** Út, Nam's younger sister in the tests that need siblings. */
const DAUGHTER = '64b7f0c2a1b2c3d4e5f6a004';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  flowOverride.current = null;
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
    // The card is the button: the Polaroid under it is not read a second time.
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
    // The marks are on the hidden Polaroid: the card buttons describe them.
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

  it('puts no text in a card button that its name lacks (WCAG 2.5.3)', async () => {
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
          : person,
      ),
    } satisfies TreeResponse;
    showTree(treeStateFromLists(tree.progenitorId, tree.persons, tree.unions));
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    await screen.findByRole('button', { name: /^Nguyễn Văn Tư,/ });
    // The photo's initials, the "~1931" years and the anniversary line are drawn on the card,
    // but none of them may be text inside the button: axe's label-content-name-mismatch.
    const cards = document.querySelectorAll<HTMLElement>('[data-person-open]');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expectTextInName(card);
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
      'Dùng phím mũi tên để di chuyển, phím + và − để phóng to, thu nhỏ, phím 0 để xem cả cây. ' +
        'Trên một thẻ: Enter mở hồ sơ, phím mũi tên đi tới người thân.',
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

  it('moves focus to a relative with the arrow keys and centres the card it lands on', async () => {
    // Reduced motion: the view jumps. In jsdom, a d3 transition started while another is still
    // running (Nam's centring, then Tư's) sometimes never advances.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const user = userEvent.setup();
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    // jsdom boards are 1×1 pixel (test/reactFlow.ts): every card is off screen, so a card that
    // gets focus is centred on the board as measured (React Flow's own pane reads as 100 × 100).
    const rect = personRect(layoutTree(family), GRANDPA) as Rect;
    const grandpaCentre = () => {
      const { x, y, zoom } = viewportOf(board);
      return { x: x + (rect.x + rect.width / 2) * zoom, y: y + (rect.y + rect.height / 2) * zoom };
    };
    act(() => son.focus());
    await user.keyboard('{ArrowUp}');
    const grandpa = screen.getByRole('button', { name: /^Nguyễn Văn Tư,/ });
    expect(grandpa).toHaveFocus();
    await waitFor(() => {
      expect(grandpaCentre().x).toBeCloseTo(board.offsetWidth / 2);
      expect(grandpaCentre().y).toBeCloseTo(board.offsetHeight / 2);
    });
    // No parent, no sibling: the key does nothing.
    await user.keyboard('{ArrowUp}');
    expect(grandpa).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(grandpa).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(son).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(son).toHaveFocus();
    // A modified arrow is not a move.
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(son).toHaveFocus();
  });

  /**
   * Nam, then Út, side by side under Tư, on a narrow board as on a phone. The view reports
   * whatever `viewport` holds, and setViewport starts a flight that never lands; time stands still
   * until the test moves `clock.now`. React Flow measured the board before the test sized it, so
   * its own idea of the board's size is stale, as just after the profile column opens.
   */
  async function renderMidFlight() {
    const siblings = treeStateFromLists(
      FAMILY.progenitorId,
      [
        ...FAMILY.persons,
        fixturePerson(DAUGHTER, 'Nguyễn Thị Út', {
          gender: 'female',
          parentUnionId: PARENTS_UNION,
        }),
      ],
      FAMILY.unions,
    );
    const size = { width: 375, height: 420 };
    const layout = layoutTree(siblings);
    const rectOf = (id: string) => personRect(layout, id) as Rect;
    const view = { current: { x: -5000, y: -5000, zoom: 1 } as Viewport };
    const setViewport = vi.fn(() => new Promise<boolean>(() => undefined));
    flowOverride.current = { getViewport: () => view.current, setViewport };
    const clock = { now: 1000 };
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
    showTree(siblings);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" />
      </OpenPersonContext>,
    );
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const daughter = screen.getByRole('button', { name: /^Nguyễn Thị Út,/ });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    board.style.width = `${size.width}px`;
    board.style.height = `${size.height}px`;
    // Centred on Nam, Út is cut off by the board's right edge; centred on Út, she is whole.
    const onSon = centredOn(rectOf(SON), 1, size);
    const onDaughter = centredOn(rectOf(DAUGHTER), 1, size);
    expect(isRectVisible(rectOf(DAUGHTER), onSon, size)).toBe(false);
    expect(isRectVisible(rectOf(DAUGHTER), onDaughter, size)).toBe(true);
    return { son, daughter, board, view, clock, setViewport, onSon, onDaughter };
  }

  it('centres a card for the board’s measured size, not React Flow’s stale one', async () => {
    const { son, setViewport, onSon } = await renderMidFlight();

    act(() => son.focus());
    // centredOn with the 375 × 420 board, at the same zoom and with the usual duration.
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenLastCalledWith(onSon, { duration: 300 });
  });

  it('keeps a card reached while a centring is under way on screen once the view lands', async () => {
    const user = userEvent.setup();
    const { son, daughter, view, clock, setViewport, onSon, onDaughter } = await renderMidFlight();

    act(() => son.focus());
    expect(setViewport).toHaveBeenLastCalledWith(onSon, expect.anything());
    // Halfway to Nam the view happens to show Út whole, but it lands with her off screen.
    view.current = onDaughter;
    await user.keyboard('{ArrowRight}');
    expect(daughter).toHaveFocus();
    expect(setViewport).toHaveBeenCalledTimes(2);
    expect(setViewport).toHaveBeenLastCalledWith(onDaughter, expect.anything());

    // Long after the flight, the view is where it reports: Nam is already in view there.
    clock.now += 1000;
    view.current = onSon;
    await user.keyboard('{ArrowLeft}');
    expect(son).toHaveFocus();
    expect(setViewport).toHaveBeenCalledTimes(2);
  });

  it('forgets where a centring lands once the user moves the view', async () => {
    const user = userEvent.setup();
    const { son, daughter, board, view, setViewport, onDaughter } = await renderMidFlight();

    act(() => son.focus());
    expect(setViewport).toHaveBeenCalledTimes(1);
    act(() => board.focus());
    await user.keyboard('{ArrowLeft}');
    // The pan took over (one more move): the view is where it reports, and Út is in it.
    expect(setViewport).toHaveBeenCalledTimes(2);
    view.current = onDaughter;
    act(() => daughter.focus());
    expect(setViewport).toHaveBeenCalledTimes(2);
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

  it('brings the open person’s card back into view when the board narrows', async () => {
    const layout = layoutTree(family);
    const rect = personRect(layout, SON) as Rect;
    // Nam whole on a wide board, at its right edge; then the profile column opens beside it.
    const view = { current: { x: 700 - rect.x - rect.width, y: 40 - rect.y, zoom: 1 } };
    const setViewport = vi.fn(() => new Promise<boolean>(() => undefined));
    flowOverride.current = { getViewport: () => view.current, setViewport };
    const clock = { now: 1000 };
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
    showTree(family);
    const { rerender } = renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" openPersonId={SON} />
      </OpenPersonContext>,
    );
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    const resize = (width: number) => {
      board.style.width = `${width}px`;
      board.style.height = '420px';
      act(() => resizeObserved(board));
    };
    resize(800);
    expect(setViewport).not.toHaveBeenCalled();

    // The smallest pan, so the cards next to Nam stay in view.
    resize(500);
    const first = pannedToShow(rect, view.current, { width: 500, height: 420 });
    expect(first).not.toBeNull();
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenLastCalledWith(first, { duration: 300 });

    // Narrower again while that pan still moves: measured from where it lands, not from the
    // view mid-flight, which happens to show Nam whole on the narrower board.
    view.current = centredOn(rect, 1, { width: 450, height: 420 });
    resize(450);
    expect(setViewport).toHaveBeenCalledTimes(2);
    expect(setViewport).toHaveBeenLastCalledWith(
      pannedToShow(rect, first as Viewport, { width: 450, height: 420 }),
      { duration: 300 },
    );

    // No profile open: a resize leaves the view alone.
    clock.now += 1000;
    rerender(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" openPersonId={null} />
      </OpenPersonContext>,
    );
    resize(300);
    expect(setViewport).toHaveBeenCalledTimes(2);
  });

  it('jumps rather than glides to the open person with reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const setViewport = vi.fn(() => Promise.resolve(true));
    flowOverride.current = { getViewport: () => ({ x: -5000, y: -5000, zoom: 1 }), setViewport };
    showTree(family);
    renderWithProviders(
      <OpenPersonContext value={vi.fn()}>
        <TreeBoard label="Cây gia phả" openPersonId={SON} />
      </OpenPersonContext>,
    );
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    board.style.width = '375px';
    board.style.height = '420px';
    act(() => resizeObserved(board));
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenLastCalledWith(expect.anything(), { duration: 0 });
  });
});

describe('tree themes on the board', () => {
  const renderedFor = (id: string) =>
    vi.mocked(PersonCard).mock.calls.filter(([props]) => props.person.id === id).length;

  it('switches the clan theme without laying out the tree or redrawing unchanged cards', async () => {
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const board = screen.getByRole('group', { name: 'Cây gia phả' });
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(board).toHaveAttribute('data-thread', 'cotton');
    const layouts = vi.mocked(layoutTree).mock.calls.length;
    const before = renderedFor(SON);

    act(() => {
      useTreeStore.getState().apply({
        type: 'setTreeTheme',
        payload: { changes: { surface: 'corkboard', thread: 'yarn', stitch: 'yarn' } },
      });
    });
    expect(board).toHaveAttribute('data-surface', 'corkboard');
    expect(board).toHaveAttribute('data-thread', 'yarn');
    expect(board).toHaveAttribute('data-stitch', 'yarn');
    expect(vi.mocked(layoutTree).mock.calls.length).toBe(layouts);
    // No card part changed, so no card was drawn again.
    expect(renderedFor(SON)).toBe(before);
    expect(figureOf(son)).toHaveAttribute('data-fastener', 'washi');
  });

  it('redraws only the card whose own style changed', async () => {
    mockApi({ [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }) });
    showTree(family);
    renderWithProviders(<TreeBoard label="Cây gia phả" />);
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    const before = { son: renderedFor(SON), grandma: renderedFor(GRANDMA) };
    act(() => {
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { cardStyle: { frame: 'vintage' } } },
      });
    });
    expect(figureOf(son)).toHaveAttribute('data-frame', 'vintage');
    expect(renderedFor(SON)).toBeGreaterThan(before.son);
    expect(renderedFor(GRANDMA)).toBe(before.grandma);
  });

  it('uses my own choices while they are on', async () => {
    showTree(family);
    renderWithProviders(
      <PersonalThemeContext
        value={{
          enabled: true,
          theme: { surface: 'fridge' },
          cards: { [SON]: { fastener: 'magnet' } },
        }}
      >
        <TreeBoard label="Cây gia phả" />
      </PersonalThemeContext>,
    );
    const son = await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    expect(screen.getByRole('group', { name: 'Cây gia phả' })).toHaveAttribute(
      'data-surface',
      'fridge',
    );
    expect(figureOf(son)).toHaveAttribute('data-fastener', 'magnet');
    const grandma = await screen.findByRole('button', { name: /^Lê Thị Hoa,/ });
    expect(figureOf(grandma)).toHaveAttribute('data-fastener', 'washi');
  });
});
