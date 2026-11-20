import { EMPTY_VIEW_PREFERENCE, type ViewPreference } from '@ancestors-tree/shared';
import { treeStateFromLists, type TreeTheme } from '@ancestors-tree/shared/tree';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChangeContext, type RequestChange } from './ChangeRunner';
import { DecoratePanel } from './DecoratePanel';
import { PersonalThemeContext } from './decorContext';
import { CLAN_ID, FAMILY, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';
import type { PersonalDecor } from './useViewPreference';

function showTree(theme: TreeTheme = {}, sonStyle?: { frame?: 'vintage' }) {
  const persons = FAMILY.persons.map((person) =>
    person.id === SON && sonStyle ? { ...person, cardStyle: sonStyle } : person,
  );
  const tree = treeStateFromLists(FAMILY.progenitorId, persons, FAMILY.unions, theme);
  useTreeStore.setState({
    clanId: CLAN_ID,
    status: 'ready',
    tree,
    confirmedTree: tree,
    confirmedVersion: 3,
  });
}

function fakeDecor(preference: ViewPreference | null = EMPTY_VIEW_PREFERENCE) {
  return { preference, change: vi.fn(), saveState: 'idle', retry: vi.fn() } satisfies PersonalDecor;
}

type FakeDecor = ReturnType<typeof fakeDecor>;

function renderPanel(
  props: Partial<Omit<ComponentProps<typeof DecoratePanel>, 'decor'>> & { decor?: FakeDecor } = {},
  requestChange: RequestChange | null = vi.fn(),
) {
  const decor = props.decor ?? fakeDecor();
  const onClose = vi.fn();
  renderWithProviders(
    <ChangeContext value={requestChange}>
      <PersonalThemeContext value={decor.preference}>
        <DecoratePanel
          target={{ kind: 'tree' }}
          mode="clan"
          onModeChange={vi.fn()}
          canEdit
          decor={decor}
          onClose={onClose}
          {...props}
        />
      </PersonalThemeContext>
    </ChangeContext>,
  );
  return { decor, requestChange, onClose };
}

/** The update `change` was called with, applied to a preference. */
function applied(decor: FakeDecor, to: ViewPreference | null = EMPTY_VIEW_PREFERENCE) {
  if (to === null) throw new Error('No preference to apply the update to');
  const update = decor.change.mock.calls.at(-1)?.[0] as (current: ViewPreference) => ViewPreference;
  return update(to);
}

/**
 * Picks the option that is already checked, both ways: a click on it (no change event), then as
 * a radio whose checked state went stale would, which React does report as a change.
 */
async function pickAgain(radio: HTMLElement) {
  expect(radio).toBeChecked();
  const user = userEvent.setup();
  await user.click(radio);
  (radio as HTMLInputElement).checked = false;
  await user.click(radio);
}

beforeEach(() => {
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
});

describe('DecoratePanel, the whole tree', () => {
  it("shows the family's choices and sends a surface with its fastener as one change", async () => {
    showTree({ thread: 'yarn' });
    const { requestChange } = renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Trang trí cây' });
    expect(within(panel).getByRole('heading', { name: 'Trang trí cây' })).toHaveFocus();
    const thread = screen.getByRole('group', { name: 'Sợi chỉ cha con' });
    expect(within(thread).getByRole('radio', { name: 'Sợi len' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Giấy ô li' })).toBeChecked();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Bảng gỗ bần' }));
    expect(requestChange).toHaveBeenCalledWith({
      change: { kind: 'treeTheme', changes: { surface: 'corkboard', fastener: 'pushpin' } },
    });
  });

  it('only me: a pick changes my choices and turns them on', async () => {
    showTree();
    const { decor, requestChange } = renderPanel({ mode: 'me' });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Cửa tủ lạnh' }));
    expect(requestChange).not.toHaveBeenCalled();
    expect(applied(decor)).toEqual({
      enabled: true,
      theme: { surface: 'fridge', fastener: 'magnet' },
      cards: {},
    });
  });

  it('re-picking the option in effect does nothing, like a radio button', async () => {
    showTree({ surface: 'corkboard', fastener: 'pushpin' });
    const { requestChange } = renderPanel();
    await pickAgain(screen.getByRole('radio', { name: 'Bảng gỗ bần' }));
    const thread = screen.getByRole('group', { name: 'Sợi chỉ cha con' });
    await pickAgain(within(thread).getByRole('radio', { name: 'Chỉ mảnh' }));
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('only me: re-picking my own choice does nothing', async () => {
    showTree();
    const decor = fakeDecor({ enabled: true, theme: { thread: 'yarn' }, cards: {} });
    renderPanel({ mode: 'me', decor });
    const thread = screen.getByRole('group', { name: 'Sợi chỉ cha con' });
    await pickAgain(within(thread).getByRole('radio', { name: 'Sợi len' }));
    expect(decor.change).not.toHaveBeenCalled();
  });

  it('only me: picking what is on screen still turns my choices on while they are off', async () => {
    showTree();
    const decor = fakeDecor({ enabled: false, theme: {}, cards: {} });
    renderPanel({ mode: 'me', decor });
    await pickAgain(screen.getByRole('radio', { name: 'Giấy ô li' }));
    expect(applied(decor, decor.preference)).toEqual({
      enabled: true,
      theme: { surface: 'grid-paper', fastener: 'washi' },
      cards: {},
    });
  });

  it('disables "Whole family" for viewers, and says why', () => {
    showTree();
    renderPanel({ mode: 'me', canEdit: false }, null);
    expect(screen.getByRole('radio', { name: 'Cả họ' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Chỉ mình tôi' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Áp dụng cho' })).toHaveAccessibleDescription(
      'Người xem chỉ trang trí được cho riêng mình.',
    );
  });

  it('switches the mode', async () => {
    showTree();
    const onModeChange = vi.fn();
    renderPanel({ onModeChange });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Chỉ mình tôi' }));
    expect(onModeChange).toHaveBeenCalledWith('me');
  });

  it('waits for my choices before "Only me" picks', () => {
    showTree();
    renderPanel({ mode: 'me', decor: fakeDecor(null) });
    expect(screen.getByRole('radio', { name: 'Bảng gỗ bần' })).toBeDisabled();
  });

  it('closes with Escape and with its close button', async () => {
    showTree();
    const { onClose } = renderPanel();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Đóng trang trí' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('DecoratePanel, one card', () => {
  it("shows the frame and fastener only, marks the card's own choice, and follows the tree again", async () => {
    showTree({}, { frame: 'vintage' });
    const { requestChange } = renderPanel({ target: { kind: 'card', personId: SON } });
    screen.getByRole('complementary', { name: 'Trang trí thẻ của Nguyễn Văn Nam' });
    expect(screen.queryByRole('group', { name: 'Mặt bảng' })).not.toBeInTheDocument();
    const frame = screen.getByRole('group', { name: 'Khung ảnh' });
    expect(within(frame).getByRole('radio', { name: 'Ảnh xưa' })).toBeChecked();
    expect(within(frame).getByText('Khác với cây')).toBeInTheDocument();
    const fastener = screen.getByRole('group', { name: 'Đồ gắn' });
    expect(within(fastener).queryByText('Khác với cây')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(fastener).getByRole('radio', { name: 'Nam châm' }));
    expect(requestChange).toHaveBeenLastCalledWith({
      change: {
        kind: 'cardStyle',
        personId: SON,
        cardStyle: { frame: 'vintage', fastener: 'magnet' },
      },
    });
    await user.click(screen.getByRole('button', { name: 'Dùng kiểu của cây' }));
    expect(requestChange).toHaveBeenLastCalledWith({
      change: { kind: 'cardStyle', personId: SON, cardStyle: null },
    });
  });

  it('re-picking the card option in effect does nothing', async () => {
    showTree({}, { frame: 'vintage' });
    const { requestChange } = renderPanel({ target: { kind: 'card', personId: SON } });
    await pickAgain(screen.getByRole('radio', { name: 'Ảnh xưa' }));
    await pickAgain(screen.getByRole('radio', { name: 'Băng dính washi' }));
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('only me: my card pick, and "Use the tree\'s style" drops only mine', async () => {
    showTree({}, { frame: 'vintage' });
    const decor = fakeDecor({
      enabled: true,
      theme: {},
      cards: { [SON]: { fastener: 'pushpin' } },
    });
    renderPanel({ target: { kind: 'card', personId: SON }, mode: 'me', decor });
    const fastener = screen.getByRole('group', { name: 'Đồ gắn' });
    expect(within(fastener).getByRole('radio', { name: 'Đinh ghim' })).toBeChecked();
    expect(within(fastener).getByText('Khác với cây')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dùng kiểu của cây' }));
    expect(applied(decor, decor.preference)).toEqual({ enabled: true, theme: {}, cards: {} });
  });

  it('disables "Use the tree\'s style" when the card has no choice of its own in this mode', () => {
    showTree();
    renderPanel({ target: { kind: 'card', personId: SON } });
    expect(screen.getByRole('button', { name: 'Dùng kiểu của cây' })).toBeDisabled();
  });
});
