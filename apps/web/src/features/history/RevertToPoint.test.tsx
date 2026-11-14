import type { Op, SingleOp } from '@ancestors-tree/shared/tree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type ApiCall } from '../../test/api';
import { renderRoute } from '../../test/render';
import { resetTreeStore, signOutTreeStore, useTreeStore } from '../tree';
import { CLAN, CLAN_ID, FAMILY, ME, SON, treeRoutes } from '../tree/fixtures';
import { FAMILY_HISTORY, historyEntry, historyRoutes } from './fixtures';

/** A promise the test resolves when it wants a held answer to arrive. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

function ownerApp(
  options: {
    history?: typeof FAMILY_HISTORY;
    versions?: number[];
    hold?: Promise<void>;
    holdReread?: Promise<void>;
  } = {},
) {
  const versions = options.versions ?? [FAMILY.version];
  const history = historyRoutes(options.history)[`GET /clans/${CLAN_ID}/history`]!;
  let reads = 0;
  let seq = FAMILY.version;
  const posted: ApiCall[] = [];
  const counts = { planReads: 0, rereads: 0 };
  mockApi({
    ...treeRoutes(FAMILY, CLAN),
    // Each read of the tree may see a newer version (someone else saved).
    [`GET /clans/${CLAN_ID}/tree`]: async () => {
      const version = versions[Math.min(reads, versions.length - 1)]!;
      reads += 1;
      // The page reads the tree first; the check before sending reads it again.
      if (reads > 1) {
        await options.holdReread;
        counts.rereads += 1;
      }
      seq = version;
      return { body: { ...FAMILY, version } };
    },
    // The plan reads the history a hundred at a time; the page reads its default page size.
    [`GET /clans/${CLAN_ID}/history`]: (call) => {
      if (call.url.searchParams.has('limit')) counts.planReads += 1;
      return history(call);
    },
    [`POST /clans/${CLAN_ID}/ops`]: async (call) => {
      await options.hold;
      posted.push(call);
      seq += 1;
      return { body: { seq } };
    },
  });
  const { unmount } = renderRoute(`/clans/${CLAN_ID}/history`);
  return { posted, counts, unmount };
}

/** Lets pending answers and the work after them run (real timers). */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
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
    // A screen reader hears the count with the dialog.
    expect(dialog).toHaveAccessibleDescription('Số thay đổi sẽ hoàn tác: 1.');

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
    const { posted, counts } = ownerApp({ versions: [3, 4] });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.');
    expect(counts.planReads).toBe(1);
    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cây gia phả vừa có thay đổi mới. Hãy xem lại rồi thử lại.',
    );
    // The plan is made again from the history as it is now.
    expect(counts.planReads).toBeGreaterThan(1);
    expect(posted).toHaveLength(0);
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Nam');
  });

  it('refuses with a clear message while changes are still unsent', async () => {
    const user = userEvent.setup();
    const save = gate();
    const { posted } = ownerApp({ hold: save.wait });
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

    // Once the edit is saved, the plan is read again and the old refusal no longer applies.
    save.open();
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    expect(posted).toHaveLength(1);
  });

  it('cannot be closed while it checks the tree, and says it is working', async () => {
    const user = userEvent.setup();
    const reread = gate();
    const { posted } = ownerApp({ holdReread: reread.wait });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.');
    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));

    const busy = await within(dialog).findByRole('button', { name: 'Đang quay về…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBe(dialog);
    const cancel = within(dialog).getByRole('button', { name: 'Huỷ' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await user.click(cancel);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(posted).toHaveLength(0);

    reread.open();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(posted).toHaveLength(1));
  });

  it('sends nothing when the page goes away while it checks the tree', async () => {
    const user = userEvent.setup();
    const reread = gate();
    const { posted, counts, unmount } = ownerApp({ holdReread: reread.wait });
    await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
    await user.click(
      screen.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' }),
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Số thay đổi sẽ hoàn tác: 1.');
    await user.click(within(dialog).getByRole('button', { name: 'Quay về' }));
    await within(dialog).findByRole('button', { name: 'Đang quay về…' });

    unmount();
    reread.open();
    await waitFor(() => expect(counts.rereads).toBe(1));
    await settle();
    expect(posted).toHaveLength(0);
    expect(useTreeStore.getState().pending).toEqual([]);
    expect(useTreeStore.getState().undoStack).toEqual([]);
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Nam');
  });
});
