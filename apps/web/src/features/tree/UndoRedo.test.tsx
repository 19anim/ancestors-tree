import type { Clan } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '../../shared/ui';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, fixturePerson, GRANDPA, ME, SON, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

const EDITOR = { ...CLAN, role: 'editor' as const };
const bio: Op = { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Con trưởng' } } };
const NEWCOMER = '64b7f0c2a1b2c3d4e5f6a00a';
const newcomer = fixturePerson(NEWCOMER, 'Phạm Văn Lộc');

function editable(clan: Clan = EDITOR) {
  let seq = FAMILY.version;
  mockApi({
    ...treeRoutes(FAMILY, clan),
    [`POST /clans/${CLAN_ID}/ops`]: () => {
      seq += 1;
      return { body: { seq } };
    },
  });
}

/** The refocus after a removing undo runs in the next frame, once React has committed. */
async function nextFrame() {
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

async function openTree() {
  renderRoute(`/clans/${CLAN_ID}/tree`);
  await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
}

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('the undo and redo buttons', () => {
  it('are disabled with nothing to undo, and say the shortcut', async () => {
    editable();
    await openTree();
    const toolbar = screen.getByRole('group', { name: 'Công cụ của cây' });
    const undo = screen.getByRole('button', { name: 'Hoàn tác' });
    expect(toolbar).toContainElement(undo);
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(undo).toHaveAccessibleDescription('Hoàn tác (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Làm lại' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('name the next undo, undo it, and redo it', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply(bio));
    expect(screen.getByText('Hoàn tác: sửa thông tin của Nguyễn Văn Nam')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Con trưởng');
    await waitFor(() => expect(useTreeStore.getState().pending).toHaveLength(0));
  });

  it('answer the keyboard, but not while typing', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply(bio));
    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBeUndefined();
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Con trưởng');

    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Con trưởng');
    field.remove();
  });

  it('say why an undo no longer applies', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() =>
      useTreeStore.setState({
        undoStack: [
          { op: bio, inverse: { type: 'deletePerson', payload: { id: GRANDPA } }, ref: { seq: 3 } },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không hoàn tác được: Không xoá được thuỷ tổ. Hãy chọn thuỷ tổ khác trước.',
    );
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('redo with Ctrl+Y', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply(bio));
    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBeUndefined();
    await user.keyboard('{Control>}y{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Con trưởng');
  });

  it('say why a redo no longer applies', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() =>
      useTreeStore.setState({
        redoStack: [{ op: { type: 'deletePerson', payload: { id: GRANDPA } }, ref: { seq: 3 } }],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Không làm lại được:');
  });

  it('clear a stale failure when the stacks change', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() =>
      useTreeStore.setState({
        undoStack: [
          { op: bio, inverse: { type: 'deletePerson', payload: { id: GRANDPA } }, ref: { seq: 3 } },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => void useTreeStore.getState().apply(bio));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stop listening to the keyboard when unmounted', async () => {
    editable();
    const view = renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' });
    act(() => void useTreeStore.getState().apply(bio));
    const before = useTreeStore.getState().undoStack.length;
    view.unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(useTreeStore.getState().undoStack).toHaveLength(before);
  });

  it('leave the key alone with nothing to undo, and take it otherwise', async () => {
    editable();
    await openTree();
    const press = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => void window.dispatchEvent(event));
      return event;
    };
    expect(press().defaultPrevented).toBe(false);
    act(() => void useTreeStore.getState().apply(bio));
    expect(press().defaultPrevented).toBe(true);
  });

  it('keep a button with nothing to do focusable, and ignore its click', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    const undo = screen.getByRole('button', { name: 'Hoàn tác' });
    for (let i = 0; i < 50 && document.activeElement !== undo; i += 1) await user.tab();
    expect(undo).toHaveFocus();
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    const before = useTreeStore.getState();
    await user.click(undo);
    expect(useTreeStore.getState().undoStack).toBe(before.undoStack);
    expect(useTreeStore.getState().redoStack).toBe(before.redoStack);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hide the tooltip on Escape while the button has focus', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    const undo = screen.getByRole('button', { name: 'Hoàn tác' });
    // jsdom has no CSS: the focus rule is the class that shows the tooltip.
    const tooltip = () => screen.getByText('Hoàn tác (Ctrl+Z)');
    act(() => undo.focus());
    expect(tooltip()).toHaveClass('group-focus-within:block');
    await user.keyboard('{Escape}');
    expect(tooltip()).not.toHaveClass('group-focus-within:block');
    expect(undo).toHaveAccessibleDescription('Hoàn tác (Ctrl+Z)');
  });

  it('keep focus when the shortcut removes the focused card', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply({ type: 'addPerson', payload: newcomer }));
    const undo = screen.getByRole('button', { name: 'Hoàn tác' });
    const card = await screen.findByRole('button', { name: /^Phạm Văn Lộc(,|$)/ });
    act(() => card.focus());
    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[NEWCOMER]).toBeUndefined();
    expect(card).not.toBeInTheDocument();
    await nextFrame();
    expect(document.activeElement).toBe(undo);
  });

  it('keep focus where it is when the shortcut leaves it in place', async () => {
    const user = userEvent.setup();
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply(bio));
    const card = screen.getByRole('button', { name: /^Trần Văn Bình(,|$)/ });
    act(() => card.focus());
    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBeUndefined();
    await nextFrame();
    expect(document.activeElement).toBe(card);
  });

  it('are not shown to a viewer, who still sees the save status', async () => {
    editable({ ...CLAN, role: 'viewer' });
    await openTree();
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });
});

describe('the shortcuts while an editing surface has focus', () => {
  async function undoable() {
    editable();
    await openTree();
    act(() => void useTreeStore.getState().apply(bio));
    await waitFor(() => expect(useTreeStore.getState().pending).toHaveLength(0));
    return {
      undo: useTreeStore.getState().undoStack.length,
      pending: useTreeStore.getState().pending.length,
    };
  }

  function expectUnchanged(before: { undo: number; pending: number }) {
    expect(useTreeStore.getState().undoStack).toHaveLength(before.undo);
    expect(useTreeStore.getState().pending).toHaveLength(before.pending);
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Con trưởng');
  }

  it('do nothing inside a dialog', async () => {
    const user = userEvent.setup();
    const before = await undoable();
    render(
      <Dialog open>
        <DialogContent title="Hộp thoại thử">
          <button type="button">Trong hộp thoại</button>
        </DialogContent>
      </Dialog>,
    );
    act(() => screen.getByRole('button', { name: 'Trong hộp thoại' }).focus());
    await user.keyboard('{Control>}z{/Control}');
    expectUnchanged(before);
  });

  it('do nothing in a textarea', async () => {
    const user = userEvent.setup();
    const before = await undoable();
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    await user.keyboard('{Control>}z{/Control}');
    expectUnchanged(before);
    field.remove();
  });

  it('do nothing in a contenteditable element', async () => {
    const user = userEvent.setup();
    const before = await undoable();
    const field = document.createElement('div');
    field.setAttribute('contenteditable', 'true');
    field.tabIndex = 0;
    document.body.append(field);
    field.focus();
    await user.keyboard('{Control>}z{/Control}');
    expectUnchanged(before);
    field.remove();
  });
});
