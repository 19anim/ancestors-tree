import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLICK_AFTER_DROP_MS, useDragStore, resetDrag } from './dragStore';
import { zoneResults } from './dragZones';
import { CLAN, CLAN_ID, FAMILY, GRANDPA, LOOSE, ME, SON } from './fixtures';
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
