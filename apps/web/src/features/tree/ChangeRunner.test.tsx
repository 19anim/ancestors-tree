import type { TreeResponse } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute, renderWithProviders } from '../../test/render';
import { useChangeRunner, type ChangeDone, type ChangeRequest } from './ChangeRunner';
import { CLAN_ID, FAMILY, fixturePerson, GRANDMA, LOOSE, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, cardName, EDITOR, editableTree } from './testKit';

const FIRST_WIFE = '64b7f0c2a1b2c3d4e5f6a0d1';
const SECOND_WIFE = '64b7f0c2a1b2c3d4e5f6a0d2';
const FIRST_UNION = '64b7f0c2a1b2c3d4e5f6b0d1';
const SECOND_UNION = '64b7f0c2a1b2c3d4e5f6b0d2';
const LOOSE_ALONE = '64b7f0c2a1b2c3d4e5f6b0d3';

/** FAMILY, where Nam married twice: "Bình is Nam's child" asks with whom. */
const TWO_WIVES: TreeResponse = {
  ...FAMILY,
  persons: [
    ...FAMILY.persons,
    fixturePerson(FIRST_WIFE, 'Phan Thị Mai', { gender: 'female' }),
    fixturePerson(SECOND_WIFE, 'Vũ Thị Đào', { gender: 'female' }),
  ],
  unions: [
    ...FAMILY.unions,
    { id: FIRST_UNION, partnerIds: [SON, FIRST_WIFE], order: 1, status: 'married' },
    { id: SECOND_UNION, partnerIds: [SON, SECOND_WIFE], order: 2, status: 'married' },
  ],
};

const CHILD_OF_NAM: ChangeRequest = {
  change: { kind: 'relate', personId: LOOSE, targetId: SON, relation: 'child' },
  focusPersonId: LOOSE,
};
const QUESTION = 'Trần Văn Bình là con của Nguyễn Văn Nam với ai?';
const WITH_MAI = 'Con của Nguyễn Văn Nam và Phan Thị Mai';
const OUT_OF_DATE = 'Cây gia phả vừa có thay đổi mới. Hãy xem lại rồi thử lại.';

/** Something outside the tree page that asks the runner for a change, as Tasks 6–8 will. */
function Harness({ request }: { request: () => ChangeRequest }) {
  const { requestChange, element } = useChangeRunner();
  return (
    <>
      <button type="button" onClick={() => requestChange(request())}>
        Đổi thử
      </button>
      {element}
    </>
  );
}

/** The tree page (it loads the tree and draws the cards) and the harness beside it. */
async function openWith(request: () => ChangeRequest, tree: TreeResponse = TWO_WIVES) {
  const sent = editableTree(tree, EDITOR);
  renderRoute(`/clans/${CLAN_ID}/tree`);
  await screen.findByRole('button', { name: cardName('Nguyễn Văn Nam') });
  renderWithProviders(<Harness request={request} />);
  return { sent, trigger: screen.getByRole('button', { name: 'Đổi thử' }) };
}

function applyHere(op: Op) {
  act(() => void useTreeStore.getState().apply(op));
}

async function nextFrame() {
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
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

describe('the change runner', () => {
  it('asks, applies the answer in one op, confirms it and focuses the card', async () => {
    const user = userEvent.setup();
    const { sent, trigger } = await openWith(() => CHILD_OF_NAM);
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: QUESTION });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      WITH_MAI,
      'Con của Nguyễn Văn Nam và Vũ Thị Đào',
      'Chỉ con của Nguyễn Văn Nam',
      'Thôi, không đổi',
      '',
    ]);

    await user.click(within(dialog).getByRole('button', { name: WITH_MAI }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Nam và Phan Thị Mai'),
    ).toBeInTheDocument();
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBe(FIRST_UNION);
    await waitFor(() => expect(card('Trần Văn Bình')).toHaveFocus());
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setParents', payload: { personId: LOOSE, parentUnionId: FIRST_UNION } },
    ]);

    // Dismissed from the keyboard's place on it: focus goes back to the card, not the page.
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByRole('button', { name: 'Đóng thông báo' })).not.toBeInTheDocument();
    await waitFor(() => expect(card('Trần Văn Bình')).toHaveFocus());
  });

  it('applies nothing when the tree changed while the question was open', async () => {
    const user = userEvent.setup();
    const { trigger } = await openWith(() => CHILD_OF_NAM);
    await user.click(trigger);
    // Meanwhile Bình became Nam and Mai's child some other way: the answer now finds it done.
    applyHere({ type: 'setParents', payload: { personId: LOOSE, parentUnionId: FIRST_UNION } });
    await user.click(screen.getByRole('button', { name: WITH_MAI }));
    expect(screen.getByRole('alert')).toHaveTextContent(OUT_OF_DATE);
    expect(useTreeStore.getState().undoStack).toHaveLength(1);
  });

  it('compares the answer with the tree the question was asked on', async () => {
    const user = userEvent.setup();
    let seen = useTreeStore.getState().tree;
    const { trigger } = await openWith(() => ({ ...CHILD_OF_NAM, seenTree: seen }));
    seen = useTreeStore.getState().tree;
    // Before the drop, Bình became Hoa's father: the same question, but this answer would now
    // make him his own ancestor.
    applyHere({
      type: 'batch',
      payload: {
        ops: [
          {
            type: 'addUnion',
            payload: { id: LOOSE_ALONE, partnerIds: [LOOSE], order: 1, status: 'married' },
          },
          { type: 'setParents', payload: { personId: GRANDMA, parentUnionId: LOOSE_ALONE } },
        ],
      },
    });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: QUESTION })).toBeInTheDocument();
    // While it is open, that link goes again: the answer works on the latest tree, but not on
    // the one the question was asked on, so the user has not seen this outcome.
    applyHere({ type: 'setParents', payload: { personId: GRANDMA, parentUnionId: null } });
    await user.click(screen.getByRole('button', { name: WITH_MAI }));
    expect(screen.getByRole('alert')).toHaveTextContent(OUT_OF_DATE);
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBeUndefined();
    expect(useTreeStore.getState().undoStack).toHaveLength(2);
  });

  it('says why a change is blocked, again each time, and keeps focus when dismissed', async () => {
    const user = userEvent.setup();
    const { trigger } = await openWith(() => ({ change: { kind: 'cutThread', childId: LOOSE } }));
    await user.click(trigger);
    const first = screen.getByRole('alert');
    expect(first).toHaveTextContent('Không đổi được: Quan hệ này đã có rồi.');
    await nextFrame();
    expect(trigger).toHaveFocus();

    // The same message again is a new alert, so it is announced again.
    await user.click(trigger);
    const second = screen.getByRole('alert');
    expect(second).toHaveTextContent('Không đổi được: Quan hệ này đã có rồi.');
    expect(second).not.toBe(first);

    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('changes nothing on "Thôi, không đổi" and gives focus back', async () => {
    const user = userEvent.setup();
    // No card to focus (a drop names one): back to what opened it.
    const { sent, trigger } = await openWith(() => ({ change: CHILD_OF_NAM.change }));
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Thôi, không đổi' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useTreeStore.getState().undoStack).toHaveLength(0);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(sent()).toHaveLength(0);
  });

  it('keeps focus when the toast’s Undo goes away under it (Ctrl+Z)', async () => {
    const user = userEvent.setup();
    const { trigger } = await openWith(() => CHILD_OF_NAM);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: WITH_MAI }));
    await waitFor(() => expect(card('Trần Văn Bình')).toHaveFocus());
    const undo = screen.getByRole('button', { name: 'Hoàn tác thay đổi này' });
    act(() => undo.focus());

    await user.keyboard('{Control>}z{/Control}');
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBeUndefined();
    expect(undo).not.toBeInTheDocument();
    // Bình is back in the tray: focus goes to his card there.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-person-open', LOOSE));
  });
  it('reports an applied change to its asker, with an Undo for it', async () => {
    const user = userEvent.setup();
    const done = vi.fn<(done: ChangeDone) => void>();
    const { trigger } = await openWith(() => ({ ...CHILD_OF_NAM, onDone: done }));
    // Not made (cancelled, then blocked): nothing to report.
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Thôi, không đổi' }));
    expect(done).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: WITH_MAI }));
    expect(done).toHaveBeenCalledTimes(1);
    const [report] = done.mock.calls[0] ?? [];
    expect(report?.text).toBe('Đã đổi: Trần Văn Bình thành con của Nguyễn Văn Nam và Phan Thị Mai');
    expect(report?.op).toBe(useTreeStore.getState().undoStack.at(-1)?.op);

    await user.click(trigger);
    expect(screen.getByRole('alert')).toHaveTextContent('Không đổi được');
    expect(done).toHaveBeenCalledTimes(1);

    // Its Undo is the toast's: one undo step, and the toast goes.
    act(() => report?.undo());
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBeUndefined();
    expect(useTreeStore.getState().undoStack).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Hoàn tác thay đổi này' })).not.toBeInTheDocument();
    // Only while it is the latest change: later, it would undo someone else's edit.
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: WITH_MAI }));
    const [, [later] = []] = done.mock.calls;
    applyHere({
      type: 'updatePerson',
      payload: { id: SON, changes: { fullName: 'Nguyễn Văn Nam Anh' } },
    });
    act(() => later?.undo());
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Nam Anh');
    expect(useTreeStore.getState().tree.persons[LOOSE]?.parentUnionId).toBe(FIRST_UNION);
  });
  it('reports a change that is not made to its asker, with the message', async () => {
    const user = userEvent.setup();
    const failed = vi.fn<(text: string) => void>();
    const { trigger } = await openWith(() => ({
      change: { kind: 'cutThread', childId: LOOSE },
      onFailed: failed,
    }));
    await user.click(trigger);
    expect(failed).toHaveBeenCalledExactlyOnceWith('Không đổi được: Quan hệ này đã có rồi.');
  });
});
