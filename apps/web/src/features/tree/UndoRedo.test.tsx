import type { Clan } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, GRANDPA, ME, SON, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

const EDITOR = { ...CLAN, role: 'editor' as const };
const bio: Op = { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Con trưởng' } } };

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

async function openTree() {
  renderRoute(`/clans/${CLAN_ID}/tree`);
  await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });
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
    expect(undo).toBeDisabled();
    expect(undo).toHaveAccessibleDescription('Hoàn tác (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Làm lại' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled();
  });

  it('are not shown to a viewer, who still sees the save status', async () => {
    editable({ ...CLAN, role: 'viewer' });
    await openTree();
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });
});
