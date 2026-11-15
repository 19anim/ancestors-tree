import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, FAMILY, LOOSE_BRANCH, ME, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Loose photos', () => {
  it('shows a lone person as one photo, with no stack to open', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    expect(within(tray).getByRole('button', { name: 'Trần Văn Bình' })).toBeInTheDocument();
    expect(within(tray).queryByRole('button', { name: /^\+/ })).not.toBeInTheDocument();
  });

  it('groups a loose branch under its topmost person, and opens the stack', async () => {
    const user = userEvent.setup();
    mockApi(treeRoutes(LOOSE_BRANCH));
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const tray = await screen.findByRole('region', { name: 'Ảnh chưa dán' });
    const toggle = within(tray).getByRole('button', {
      name: '+2 người trong xấp của Trần Văn Bình',
    });
    expect(toggle).toHaveTextContent('+2 người');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(tray).queryByRole('button', { name: 'Phạm Thị Cúc' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const stack = within(tray).getByRole('list', { name: 'Xấp của Trần Văn Bình' });
    // Spouses first, then children, from the top of the branch.
    expect(
      within(stack)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Phạm Thị Cúc', 'Trần Văn Dũng']);
    await user.click(within(stack).getByRole('button', { name: 'Trần Văn Dũng' }));
    expect(screen.getByRole('complementary', { name: 'Trần Văn Dũng' })).toBeInTheDocument();
  });
});
