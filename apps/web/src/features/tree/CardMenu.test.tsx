import type { TreeResponse } from '@ancestors-tree/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute, renderWithProviders } from '../../test/render';
import { CardMenu } from './CardMenu';
import { CLAN, CLAN_ID, FAMILY, LOOSE, ME, SON, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import { PersonActionsContext, type PersonActionsApi } from './usePersonActions';

function renderMenu(api: PersonActionsApi | null) {
  return renderWithProviders(
    <PersonActionsContext value={api}>
      <CardMenu personId="p1">
        <button type="button">Nguyễn Văn Nam, đời thứ 2</button>
      </CardMenu>
    </PersonActionsContext>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CardMenu', () => {
  it('lists the actions on right-click and runs the one chosen', async () => {
    const run = vi.fn();
    renderMenu({ actionsFor: () => ['addChild', 'addSpouse', 'delete'], run });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    const menu = await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Thêm con',
      'Thêm vợ/chồng',
      'Xoá người này',
    ]);
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Thêm con' }));
    expect(run).toHaveBeenCalledWith('p1', 'addChild');
    expect(menu).not.toBeInTheDocument();
  });

  it('opens no empty menu', () => {
    renderMenu({ actionsFor: () => [], run: vi.fn() });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('adds no menu for viewers', () => {
    renderMenu(null);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('the card menu on the board', () => {
  beforeEach(() => {
    mockReactFlow();
    signOutTreeStore();
    useTreeStore.getState().setAccount(ME.id);
  });

  afterEach(() => {
    resetTreeStore();
  });

  const cardOf = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name},`) });

  it('keeps the card a described button that opens the profile', async () => {
    const birthday: TreeResponse = {
      ...FAMILY,
      persons: FAMILY.persons.map((person) =>
        person.id === SON
          ? { ...person, birth: { source: 'solar', solar: { day: 21, month: 11, year: 1990 } } }
          : person,
      ),
    };
    mockApi(treeRoutes(birthday));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    // The menu's trigger props merge onto the button without dropping its own.
    expect(card).toHaveAttribute('data-person-open', SON);
    expect(card).toHaveAccessibleDescription('Sinh nhật 21/11');
    await user.click(card);
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
  });

  it('returns focus to the card when a dialog opened from the menu closes', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    card.focus();
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Thêm vợ/chồng' }));
    const form = await screen.findByRole('dialog', { name: 'Thêm vợ/chồng của Nguyễn Văn Nam' });
    // The form keeps focus, not the card the menu closes back to.
    await waitFor(() => expect(form).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(card).toHaveFocus());
  });

  it('closes the menu only on Escape, not the profile, back to the card', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    const card = await cardOf('Nguyễn Văn Tư');
    fireEvent.contextMenu(card);
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
    await waitFor(() => expect(card).toHaveFocus());
  });

  it('keeps focus on the card after an action that opens no dialog', async () => {
    mockApi({
      ...treeRoutes(FAMILY),
      [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    // A pointer right-click need not focus the card (Safari never focuses buttons on click).
    expect(document.body).toHaveFocus();
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Chọn làm thuỷ tổ' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(useTreeStore.getState().tree.progenitorId).toBe(SON));
    await waitFor(() =>
      expect(document.querySelector(`[data-person-open="${SON}"]`)).toHaveFocus(),
    );
  });

  it('moves between relatives with the arrows, and between items while the menu is open', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    card.focus();
    fireEvent.contextMenu(card);
    const menu = await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    const first = within(menu).getAllByRole('menuitem')[0];
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(within(menu).getAllByRole('menuitem')[1]).toHaveFocus());
    // The menu is portalled out of the card's button, so ↑ is the menu's, not a move to Tư.
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(first).toHaveFocus());
    expect(menu).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(card).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    expect(await cardOf('Nguyễn Văn Tư')).toHaveFocus();
  });

  it('moves only between board cards, never from the Loose photos tray', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await cardOf('Nguyễn Văn Nam');
    const loose = document.querySelector<HTMLElement>(`[data-person-open="${LOOSE}"]`);
    expect(loose?.closest('.react-flow')).toBeNull();
    loose?.focus();
    for (const key of ['{ArrowUp}', '{ArrowDown}', '{ArrowLeft}', '{ArrowRight}']) {
      await user.keyboard(key);
      expect(loose).toHaveFocus();
    }
  });

  it('leaves the browser’s own menu to viewers', async () => {
    mockApi(treeRoutes(FAMILY, { ...CLAN, role: 'viewer' }));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const card = await cardOf('Nguyễn Văn Nam');
    // Not prevented: the browser shows its own menu.
    expect(fireEvent.contextMenu(card)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
