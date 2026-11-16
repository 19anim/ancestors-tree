import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { resetDrag, useDragStore } from './dragStore';
import { CLAN, CLAN_ID, FAMILY, LOOSE, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { TOUCH_DELAY_MS } from './TreeDnd';
import { batchOps, card, EDITOR, editableTree } from './testKit';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  vi.useRealTimers();
  resetDrag();
  resetTreeStore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** jsdom has no PointerEvent: a mouse event with the pointer's type. */
function pointerDown(target: Element, pointerType: 'mouse' | 'touch') {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
  return event;
}

function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
}

/** The card's wrapper, the droppable dnd-kit measures. */
function wrapperOf(name: string): HTMLElement {
  const wrapper = card(name).parentElement;
  if (wrapper === null) throw new Error('no card wrapper');
  return wrapper;
}

/** The board's surface, whose React Flow pans it on a swipe. */
function board(): HTMLElement {
  return screen.getByRole('group', { name: `Cây gia phả: ${CLAN.name}` });
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

describe('touch', () => {
  it('keeps nopan for the mouse only, so a swipe on a card pans the board', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    const wrapper = nam.parentElement as HTMLElement;
    pointerDown(nam, 'mouse');
    expect(wrapper).toHaveClass('nopan');
    pointerDown(nam, 'touch');
    expect(wrapper).not.toHaveClass('nopan');
    expect(nam).not.toHaveClass('nopan');
    // Only the card's button: the rest of the wrapper (a tooltip, say) pans as before.
    pointerDown(nam, 'mouse');
    const photo = wrapper.firstElementChild;
    if (photo === null) throw new Error('no photo');
    pointerDown(photo, 'mouse');
    expect(wrapper).not.toHaveClass('nopan');
  });

  it('picks a card up after a 400 ms press, and not when the finger moves first', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.useFakeTimers();

    fireEvent.touchStart(nam, touch(0, 0));
    fireEvent.touchMove(nam, touch(20, 0));
    act(() => vi.advanceTimersByTime(500));
    expect(useDragStore.getState().activeId).toBeNull();
    fireEvent.touchEnd(nam, touch(20, 0));

    fireEvent.touchStart(nam, touch(0, 0));
    act(() => vi.advanceTimersByTime(399));
    expect(useDragStore.getState().activeId).toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(useDragStore.getState().activeId).toBe(SON);
    // The finger's place now, not where the swipe before it ended.
    expect(useDragStore.getState().pointer).toEqual({ x: 0, y: 0 });
    fireEvent.touchEnd(nam, touch(0, 0));
  });

  it('opens no card menu on a touch long press', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.useFakeTimers();
    const down = pointerDown(nam, 'touch');
    expect(down.defaultPrevented).toBe(true);
    act(() => vi.advanceTimersByTime(800));
    fireEvent.contextMenu(nam);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('still opens the card menu from the keyboard after a touch, and on a mouse right-click', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    expect(pointerDown(nam, 'mouse').defaultPrevented).toBe(false);
    pointerDown(nam, 'touch');
    // Shift+F10: its keydown, then the contextmenu it brings.
    fireEvent.keyDown(nam, { key: 'F10', code: 'F10', shiftKey: true });
    fireEvent.contextMenu(nam);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    pointerDown(nam, 'touch');
    pointerDown(nam, 'mouse');
    fireEvent.contextMenu(nam);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('pans the board with a swipe that starts on a card, but not under a lifted card', async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.spyOn(board(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );
    const start = viewportOf(board());
    pointerDown(nam, 'touch');
    fireEvent.touchStart(nam, touch(400, 300));
    fireEvent.touchMove(nam, touch(440, 300));
    fireEvent.touchEnd(nam, touch(440, 300));
    expect(useDragStore.getState().activeId).toBeNull();
    const swiped = viewportOf(board());
    expect(swiped.x).toBeCloseTo(start.x + 40, 3);

    vi.useFakeTimers();
    pointerDown(nam, 'touch');
    fireEvent.touchStart(nam, touch(400, 300));
    act(() => vi.advanceTimersByTime(TOUCH_DELAY_MS));
    expect(useDragStore.getState().activeId).toBe(SON);
    fireEvent.touchMove(nam, touch(440, 300));
    // The finger moves the drag, not the board.
    expect(useDragStore.getState().pointer).toEqual({ x: 440, y: 300 });
    expect(viewportOf(board())).toEqual(swiped);
    fireEvent.touchEnd(nam, touch(440, 300));
  });

  it('drops where the finger is: a loose photo on the bottom third of a card', async () => {
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    vi.spyOn(wrapperOf('Nguyễn Văn Nam'), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 100, width: 100, height: 150 }),
    );
    const binh = card('Trần Văn Bình');
    vi.useFakeTimers();
    fireEvent.touchStart(binh, touch(0, 0));
    act(() => vi.advanceTimersByTime(400));
    expect(useDragStore.getState().activeId).toBe(LOOSE);
    fireEvent.touchMove(binh, touch(150, 240));
    vi.useRealTimers();
    await waitFor(() => expect(useDragStore.getState().zone).toBe('child'));
    fireEvent.touchEnd(binh, touch(150, 240));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0]).map((op) => op.type)).toEqual(['addUnion', 'setParents']);
  });
});
