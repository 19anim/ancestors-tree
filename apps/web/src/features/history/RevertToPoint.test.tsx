import type { Op, SingleOp } from '@ancestors-tree/shared/tree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type ApiCall } from '../../test/api';
import { renderRoute } from '../../test/render';
import { resetTreeStore, signOutTreeStore, useTreeStore } from '../tree';
import { CLAN, CLAN_ID, FAMILY, ME, SON, treeRoutes } from '../tree/fixtures';
import { FAMILY_HISTORY, historyEntry, historyRoutes } from './fixtures';

function ownerApp(
  options: { history?: typeof FAMILY_HISTORY; versions?: number[]; hold?: Promise<void> } = {},
) {
  const versions = options.versions ?? [FAMILY.version];
  let reads = 0;
  let seq = FAMILY.version;
  const posted: ApiCall[] = [];
  mockApi({
    ...treeRoutes(FAMILY, CLAN),
    // Each read of the tree may see a newer version (someone else saved).
    [`GET /clans/${CLAN_ID}/tree`]: () => {
      const version = versions[Math.min(reads, versions.length - 1)]!;
      reads += 1;
      seq = version;
      return { body: { ...FAMILY, version } };
    },
    ...historyRoutes(options.history),
    [`POST /clans/${CLAN_ID}/ops`]: async (call) => {
      await options.hold;
      posted.push(call);
      seq += 1;
      return { body: { seq } };
    },
  });
  renderRoute(`/clans/${CLAN_ID}/history`);
  return { posted };
}

beforeEach(() => {
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('Revert to this point', () => {
  it('is offered to the Owner on every change but the newest', async () => {
    ownerApp();
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    expect(
      screen.queryByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #3' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #1' }),
    ).toBeEnabled();
  });

  it('is not offered to an editor', async () => {
    mockApi({ ...treeRoutes(FAMILY, { ...CLAN, role: 'editor' }), ...historyRoutes() });
    renderRoute(`/clans/${CLAN_ID}/history`);
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    expect(screen.queryByRole('button', { name: /Quay về thời điểm này/ })).not.toBeInTheDocument();
  });

  it('asks with the count, sends one op with revertsToSeq, and is one undo step', async () => {
    const user = userEvent.setup();
    const { posted } = ownerApp();
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    const opener = screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Quay về sau thay đổi #2?' });
    expect(await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Năm');
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toEqual({
      op: FAMILY_HISTORY[0]!.inverse,
      baseVersion: FAMILY.version,
      expectedUserId: ME.id,
      revertsToSeq: 2,
    });
    expect(useTreeStore.getState().undoStack).toHaveLength(1);
  });

  it('counts every change after the point', async () => {
    const user = userEvent.setup();
    ownerApp();
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #1' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 2.')).toBeInTheDocument();
  });

  it('asks for a more recent point past 500 steps', async () => {
    const user = userEvent.setup();
    const bio = (i: number): SingleOp => ({
      type: 'updatePerson',
      payload: { id: SON, changes: { bio: String(i) } },
    });
    const many: Op = {
      type: 'batch',
      payload: { ops: Array.from({ length: 300 }, (_, i) => bio(i)) },
    };
    ownerApp({
      history: [historyEntry(3, many, many), historyEntry(2, many, many), FAMILY_HISTORY[2]!],
    });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #1' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        'Có quá nhiều thay đổi sau mốc này để hoàn tác cùng lúc. Hãy chọn một mốc gần hơn.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Quay về' })).not.toBeInTheDocument();
  });

  it('refuses when someone saved a change after it was prepared', async () => {
    const user = userEvent.setup();
    // The page reads version 3; the check before sending finds version 4.
    const { posted } = ownerApp({ versions: [3, 4] });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.');
    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cây gia phả vừa có thay đổi mới. Hãy xem lại rồi thử lại.',
    );
    expect(posted).toHaveLength(0);
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Nam');
  });

  it('refuses with a clear message while changes are still unsent', async () => {
    const user = userEvent.setup();
    const { posted } = ownerApp({ hold: new Promise<void>(() => {}) });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.');
    // An unsent edit appears (its save is held back).
    expect(
      useTreeStore.getState().apply({
        type: 'updatePerson',
        payload: { id: SON, changes: { bio: 'Chưa gửi' } },
      }),
    ).toEqual({ ok: true });
    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Còn thay đổi chưa gửi. Hãy đợi lưu xong rồi thử lại.',
    );
    expect(useTreeStore.getState().pending).toHaveLength(1);
    expect(useTreeStore.getState().tree.persons[SON]?.bio).toBe('Chưa gửi');
    expect(posted).toHaveLength(0);
  });
});
