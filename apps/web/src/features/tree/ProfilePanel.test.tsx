import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute, renderWithProviders } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, GRANDMA, GRANDPA, LOOSE, ME, SON, treeRoutes } from './fixtures';
import { PersonCard } from './PersonCard';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

// Spy on the real card to count renders: opening a profile must not re-render the cards.
vi.mock('./PersonCard', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, PersonCard: vi.fn(original.PersonCard as typeof PersonCard) };
});

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

const NOBODY = '64b7f0c2a1b2c3d4e5f6ffff';

const cardOf = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name},`) });

describe('the profile panel', () => {
  it('opens from a card, shows the facts, and closes back to the card', async () => {
    mockApi(treeRoutes(FAMILY, { ...CLAN, role: 'viewer' }));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await cardOf('Nguyễn Văn Nam'));
    const panel = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(within(panel).getByText('Giới tính')).toBeInTheDocument();
    // A viewer reads only.
    expect(within(panel).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Thêm con' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument();
    expect(await cardOf('Nguyễn Văn Nam')).toHaveFocus();
  });

  it('closes with its close button, back to the card', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await cardOf('Lê Thị Hoa'));
    const panel = screen.getByRole('complementary', { name: 'Lê Thị Hoa' });
    // Focus moves into the panel, so a screen reader says whose profile it is.
    expect(within(panel).getByRole('heading', { name: 'Lê Thị Hoa' })).toHaveFocus();
    await user.click(within(panel).getByRole('button', { name: 'Đóng hồ sơ' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Lê Thị Hoa,/ })).toHaveFocus());
  });

  it('switches person without re-rendering the cards', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    const nam = await cardOf('Nguyễn Văn Nam');
    const renderedFor = (id: string) =>
      vi.mocked(PersonCard).mock.calls.filter(([props]) => props.person.id === id).length;
    const before = { son: renderedFor(SON), grandma: renderedFor(GRANDMA) };
    await user.click(nam);
    await user.click(await cardOf('Nguyễn Văn Tư'));
    expect(screen.getByRole('complementary', { name: 'Nguyễn Văn Tư' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument();
    expect(renderedFor(SON)).toBe(before.son);
    expect(renderedFor(GRANDMA)).toBe(before.grandma);
  });

  it('opens from the link, and gives editors the actions', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${GRANDPA}`);
    const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Tư' });
    expect(within(panel).getByRole('button', { name: 'Thêm con' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Thêm vợ/chồng' })).toBeInTheDocument();
    // "Make progenitor" is only for someone who is not the progenitor.
    expect(
      within(panel).queryByRole('button', { name: 'Chọn làm thuỷ tổ' }),
    ).not.toBeInTheDocument();
  });

  it('closes with a notice when the person is no longer in the tree', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    act(() => {
      useTreeStore.setState((state) => {
        const { [SON]: _gone, ...persons } = state.tree.persons;
        return { tree: { ...state.tree, persons } };
      });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('Nguyễn Văn Nam không còn trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
  });

  it('keeps the person in the URL: Back closes, switching replaces', async () => {
    mockApi(treeRoutes(FAMILY));
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: [`/clans/${CLAN_ID}/tree`] });
    renderWithProviders(<RouterProvider router={router} />);
    await user.click(await cardOf('Nguyễn Văn Nam'));
    expect(router.state.location.search).toBe(`?person=${SON}`);
    await user.click(await cardOf('Nguyễn Văn Tư'));
    expect(router.state.location.search).toBe(`?person=${GRANDPA}`);
    // One entry for the open profile, whoever it shows: Back closes it.
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Nguyễn Văn Tư,/ })).toHaveFocus(),
    );
  });

  it('closes without a notice when the user deletes the person', async () => {
    mockApi({
      ...treeRoutes(FAMILY),
      [`POST /clans/${CLAN_ID}/ops`]: () => ({ body: { seq: 4 } }),
    });
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree?person=${LOOSE}`);
    const panel = await screen.findByRole('complementary', { name: 'Trần Văn Bình' });
    await user.click(within(panel).getByRole('button', { name: 'Xoá người này' }));
    const confirm = screen.getByRole('dialog', { name: 'Xoá Trần Văn Bình?' });
    await user.click(within(confirm).getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(screen.queryByText(/hồ sơ đã đóng/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('says so when the link names nobody', async () => {
    mockApi(treeRoutes(FAMILY));
    const router = createMemoryRouter(routes, {
      initialEntries: [`/clans/${CLAN_ID}/tree?person=${NOBODY}`],
    });
    renderWithProviders(<RouterProvider router={router} />);
    expect(
      await screen.findByText('Không tìm thấy người này trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe(`/clans/${CLAN_ID}/tree`);
  });

  it('closes once under StrictMode, going back only one entry', async () => {
    mockApi(treeRoutes(FAMILY));
    // A reload of a profile this tab opened (its history state survives), whose person is gone.
    const router = createMemoryRouter(routes, {
      initialEntries: [
        '/clans',
        `/clans/${CLAN_ID}/tree`,
        {
          pathname: `/clans/${CLAN_ID}/tree`,
          search: `?person=${NOBODY}`,
          state: { profileOpenedHere: true },
        },
      ],
      initialIndex: 2,
    });
    renderWithProviders(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    expect(
      await screen.findByText('Không tìm thấy người này trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe(`/clans/${CLAN_ID}/tree`);
  });

  it('names the person who left the tree while it was reloading', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    // A reload after a conflict shows the skeleton, so the panel unmounts meanwhile.
    act(() => useTreeStore.setState({ status: 'loading' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => {
      useTreeStore.setState((state) => {
        const { [SON]: _gone, ...persons } = state.tree.persons;
        return { status: 'ready', tree: { ...state.tree, persons } };
      });
    });
    expect(
      await screen.findByText('Nguyễn Văn Nam không còn trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
  });

  it('sits beside the board on wide screens, below the header, not over it', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    // jsdom has no CSS: the classes are the layout. A bottom sheet on small screens; from md up,
    // a sticky column in the page flow (WCAG 2.4.11: the header's controls stay uncovered).
    expect(panel).toHaveClass('fixed', 'bottom-0', 'md:sticky', 'md:top-4');
    expect(panel).not.toHaveClass('md:top-0');
    expect(screen.getByRole('main')).toContainElement(panel);
  });
});
