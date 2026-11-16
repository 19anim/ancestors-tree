import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLICK_AFTER_DROP_MS, useDragStore, resetDrag } from './dragStore';
import { zoneResults } from './dragZones';
import { CLAN, CLAN_ID, FAMILY, GRANDMA, GRANDPA, LOOSE, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetDrag();
  resetTreeStore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

/** The card's wrapper, the droppable dnd-kit measures. */
function wrapperOf(name: string): HTMLElement {
  const wrapper = card(name).parentElement;
  if (wrapper === null) throw new Error('no card wrapper');
  return wrapper;
}

function placeAt(element: HTMLElement, left: number, top: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: left, y: top, width: 100, height: 150 }),
  );
}

describe('drag to relate (mouse)', () => {
  it('labels the zones on the target, crosses out the blocked ones, and says what will happen', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    act(() => {
      useDragStore.setState({
        activeId: GRANDPA,
        overId: SON,
        zone: 'parent',
        results: zoneResults(tree, GRANDPA, SON),
        seenTree: tree,
      });
    });
    // Grandpa is already Nam's parent: that zone is crossed out.
    expect(screen.getByText('Làm cha/mẹ')).toHaveClass('line-through');
    expect(screen.getByText('Làm con')).not.toHaveClass('line-through');
    expect(
      screen.getByText('Làm cha/mẹ của Nguyễn Văn Nam: không được. Quan hệ này đã có rồi.'),
    ).toBeInTheDocument();
  });

  it('starts a drag after about 6 px, and Esc cancels it with no op', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    fireEvent.mouseDown(nam, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 3, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseMove(document, { clientX: 10, clientY: 0 });
    await waitFor(() => expect(useDragStore.getState().activeId).toBe(SON));
    expect(
      screen.getByText('Đang kéo Nguyễn Văn Nam. Thả lên một thẻ khác, hoặc nhấn Esc để huỷ.'),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(useDragStore.getState().activeId).toBeNull());
    fireEvent.mouseUp(document);
    expect(sent()).toEqual([]);
  });

  it('drops a loose photo on the bottom third of a card: one op, a toast, focus on the person', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    placeAt(wrapperOf('Nguyễn Văn Nam'), 100, 100);
    const binh = card('Trần Văn Bình');
    fireEvent.mouseDown(binh, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 240 });
    await waitFor(() => expect(useDragStore.getState().zone).toBe('child'));
    fireEvent.mouseUp(document, { clientX: 150, clientY: 240 });
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0]).map((op) => op.type)).toEqual(['addUnion', 'setParents']);
    expect(
      screen.getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Nam'),
    ).toBeInTheDocument();
    await waitFor(() => expect(card('Trần Văn Bình')).toHaveFocus());
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBeDefined();
  });

  it('lets viewers drag nothing', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    fireEvent.mouseDown(nam, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseUp(document);
  });

  it('detaches a card dropped on the Loose photos tray', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    placeAt(screen.getByRole('region', { name: 'Ảnh chưa dán' }), 300, 300);
    fireEvent.mouseDown(nam, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 350 });
    await waitFor(() => expect(useDragStore.getState().zone).toBe('tray'));
    expect(screen.getByText('Thả để: Nguyễn Văn Nam chuyển vào Ảnh chưa dán')).toBeInTheDocument();
    fireEvent.mouseUp(document, { clientX: 350, clientY: 350 });
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0]).map((op) => op.type)).toEqual(['setParents']);
    expect(useTreeStore.getState().tree.persons[SON]?.parentUnionId).toBeUndefined();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
  });

  it('shows an empty tray only while dragging, to drop on', async () => {
    const linked = { ...FAMILY, persons: FAMILY.persons.filter((person) => person.id !== LOOSE) };
    editableTree(linked, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    expect(screen.queryByRole('region', { name: 'Ảnh chưa dán' })).not.toBeInTheDocument();
    act(() => {
      useDragStore.setState({ activeId: SON });
    });
    expect(screen.getByRole('region', { name: 'Ảnh chưa dán' })).toHaveTextContent(
      'Thả vào đây để chuyển vào Ảnh chưa dán.',
    );
    act(() => resetDrag());
    expect(screen.queryByRole('region', { name: 'Ảnh chưa dán' })).not.toBeInTheDocument();
  });

  it('ignores the click that follows a drop, and opens the profile on a later one', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    act(() => resetDrag());
    fireEvent.click(nam);
    expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument();
    useDragStore.setState({ endedAt: performance.now() - CLICK_AFTER_DROP_MS });
    fireEvent.click(nam);
    expect(
      await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' }),
    ).toBeInTheDocument();
  });
});

/** The board's surface, whose edges pan it. */
function board(): HTMLElement {
  return screen.getByRole('group', { name: `Cây gia phả: ${CLAN.name}` });
}

function stubRect(element: HTMLElement, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x, y, width, height }),
  );
}

/** React Flow writes the viewport as `translate(Xpx, Ypx) scale(Z)` on its viewport element. */
function viewportOf(surface: HTMLElement): { x: number; y: number; zoom: number } {
  const element = surface.querySelector<HTMLElement>('.react-flow__viewport');
  const match = element?.style.transform.match(
    /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\) scale\(([\d.]+)\)/,
  );
  if (!match) throw new Error(`no viewport transform: ${element?.style.transform ?? 'none'}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

/** Lifts a card: a press, then a move past the drag distance. */
async function lift(button: HTMLElement, x: number, y: number) {
  fireEvent.mouseDown(button, { button: 0, clientX: x, clientY: y });
  fireEvent.mouseMove(document, { clientX: x + 10, clientY: y });
  await waitFor(() => expect(useDragStore.getState().activeId).not.toBeNull());
}

function frames(count: number): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        const next = (left: number) => {
          if (left === 0) resolve();
          else requestAnimationFrame(() => next(left - 1));
        };
        next(count);
      }),
  );
}

describe('drag to relate: the board and the page moving under the drag', () => {
  it('measures the cards again when the board moves, so the target is the card now there', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    stubRect(board(), 0, 0, 800, 600);
    stubRect(wrapperOf('Nguyễn Văn Nam'), 0, 250, 100, 150);
    await lift(card('Trần Văn Bình'), 500, 500);
    fireEvent.mouseMove(document, { clientX: 50, clientY: 380 });
    expect(
      await screen.findByText('Thả để: Trần Văn Bình thành con của Nguyễn Văn Nam'),
    ).toBeInTheDocument();
    // The board is about to move: Nam's card goes right, Tư's comes under the pointer.
    stubRect(wrapperOf('Nguyễn Văn Nam'), 300, 250, 100, 150);
    stubRect(wrapperOf('Nguyễn Văn Tư'), 0, 250, 100, 150);
    const before = viewportOf(board());
    // Near the left edge: the board pans.
    fireEvent.mouseMove(document, { clientX: 20, clientY: 380 });
    await waitFor(() => expect(viewportOf(board()).x).toBeGreaterThan(before.x));
    expect(
      await screen.findByText('Thả để: Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    fireEvent.mouseUp(document, { clientX: 20, clientY: 380 });
    // The drop is on Tư, the card now under the pointer.
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBe(
      useTreeStore.getState().tree.persons[SON]?.parentUnionId,
    );
  });

  it('pans near the board’s edge only, and with the board card’s zoom on the lifted card', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    stubRect(board(), 0, 0, 800, 600);
    await lift(nam, 400, 300);
    expect(useDragStore.getState().liftZoom).toBeCloseTo(viewportOf(board()).zoom);
    // Scaled from the photo's own width, not the overlay's (already the card's width on screen):
    // the lift shadow is the size of the photo at any zoom.
    const lifted = document.querySelector<HTMLElement>('.shadow-lift');
    expect(lifted).toHaveClass('w-fit');
    expect(Number(lifted?.style.scale)).toBeCloseTo(viewportOf(board()).zoom);
    const start = viewportOf(board());
    fireEvent.mouseMove(document, { clientX: 10, clientY: 300 });
    await waitFor(() => expect(viewportOf(board()).x).toBeGreaterThan(start.x));
    fireEvent.mouseMove(document, { clientX: 400, clientY: 300 });
    await frames(2);
    const stopped = viewportOf(board());
    await frames(5);
    expect(viewportOf(board())).toEqual(stopped);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(useDragStore.getState().activeId).toBeNull());
    fireEvent.mouseUp(document);
  });

  it('keeps the zone right when the page scrolls under a still pointer', async () => {
    // jsdom has no scrolling element; a browser's is the root, which dnd-kit's rects follow.
    const page = document.documentElement;
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: page });
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    stubRect(wrapperOf('Nguyễn Văn Nam'), 100, 100, 100, 150);
    await lift(card('Trần Văn Bình'), 500, 500);
    // A loose photo is lifted as it looks in the tray.
    expect(useDragStore.getState().liftZoom).toBeNull();
    fireEvent.mouseMove(document, { clientX: 150, clientY: 140 });
    await waitFor(() => expect(useDragStore.getState().zone).toBe('parent'));
    // The page scrolls 40 px: the card moves up under the pointer, from its top third to the middle.
    Object.defineProperty(page, 'scrollTop', { configurable: true, value: 40 });
    try {
      fireEvent.scroll(window);
      await waitFor(() => expect(useDragStore.getState().zone).toBe('spouse'));
      expect(
        screen.getByText('Thả để: Trần Văn Bình và Nguyễn Văn Nam thành vợ chồng'),
      ).toBeInTheDocument();
      fireEvent.mouseUp(document, { clientX: 150, clientY: 140 });
      await waitFor(() => expect(sent()).toHaveLength(1));
      expect(
        screen.getByText('Đã đổi: Trần Văn Bình và Nguyễn Văn Nam thành vợ chồng'),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(page, 'scrollTop');
      Reflect.deleteProperty(document, 'scrollingElement');
    }
  });

  it('leaves no drag behind when the page goes away mid-drag', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    const { unmount } = renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    await lift(nam, 0, 0);
    unmount();
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseUp(document);
    expect(sent()).toEqual([]);
  });
});

/** A mouse event with its window, as a browser sends it (jsdom's constructor will not take one). */
function withView(target: EventTarget, type: 'mousedown' | 'mouseup') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, 'view', { value: window });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('drag to relate: what lifts a card', () => {
  it('lifts a card from its button only, not from its tooltip or its menu', async () => {
    const withFamily = {
      ...FAMILY,
      persons: FAMILY.persons.map((person) =>
        person.id === GRANDMA ? { ...person, birthFamily: { fatherName: 'Lê Văn Ba' } } : person,
      ),
    };
    editableTree(withFamily, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const hoa = await screen.findByRole('button', { name: /^Lê Thị Hoa/ });
    const tooltip = within(wrapperOf('Lê Thị Hoa')).getByRole('tooltip', { hidden: true });
    // The tooltip pans the board instead: its press takes "nopan" off the card (CardDrag), and
    // React Flow reads the events' window.
    const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(press, 'pointerType', { value: 'mouse' });
    fireEvent(tooltip, press);
    expect(wrapperOf('Lê Thị Hoa')).not.toHaveClass('nopan');
    withView(tooltip, 'mousedown');
    fireEvent.mouseMove(document, { clientX: 20, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    withView(document, 'mouseup');

    fireEvent.contextMenu(hoa);
    const [item] = await screen.findAllByRole('menuitem');
    if (item === undefined) throw new Error('no menu item');
    fireEvent.mouseDown(item, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 0 });
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.mouseUp(document);
    fireEvent.keyDown(item, { key: 'Escape', code: 'Escape' });
  });
});
