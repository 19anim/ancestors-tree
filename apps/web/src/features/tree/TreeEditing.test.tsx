import type { TreeResponse } from '@ancestors-tree/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import {
  CLAN,
  CLAN_ID,
  EMPTY_TREE_RESPONSE,
  FAMILY,
  fixturePerson,
  GRANDPA,
  LOOSE,
  treeRoutes,
} from './fixtures';
import { resetTreeStore } from './store';

const OPS = `POST /clans/${CLAN_ID}/ops`;
const EDITOR = { ...CLAN, role: 'editor' as const };
const SECOND_WIFE = '64b7f0c2a1b2c3d4e5f6a004';
const SECOND_UNION = '64b7f0c2a1b2c3d4e5f6b002';

/** Mocks the tree and accepts every op; returns the ops the page sent. */
function editableTree(tree: TreeResponse, clan = CLAN) {
  let seq = tree.version;
  const api = mockApi({
    ...treeRoutes(tree, clan),
    [OPS]: () => {
      seq += 1;
      return { body: { seq } };
    },
  });
  return () => api.calls.filter((call) => call.method === 'POST').map((call) => call.body);
}

async function openActions(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Thao tác với ${name}` }));
  return screen.getByRole('dialog', { name });
}

beforeEach(() => {
  mockReactFlow();
  resetTreeStore();
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('editing the tree', () => {
  it('shows no editing controls to a viewer', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    expect(
      await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Thao tác với/ })).not.toBeInTheDocument();
  });

  it('adds the first person', async () => {
    const user = userEvent.setup();
    const sent = editableTree(EMPTY_TREE_RESPONSE, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: 'Thêm người đầu tiên' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm người đầu tiên' });

    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(within(dialog).getByLabelText('Họ và tên')).toHaveAttribute('aria-invalid', 'true');

    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Thị Hoa');
    await user.click(within(dialog).getByRole('radio', { name: 'Nữ' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Đã mất' }));
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const tray = screen.getByRole('region', { name: 'Chưa nối vào cây' });
    expect(within(tray).getByText('Lê Thị Hoa')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Đã lưu')).toHaveAttribute('role', 'status'));
    expect(sent()).toEqual([
      {
        baseVersion: 0,
        op: {
          type: 'addPerson',
          payload: expect.objectContaining({
            fullName: 'Lê Thị Hoa',
            gender: 'female',
            death: { isDeceased: true },
          }),
        },
      },
    ]);
  });

  it('lets the Manager choose the progenitor from the people not yet linked', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const dialog = await openActions(user, 'Trần Văn Bình');
    await user.click(within(dialog).getByRole('button', { name: 'Chọn làm thuỷ tổ' }));

    expect(await screen.findByRole('figure', { name: 'Trần Văn Bình, đời thứ 1' })).toHaveAttribute(
      'data-tape',
      'progenitor',
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      baseVersion: 3,
      op: { type: 'setProgenitor', payload: { personId: LOOSE } },
    });
  });

  it('lets an editor add a child from a card, but not choose the progenitor', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Nam');
    expect(within(actions).queryByRole('button', { name: 'Chọn làm thuỷ tổ' })).toBeNull();
    await user.click(within(actions).getByRole('button', { name: 'Thêm con' }));

    const form = screen.getByRole('dialog', { name: 'Thêm con của Nguyễn Văn Nam' });
    await user.type(within(form).getByLabelText('Họ và tên'), 'Nguyễn Văn Út');
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    expect(
      await screen.findByRole('figure', { name: 'Nguyễn Văn Út, đời thứ 3' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    // Nam had no marriage yet: a one-parent union and the child, as one change.
    expect(sent()[0]).toMatchObject({ op: { type: 'batch' } });
  });

  it('asks which marriage a child belongs to when there are several', async () => {
    const user = userEvent.setup();
    const remarried: TreeResponse = {
      ...FAMILY,
      persons: [
        ...FAMILY.persons,
        fixturePerson(SECOND_WIFE, 'Phạm Thị Mai', { gender: 'female' }),
      ],
      unions: [
        ...FAMILY.unions,
        { id: SECOND_UNION, partnerIds: [GRANDPA, SECOND_WIFE], order: 2, status: 'married' },
      ],
    };
    const sent = editableTree(remarried);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Tư');
    await user.click(within(actions).getByRole('button', { name: 'Thêm con' }));

    const form = screen.getByRole('dialog', { name: 'Thêm con của Nguyễn Văn Tư' });
    await user.type(within(form).getByLabelText('Họ và tên'), 'Nguyễn Văn Bảy');
    await user.selectOptions(
      within(form).getByLabelText('Con của'),
      'Nguyễn Văn Tư và Phạm Thị Mai',
    );
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({
      op: {
        type: 'addPerson',
        payload: { fullName: 'Nguyễn Văn Bảy', parentUnionId: SECOND_UNION },
      },
    });
  });

  it('adds a spouse beside the person', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Nam');
    await user.click(within(actions).getByRole('button', { name: 'Thêm vợ/chồng' }));

    const form = screen.getByRole('dialog', { name: 'Thêm vợ/chồng của Nguyễn Văn Nam' });
    await user.type(within(form).getByLabelText('Họ và tên'), 'Đỗ Thị Lan');
    await user.click(within(form).getByRole('radio', { name: 'Nữ' }));
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    expect(await screen.findByRole('figure', { name: 'Đỗ Thị Lan, đời thứ 2' })).toHaveAttribute(
      'data-tape',
      'in-law',
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({ op: { type: 'batch' } });
  });

  it('explains why someone cannot be deleted, and deletes someone who can be', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);

    const actions = await openActions(user, 'Lê Thị Hoa');
    await user.click(within(actions).getByRole('button', { name: 'Xoá người này' }));
    const confirm = screen.getByRole('dialog', { name: 'Xoá Lê Thị Hoa?' });
    await user.click(within(confirm).getByRole('button', { name: 'Xoá' }));
    expect(within(confirm).getByRole('alert')).toHaveTextContent('Không xoá được người còn con.');
    await user.click(within(confirm).getByRole('button', { name: 'Huỷ' }));
    expect(sent()).toEqual([]);

    const looseActions = await openActions(user, 'Trần Văn Bình');
    await user.click(within(looseActions).getByRole('button', { name: 'Xoá người này' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Xoá Trần Văn Bình?' })).getByRole('button', {
        name: 'Xoá',
      }),
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      baseVersion: 3,
      op: { type: 'deletePerson', payload: { id: LOOSE } },
    });
    expect(screen.queryByRole('region', { name: 'Chưa nối vào cây' })).not.toBeInTheDocument();
  });
});

describe('leaving the tree page with unsent changes', () => {
  /** The first POST never answers, so the change stays unsent. */
  function stuckTree() {
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, EDITOR),
      [OPS]: () => new Promise(() => undefined),
    });
  }

  async function addFirstPerson(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Thêm người đầu tiên' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm người đầu tiên' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Thị Hoa');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
  }

  function beforeUnloadPrevented(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('asks first, and stays or leaves as chosen', async () => {
    const user = userEvent.setup();
    stuckTree();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await user.click(screen.getByRole('link', { name: 'Thành viên' }));
    const ask = screen.getByRole('dialog', { name: 'Rời trang này?' });
    expect(ask).toHaveTextContent(
      'Còn thay đổi chưa lưu. Rời trang thì các thay đổi này sẽ bị bỏ.',
    );

    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cây' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'Thành viên' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Rời trang này?' })).getByRole('button', {
        name: 'Vẫn rời',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Thành viên' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
  });

  it('does not ask when nothing is unsent', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('figure', { name: 'Nguyễn Văn Nam, đời thứ 2' });

    await user.click(screen.getByRole('link', { name: 'Thành viên' }));
    expect(screen.queryByRole('dialog', { name: 'Rời trang này?' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Thành viên' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
  });

  it('asks the browser before closing the tab only while changes are unsent', async () => {
    const user = userEvent.setup();
    stuckTree();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: 'Thêm người đầu tiên' });
    expect(beforeUnloadPrevented()).toBe(false);

    await addFirstPerson(user);
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it('stops asking the browser once everything is saved', async () => {
    const user = userEvent.setup();
    editableTree(EMPTY_TREE_RESPONSE, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);
    await waitFor(() => expect(screen.getByText('Đã lưu')).toHaveAttribute('role', 'status'));
    expect(beforeUnloadPrevented()).toBe(false);
  });
});
