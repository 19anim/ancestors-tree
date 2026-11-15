import type { TreeResponse } from '@ancestors-tree/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute, renderWithProviders } from '../../test/render';
import { CardMenu } from './CardMenu';
import { CLAN, CLAN_ID, FAMILY, ME, SON, treeRoutes } from './fixtures';
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

  it('closes the menu only on Escape, not the profile', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    fireEvent.contextMenu(await cardOf('Nguyễn Văn Tư'));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' })).toBeInTheDocument();
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
