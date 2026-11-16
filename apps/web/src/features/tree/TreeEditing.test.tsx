import type { TreeResponse } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createQueryClient } from '../../app/providers';
import { routes } from '../../app/routes';
import { apiErrorReply, mockApi, UNAUTHENTICATED_REPLY, type MockRoutes } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute, renderWithProviders } from '../../test/render';
import {
  CLAN,
  CLAN_ID,
  EMPTY_TREE_RESPONSE,
  FAMILY,
  fixturePerson,
  GRANDMA,
  GRANDPA,
  LOOSE,
  ME,
  PARENTS_UNION,
  SISTER,
  SON,
  treeRoutes,
} from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree, OPS } from './testKit';

const SECOND_WIFE = '64b7f0c2a1b2c3d4e5f6a004';
const SECOND_UNION = '64b7f0c2a1b2c3d4e5f6b002';
const NAM_ALONE_UNION = '64b7f0c2a1b2c3d4e5f6b003';
const GRANDCHILD = '64b7f0c2a1b2c3d4e5f6a005';

/** The id of the person or union an op adds. */
function idOf(op: Op | undefined): string | undefined {
  return op?.type === 'addPerson' || op?.type === 'addUnion' ? op.payload.id : undefined;
}

/** The Polaroid beside a card button, under it; it is hidden from screen readers. */
function figureOf(button: HTMLElement): HTMLElement {
  const figure = button.parentElement?.querySelector('figure');
  if (!figure) throw new Error('no Polaroid in the card');
  return figure;
}

/** Opens the person's profile from their card; its actions replace P5's actions dialog. */
async function openActions(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: cardName(name) }));
  return screen.getByRole('complementary', { name });
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

describe('editing the tree', () => {
  it('shows no editing controls to a viewer', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const profile = await openActions(user, 'Nguyễn Văn Nam');
    expect(within(profile).queryByRole('button', { name: 'Thêm con' })).not.toBeInTheDocument();
    expect(
      within(profile).queryByRole('button', { name: 'Xoá người này' }),
    ).not.toBeInTheDocument();
  });

  it('offers a viewer no way to add the first person', async () => {
    editableTree(EMPTY_TREE_RESPONSE, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    expect(await screen.findByText('Chưa có ai trong cây gia phả này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm người đầu tiên' })).not.toBeInTheDocument();
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
    const tray = screen.getByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByText('Lê Thị Hoa')).toBeInTheDocument();
    // The button that opened the form is gone: focus goes to the new person's card.
    await waitFor(() => expect(card('Lê Thị Hoa')).toHaveFocus());
    await waitFor(() => expect(screen.getByText('Đã lưu')).toHaveAttribute('role', 'status'));
    expect(sent()).toEqual([
      {
        baseVersion: 0,
        expectedUserId: ME.id,
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

  it('adds a person with dates of birth and death, in one op', async () => {
    const user = userEvent.setup();
    const sent = editableTree(EMPTY_TREE_RESPONSE, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: 'Thêm người đầu tiên' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm người đầu tiên' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Văn Cả');

    const birth = within(dialog).getByRole('group', { name: 'Ngày sinh' });
    await user.click(within(birth).getByRole('radio', { name: 'Chỉ biết năm' }));
    await user.type(within(birth).getByLabelText('Năm'), '1931');
    // The date of death is asked only once "Đã mất" is chosen.
    expect(within(dialog).queryByRole('group', { name: 'Ngày mất' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Đã mất' }));
    const death = within(dialog).getByRole('group', { name: 'Ngày mất' });
    await user.type(within(death).getByLabelText('Ngày'), '15');
    await user.type(within(death).getByLabelText('Tháng'), '10');
    await user.type(within(death).getByLabelText('Năm'), '1990');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    const [request] = sent() as { op: Op }[];
    expect(request?.op).toMatchObject({
      type: 'addPerson',
      payload: {
        fullName: 'Lê Văn Cả',
        birth: { source: 'approx', approxYear: 1931 },
        death: {
          isDeceased: true,
          date: { source: 'lunar', lunar: { day: 15, month: 10, year: 1990, isLeap: false } },
        },
      },
    });
  });

  it('keeps the form open on a half-typed date, and ignores a hidden date of death', async () => {
    const user = userEvent.setup();
    const sent = editableTree(EMPTY_TREE_RESPONSE, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: 'Thêm người đầu tiên' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm người đầu tiên' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Văn Cả');

    const birth = within(dialog).getByRole('group', { name: 'Ngày sinh' });
    await user.type(within(birth).getByLabelText('Năm'), '1931');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
    expect(
      await within(birth).findByText('Chỉ biết năm? Hãy chọn “Chỉ biết năm”.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(birth).getByLabelText('Ngày')).toHaveFocus());
    expect(sent()).toHaveLength(0);

    await user.clear(within(birth).getByLabelText('Năm'));
    await user.click(within(dialog).getByRole('radio', { name: 'Đã mất' }));
    await user.type(
      within(within(dialog).getByRole('group', { name: 'Ngày mất' })).getByLabelText('Ngày'),
      '15',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Còn sống' }));
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    const [request] = sent() as { op: Extract<Op, { type: 'addPerson' }> }[];
    const payload = request!.op.payload;
    expect(payload.death).toEqual({ isDeceased: false });
    expect('birth' in payload).toBe(false);
  });

  it('lets the Manager choose the progenitor from the people not yet linked', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const profile = await openActions(user, 'Trần Văn Bình');
    await user.click(within(profile).getByRole('button', { name: 'Chọn làm thuỷ tổ' }));

    expect(
      figureOf(await screen.findByRole('button', { name: 'Trần Văn Bình, đời thứ 1' })),
    ).toHaveAttribute('data-tape', 'progenitor');
    // Now the progenitor: the button goes, and focus stays in the profile.
    expect(
      within(profile).queryByRole('button', { name: 'Chọn làm thuỷ tổ' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(profile).getByRole('heading', { name: 'Trần Văn Bình' })).toHaveFocus(),
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      baseVersion: 3,
      expectedUserId: ME.id,
      op: { type: 'setProgenitor', payload: { personId: LOOSE } },
    });
  });

  it('says why the progenitor could not be chosen', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const profile = await openActions(user, 'Trần Văn Bình');
    const realApply = useTreeStore.getState().apply;
    act(() => useTreeStore.setState({ apply: () => ({ ok: false, reason: 'PERSON_NOT_FOUND' }) }));
    try {
      const choose = within(profile).getByRole('button', { name: 'Chọn làm thuỷ tổ' });
      await user.click(choose);
      expect(screen.getByRole('alert')).toHaveTextContent('Người này không còn trong cây gia phả.');
      expect(screen.getByRole('complementary', { name: 'Trần Văn Bình' })).toBeInTheDocument();
      expect(choose).toHaveFocus();
      expect(sent()).toEqual([]);

      // Another person's profile, or none: the error belonged to Bình's and goes with it.
      await user.click(screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(
        within(await openActions(user, 'Trần Văn Bình')).getByRole('button', {
          name: 'Chọn làm thuỷ tổ',
        }),
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      act(() => useTreeStore.setState({ apply: realApply }));
    }
  });

  it('resets a dialog whose person is gone, so the next one returns focus to its opener', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await openActions(user, 'Nguyễn Văn Nam');
    await user.click(within(nam).getByRole('button', { name: 'Thêm con' }));
    expect(screen.getByRole('dialog', { name: 'Thêm con của Nguyễn Văn Nam' })).toBeInTheDocument();
    // Nam leaves the tree while his form is open (for example by a reload after a conflict).
    act(() => {
      useTreeStore.setState((state) => {
        const { [SON]: _gone, ...persons } = state.tree.persons;
        return { tree: { ...state.tree, persons } };
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const tu = await openActions(user, 'Nguyễn Văn Tư');
    const addSpouse = within(tu).getByRole('button', { name: 'Thêm vợ/chồng' });
    await user.click(addSpouse);
    const form = screen.getByRole('dialog', { name: 'Thêm vợ/chồng của Nguyễn Văn Tư' });
    await user.click(within(form).getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(addSpouse).toHaveFocus());
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
      await screen.findByRole('button', { name: 'Nguyễn Văn Út, đời thứ 3' }),
    ).toBeInTheDocument();
    // Focus is back on the profile's button that opened the form.
    await waitFor(() =>
      expect(within(actions).getByRole('button', { name: 'Thêm con' })).toHaveFocus(),
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    // Nam had no marriage yet: a one-parent union and the child in it, as one change.
    const ops = batchOps(sent()[0]);
    expect(ops).toHaveLength(2);
    const [union, child] = ops;
    expect(union).toMatchObject({ type: 'addUnion', payload: { partnerIds: [SON] } });
    expect(child).toMatchObject({
      type: 'addPerson',
      payload: { fullName: 'Nguyễn Văn Út', parentUnionId: idOf(union) },
    });
  });

  it('returns focus to the profile after a form closes, and to the card after the profile', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);

    const actions = await openActions(user, 'Nguyễn Văn Nam');
    const addSpouse = within(actions).getByRole('button', { name: 'Thêm vợ/chồng' });
    await user.click(addSpouse);
    const form = screen.getByRole('dialog', { name: 'Thêm vợ/chồng của Nguyễn Văn Nam' });
    await user.click(within(form).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(addSpouse).toHaveFocus());

    const addChild = within(actions).getByRole('button', { name: 'Thêm con' });
    await user.click(addChild);
    expect(screen.getByRole('dialog', { name: 'Thêm con của Nguyễn Văn Nam' })).toBeInTheDocument();
    // Esc closes the form only, not the profile under it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
    await waitFor(() => expect(addChild).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
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
    // The chosen marriage (not the first one, the default), and no new union.
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

    expect(
      figureOf(await screen.findByRole('button', { name: 'Đỗ Thị Lan, đời thứ 2' })),
    ).toHaveAttribute('data-tape', 'in-law');
    await waitFor(() => expect(sent()).toHaveLength(1));
    // Nam had no marriage: the spouse and a new union of the two.
    const ops = batchOps(sent()[0]);
    expect(ops).toHaveLength(2);
    const [spouse, union] = ops;
    expect(spouse).toMatchObject({ type: 'addPerson', payload: { fullName: 'Đỗ Thị Lan' } });
    expect(union).toMatchObject({
      type: 'addUnion',
      payload: { partnerIds: [SON, idOf(spouse)], status: 'married' },
    });
  });

  it('fills a one-parent marriage when a spouse is added', async () => {
    const user = userEvent.setup();
    const alone: TreeResponse = {
      ...FAMILY,
      persons: [
        ...FAMILY.persons,
        fixturePerson(GRANDCHILD, 'Nguyễn Văn Sáu', { parentUnionId: NAM_ALONE_UNION }),
      ],
      unions: [
        ...FAMILY.unions,
        { id: NAM_ALONE_UNION, partnerIds: [SON], order: 1, status: 'married' },
      ],
    };
    const sent = editableTree(alone, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Nam');
    await user.click(within(actions).getByRole('button', { name: 'Thêm vợ/chồng' }));
    const form = screen.getByRole('dialog', { name: 'Thêm vợ/chồng của Nguyễn Văn Nam' });
    await user.type(within(form).getByLabelText('Họ và tên'), 'Đỗ Thị Lan');
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    await waitFor(() => expect(sent()).toHaveLength(1));
    const ops = batchOps(sent()[0]);
    expect(ops).toHaveLength(2);
    const [spouse, link] = ops;
    expect(spouse).toMatchObject({ type: 'addPerson', payload: { fullName: 'Đỗ Thị Lan' } });
    expect(link).toEqual({
      type: 'updateUnion',
      payload: { id: NAM_ALONE_UNION, changes: { partnerIds: [SON, idOf(spouse)] } },
    });
  });

  it('adds a parent above the progenitor, who becomes the progenitor in the same change', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Tư');
    await user.click(within(actions).getByRole('button', { name: 'Thêm cha/mẹ' }));

    const form = screen.getByRole('dialog', { name: 'Thêm cha/mẹ của Nguyễn Văn Tư' });
    expect(
      within(form).getByRole('checkbox', { name: 'Đặt người này làm thuỷ tổ (đời thứ 1)' }),
    ).toBeChecked();
    await user.type(within(form).getByLabelText('Họ và tên'), 'Nguyễn Văn Cố');
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    expect(
      await screen.findByRole('button', { name: /^Nguyễn Văn Cố,.*đời thứ 1$/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(actions).getByRole('button', { name: 'Thêm cha/mẹ' })).toHaveFocus(),
    );
    await waitFor(() => expect(sent()).toHaveLength(1));
    const ops = batchOps(sent()[0]);
    expect(ops.at(-1)).toMatchObject({
      type: 'setProgenitor',
      payload: { personId: idOf(ops[0]) },
    });
  });

  it('adds the missing parent from the card menu, naming the siblings who share them', async () => {
    const user = userEvent.setup();
    const oneParent: TreeResponse = {
      ...FAMILY,
      persons: [
        ...FAMILY.persons,
        fixturePerson(SISTER, 'Nguyễn Thị Ba', { gender: 'female', parentUnionId: PARENTS_UNION }),
      ],
      unions: [{ id: PARENTS_UNION, partnerIds: [GRANDPA], order: 1, status: 'married' }],
    };
    const sent = editableTree(oneParent, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const namCard = await screen.findByRole('button', { name: cardName('Nguyễn Văn Nam') });
    fireEvent.contextMenu(namCard);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Thêm cha/mẹ' }));

    const form = await screen.findByRole('dialog', { name: 'Thêm cha/mẹ của Nguyễn Văn Nam' });
    expect(form).toHaveTextContent('Người này cũng sẽ là cha/mẹ của: Nguyễn Thị Ba.');
    // Grandpa is the known parent: the other one is preset.
    expect(within(form).getByRole('radio', { name: 'Nữ' })).toBeChecked();
    // Nam is not the progenitor, and an editor cannot choose one.
    expect(
      within(form).queryByRole('checkbox', { name: 'Đặt người này làm thuỷ tổ (đời thứ 1)' }),
    ).not.toBeInTheDocument();
    await user.type(within(form).getByLabelText('Họ và tên'), 'Lê Thị Hoa');
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
    await waitFor(() => expect(sent()).toHaveLength(1));
    const ops = batchOps(sent()[0]);
    expect(ops).toHaveLength(2);
    const [parent, link] = ops;
    expect(parent).toMatchObject({
      type: 'addPerson',
      payload: { fullName: 'Lê Thị Hoa', gender: 'female' },
    });
    expect(link).toEqual({
      type: 'updateUnion',
      payload: { id: PARENTS_UNION, changes: { partnerIds: [GRANDPA, idOf(parent)] } },
    });
  });

  it('adds no parent when both became known while the form was open, and keeps the form', async () => {
    const user = userEvent.setup();
    const oneParent: TreeResponse = {
      ...FAMILY,
      unions: [{ id: PARENTS_UNION, partnerIds: [GRANDPA], order: 1, status: 'married' }],
    };
    const sent = editableTree(oneParent);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const actions = await openActions(user, 'Nguyễn Văn Nam');
    await user.click(within(actions).getByRole('button', { name: 'Thêm cha/mẹ' }));
    const form = screen.getByRole('dialog', { name: 'Thêm cha/mẹ của Nguyễn Văn Nam' });
    await user.type(within(form).getByLabelText('Họ và tên'), 'Đỗ Thị Lan');
    // Meanwhile Nam's mother is filled in (here, as another change of this device).
    act(() => {
      useTreeStore.getState().apply({
        type: 'updateUnion',
        payload: { id: PARENTS_UNION, changes: { partnerIds: [GRANDPA, GRANDMA] } },
      });
    });
    await user.click(within(form).getByRole('button', { name: 'Thêm vào cây' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Cây gia phả vừa có thay đổi mới. Hãy xem lại rồi thử lại.',
    );
    expect(within(form).getByLabelText('Họ và tên')).toHaveValue('Đỗ Thị Lan');
    // Nam keeps both parents: no new union took him away from them.
    expect(useTreeStore.getState().tree.persons[SON]?.parentUnionId).toBe(PARENTS_UNION);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({ op: { type: 'updateUnion' } });
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
    await waitFor(() =>
      expect(within(actions).getByRole('button', { name: 'Xoá người này' })).toHaveFocus(),
    );

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
      expectedUserId: ME.id,
      op: { type: 'deletePerson', payload: { id: LOOSE } },
    });
    expect(screen.queryByRole('region', { name: 'Ảnh chưa dán' })).not.toBeInTheDocument();
    // The person, their profile and their card are gone: focus goes to the start of the page
    // content, and no notice says the profile closed (the user deleted them).
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByText(/hồ sơ đã đóng/)).not.toBeInTheDocument();
  });
});

describe('unsent changes', () => {
  const OTHER_ID = '64b7f0c2a1b2c3d4e5f60002';
  const OTHER_CLAN = { ...CLAN, id: OTHER_ID, name: 'Họ Trần' };
  const OTHER_USER = { ...ME, id: '64b7f0c2a1b2c3d4e5f60719', name: 'Tuấn' };
  const ASK = 'Mở cây gia phả khác?';

  /** The app around an empty family tree; by default the POST never answers. */
  function unsentApp(
    post: MockRoutes[string] = () => new Promise(() => undefined),
    extra: MockRoutes = {},
  ) {
    return mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE, EDITOR),
      [OPS]: post,
      'GET /clans': () => ({ body: [EDITOR, OTHER_CLAN] }),
      [`GET /clans/${OTHER_ID}`]: () => ({ body: OTHER_CLAN }),
      [`GET /clans/${OTHER_ID}/tree`]: () => ({ body: FAMILY }),
      [`GET /clans/${CLAN_ID}/members`]: () => ({ body: [] }),
      'POST /auth/logout': () => ({ status: 204 }),
      ...extra,
    });
  }

  /** A POST that is accepted when the test releases it. */
  function heldPost() {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const post: MockRoutes[string] = async () => {
      await held;
      return { body: { seq: 1 } };
    };
    return { post, release: () => release() };
  }

  async function addFirstPerson(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Thêm người đầu tiên' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm người đầu tiên' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Thị Hoa');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào cây' }));
  }

  /** From the tree page: the list of family trees (never asked), then the other tree. */
  async function openOtherTree(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('link', { name: 'Cây gia phả' }));
    await user.click(await screen.findByRole('link', { name: 'Họ Trần' }));
  }

  function beforeUnloadPrevented(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  const pendingCount = () => useTreeStore.getState().pending.length;

  it('asks before another family tree opens, and stays or opens it as chosen', async () => {
    const user = userEvent.setup();
    const api = unsentApp();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await openOtherTree(user);
    const ask = screen.getByRole('dialog', { name: ASK });
    expect(ask).toHaveTextContent(
      'Còn 1 thay đổi chưa lưu ở cây gia phả bạn vừa sửa. Mở cây khác thì các thay đổi này sẽ bị bỏ.',
    );
    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Họ Trần' })).toBeInTheDocument();
    expect(pendingCount()).toBe(1);

    await user.click(screen.getByRole('link', { name: 'Họ Trần' }));
    await user.click(
      within(screen.getByRole('dialog', { name: ASK })).getByRole('button', {
        name: 'Bỏ thay đổi và mở',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Họ Trần' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The user chose to drop the change: no notice says so a second time.
    expect(screen.queryByText(/đã bị bỏ/)).not.toBeInTheDocument();
    expect(useTreeStore.getState()).toMatchObject({ clanId: OTHER_ID, pending: [] });
    expect(beforeUnloadPrevented()).toBe(false);
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('stays when the question is dismissed with Escape', async () => {
    const user = userEvent.setup();
    unsentApp();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await openOtherTree(user);
    expect(screen.getByRole('dialog', { name: ASK })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Họ Trần' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Họ Trần' })).toHaveFocus());
    expect(pendingCount()).toBe(1);
  });

  it('stops and keeps the change when this tab is signed in as another account', async () => {
    const user = userEvent.setup();
    unsentApp(() => apiErrorReply('IDENTITY_MISMATCH', 409));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'trang này giờ đang đăng nhập bằng một tài khoản khác',
    );
    expect(screen.getByText('Chưa lưu: cần đăng nhập lại')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toBeInTheDocument();
    expect(pendingCount()).toBe(1);
  });

  it('opens the other tree when the change is saved while the question is open', async () => {
    const user = userEvent.setup();
    const { post, release } = heldPost();
    unsentApp(post);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await openOtherTree(user);
    expect(screen.getByRole('dialog', { name: ASK })).toBeInTheDocument();
    release();
    expect(
      await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/đã bị bỏ/)).not.toBeInTheDocument();
  });

  it('asks before the history of another family tree opens, and stays when told to', async () => {
    const user = userEvent.setup();
    unsentApp();
    const router = createMemoryRouter(routes, { initialEntries: [`/clans/${CLAN_ID}/tree`] });
    renderWithProviders(<RouterProvider router={router} />);
    await addFirstPerson(user);

    await act(() => router.navigate(`/clans/${OTHER_ID}/history`));
    const ask = await screen.findByRole('dialog', { name: ASK });
    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(router.state.location.pathname).toBe(`/clans/${CLAN_ID}/tree`);
    expect(pendingCount()).toBe(1);
  });

  it('does not ask when going from the tree tab to the history tab of the same tree', async () => {
    const user = userEvent.setup();
    unsentApp(undefined, {
      [`GET /clans/${CLAN_ID}/history`]: () => ({ body: { entries: [], nextBefore: null } }),
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await user.click(screen.getByRole('link', { name: 'Lịch sử' }));
    expect(await screen.findByRole('heading', { name: 'Lịch sử thay đổi' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pendingCount()).toBe(1);
  });

  it('does not ask when nothing is unsent', async () => {
    const user = userEvent.setup();
    unsentApp();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: 'Thêm người đầu tiên' });

    await openOtherTree(user);
    expect(
      await screen.findByRole('button', { name: 'Nguyễn Văn Nam, đời thứ 2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps sending while another page is open, and guards the tab meanwhile', async () => {
    const user = userEvent.setup();
    const { post, release } = heldPost();
    unsentApp(post);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await user.click(screen.getByRole('link', { name: 'Thành viên' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Thành viên' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The tree page is gone; the tab still asks before closing.
    expect(beforeUnloadPrevented()).toBe(true);

    release();
    await waitFor(() => expect(pendingCount()).toBe(0));
    expect(useTreeStore.getState().confirmedVersion).toBe(1);
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it('lets the expired-session sign-in link through, and sends the change after signing in', async () => {
    const user = userEvent.setup();
    let posts = 0;
    unsentApp(
      () => {
        posts += 1;
        return posts === 1 ? UNAUTHENTICATED_REPLY : { body: { seq: 1 } };
      },
      { 'POST /auth/login': () => ({ body: ME }) },
    );
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    await user.click(await screen.findByRole('link', { name: 'Đăng nhập lại' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pendingCount()).toBe(1);

    await user.type(screen.getByLabelText('Email'), ME.email);
    await user.type(screen.getByLabelText('Mật khẩu'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    // Back on the tree as the same user: the kept change is sent.
    await waitFor(() => expect(screen.getByText('Đã lưu')).toHaveAttribute('role', 'status'));
    expect(pendingCount()).toBe(0);
    expect(posts).toBe(2);
  });

  it('asks before signing out with unsent changes, then empties the queue', async () => {
    const user = userEvent.setup();
    const api = unsentApp();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);
    const loggedOut = () => api.calls.some((call) => call.path === '/auth/logout');

    const signOut = screen.getByRole('button', { name: 'Đăng xuất' });
    await user.click(signOut);
    const ask = screen.getByRole('dialog', { name: 'Đăng xuất?' });
    expect(ask).toHaveTextContent(
      'Còn 1 thay đổi chưa lưu. Đăng xuất thì các thay đổi này sẽ bị bỏ.',
    );
    await user.click(within(ask).getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(signOut).toHaveFocus());
    expect(loggedOut()).toBe(false);
    expect(pendingCount()).toBe(1);

    await user.click(signOut);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Đăng xuất?' })).getByRole('button', {
        name: 'Vẫn đăng xuất',
      }),
    );
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(loggedOut()).toBe(true);
    // The tree page, still open for a moment, may load its tree again; the changes are gone.
    expect(pendingCount()).toBe(0);
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it('empties the queue before the logout request is sent', async () => {
    const user = userEvent.setup();
    let pendingAtLogout: number | undefined;
    unsentApp(undefined, {
      'POST /auth/logout': () => {
        pendingAtLogout = pendingCount();
        return { status: 204 };
      },
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Đăng xuất?' })).getByRole('button', {
        name: 'Vẫn đăng xuất',
      }),
    );
    await screen.findByRole('link', { name: 'Đăng nhập' });
    expect(pendingAtLogout).toBe(0);
  });

  it('empties the queue when another account signs in, but not for the same account', async () => {
    const user = userEvent.setup();
    unsentApp();
    const queryClient = createQueryClient();
    renderRoute(`/clans/${CLAN_ID}/tree`, queryClient);
    await addFirstPerson(user);

    // The session ends and the same person signs in again: the change waits for them.
    act(() => queryClient.setQueryData(['me'], null));
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    act(() => queryClient.setQueryData(['me'], ME));
    expect(await screen.findByText(ME.name)).toBeInTheDocument();
    expect(pendingCount()).toBe(1);

    act(() => queryClient.setQueryData(['me'], OTHER_USER));
    expect(await screen.findByText(OTHER_USER.name)).toBeInTheDocument();
    expect(useTreeStore.getState()).toMatchObject({ clanId: null, pending: [] });
    // Nobody asked the user: the notice, on whatever page is open, says how many were dropped.
    expect(screen.getByRole('alert')).toHaveTextContent('1 thay đổi chưa lưu đã bị bỏ.');
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it('tells the user when another account signs in over a tree page that stays open', async () => {
    const user = userEvent.setup();
    unsentApp();
    const queryClient = createQueryClient();
    renderRoute(`/clans/${CLAN_ID}/tree`, queryClient);
    await addFirstPerson(user);

    act(() => queryClient.setQueryData(['me'], OTHER_USER));
    expect(await screen.findByText(OTHER_USER.name)).toBeInTheDocument();
    await vi.waitFor(() => expect(useTreeStore.getState().status).toBe('ready'));
    expect(screen.getByRole('alert')).toHaveTextContent('1 thay đổi chưa lưu đã bị bỏ.');
  });

  it('sends the kept change when the same account signs in again after a 401', async () => {
    const user = userEvent.setup();
    let signedIn = false;
    let posts = 0;
    unsentApp(() => {
      posts += 1;
      return signedIn ? { body: { seq: 1 } } : UNAUTHENTICATED_REPLY;
    });
    const queryClient = createQueryClient();
    renderRoute(`/clans/${CLAN_ID}/tree`, queryClient);
    await addFirstPerson(user);
    await vi.waitFor(() => expect(useTreeStore.getState().signedOut).toBe(true));

    act(() => queryClient.setQueryData(['me'], null));
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    signedIn = true;
    act(() => queryClient.setQueryData(['me'], ME));
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
    expect(useTreeStore.getState()).toMatchObject({ signedOut: false, notice: null });
    expect(posts).toBe(2);
  });

  it('keeps guarding changes after the tree became unavailable', async () => {
    const user = userEvent.setup();
    let reads = 0;
    unsentApp(() => ({ body: { saved: true } }), {
      [`GET /clans/${CLAN_ID}/tree`]: () => {
        reads += 1;
        return reads === 1 ? { body: EMPTY_TREE_RESPONSE } : apiErrorReply('FORBIDDEN', 403);
      },
    });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await addFirstPerson(user);

    // An answer that cannot be read reloads the tree, and the reload is refused: the change is kept, unsent.
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(pendingCount()).toBe(1);
    expect(beforeUnloadPrevented()).toBe(true);
    await openOtherTree(user);
    expect(screen.getByRole('dialog', { name: ASK })).toBeInTheDocument();
  });

  it('asks the browser before closing the tab only while changes are unsent', async () => {
    const user = userEvent.setup();
    unsentApp();
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
