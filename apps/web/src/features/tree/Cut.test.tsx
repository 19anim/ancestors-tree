import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { threadBranchPath } from '../../shared/ui';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, GRANDMA, ME, PARENTS_UNION, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { batchOps, card, EDITOR, editableTree } from './testKit';

const SON_THREAD = 'Chỉ nối Nguyễn Văn Nam với cha mẹ';
const PARENTS_KNOT = 'Nút hôn nhân của Nguyễn Văn Tư và Lê Thị Hoa';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Cut on the board', () => {
  it('cuts a thread from its pin, in one op, and focuses the child in the tray', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    // Pointer-only: hidden from screen readers and not a tab stop (spec §7.6).
    const pin = await screen.findByRole('button', { name: SON_THREAD, hidden: true });
    expect(pin).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('button', { name: SON_THREAD })).not.toBeInTheDocument();
    await user.click(pin);
    await user.click(screen.getByRole('button', { name: 'Cắt chỉ' }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(batchOps(sent()[0])).toEqual([
      { type: 'setParents', payload: { personId: SON, parentUnionId: null } },
    ]);
    expect(
      screen.getByText('Đã đổi: Nguyễn Văn Nam không còn là con của Nguyễn Văn Tư và Lê Thị Hoa'),
    ).toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
  });

  it('opens Cut from the thread itself, and Escape leaves focus on the child', async () => {
    const user = userEvent.setup();
    const sent = editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const pin = await screen.findByRole('button', { name: SON_THREAD, hidden: true });
    const thread = document.querySelector<SVGPathElement>('[data-cut-target="thread"]');
    expect(thread).not.toBeNull();
    await user.click(thread!);
    expect(pin).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: SON_THREAD })).toBeInTheDocument();
    expect(document.querySelector('[data-relation="parent-child"]')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Cắt chỉ' })).not.toBeInTheDocument();
    // The pin is hidden from screen readers, so focus goes to the card beside it.
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
    expect(sent()).toHaveLength(0);
  });

  it("makes only the child's own part of the thread a target, not the trunk its siblings share", async () => {
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: SON_THREAD, hidden: true });
    const drawn = document.querySelector('[data-relation="parent-child"] path')?.getAttribute('d');
    const [, fromX, fromY, dropTo, toX, toY] = (
      /^M(\S+) (\S+) L\S+ (\S+) C\S+ \S+ \S+ \S+ (\S+) (\S+)$/.exec(drawn ?? '') ?? []
    ).map(Number);
    const hit = document.querySelector('[data-cut-target="thread"]')?.getAttribute('d');
    // Not from the knot: the run down to the branch point is every sibling's.
    expect(hit?.startsWith(`M${fromX} ${fromY} `)).toBe(false);
    expect(hit).toBe(threadBranchPath({ x: fromX!, y: fromY! }, dropTo!, { x: toX!, y: toY! }));
  });

  it('gives focus to the child when the pin is clicked again', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const pin = await screen.findByRole('button', { name: SON_THREAD, hidden: true });
    await user.click(pin);
    expect(screen.getByRole('button', { name: 'Cắt chỉ' })).toHaveFocus();
    await user.click(pin);
    expect(screen.queryByRole('button', { name: 'Cắt chỉ' })).not.toBeInTheDocument();
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
  });

  it('closes when the view moves, so it never drifts from its pin', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await screen.findByRole('button', { name: SON_THREAD, hidden: true }));
    expect(screen.getByRole('button', { name: 'Cắt chỉ' })).toBeInTheDocument();
    fireEvent.wheel(document.querySelector('.react-flow__pane')!, { deltaY: -200 });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cắt chỉ' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(card('Nguyễn Văn Nam')).toHaveFocus());
  });

  it('cuts a marriage from its knot, asking who keeps the children', async () => {
    const user = userEvent.setup();
    editableTree(FAMILY, EDITOR);
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const knot = await screen.findByRole('button', { name: PARENTS_KNOT, hidden: true });
    expect(knot).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('button', { name: PARENTS_KNOT })).not.toBeInTheDocument();
    await user.click(knot);
    await user.click(screen.getByRole('button', { name: 'Cắt chỉ' }));
    await user.click(screen.getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(useTreeStore.getState().tree.unions[PARENTS_UNION]?.partnerIds).toEqual([GRANDMA]);
    await waitFor(() => expect(card('Nguyễn Văn Tư')).toHaveFocus());
  });

  it('draws a divorced marriage as a broken stitch', async () => {
    editableTree(
      {
        ...FAMILY,
        unions: FAMILY.unions.map((union) =>
          union.id === PARENTS_UNION ? { ...union, status: 'divorced' as const } : union,
        ),
      },
      EDITOR,
    );
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: PARENTS_KNOT, hidden: true });
    expect(document.querySelector('[data-relation="marriage"]')).toHaveAttribute(
      'data-broken',
      'true',
    );
  });

  it('shows viewers no pins or knots to cut', async () => {
    editableTree(FAMILY, { ...CLAN, role: 'viewer' });
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await screen.findByRole('button', { name: /^Nguyễn Văn Nam/ });
    expect(
      screen.queryByRole('button', { name: SON_THREAD, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: PARENTS_KNOT, hidden: true }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-cut-target]')).toBeNull();
    expect(document.querySelector('[data-relation="marriage"]')).not.toHaveAttribute('data-broken');
  });
});
