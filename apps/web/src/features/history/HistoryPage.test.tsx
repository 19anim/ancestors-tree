import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/providers';
import { apiErrorReply, mockApi, type ApiCall, type MockRoutes } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { resetTreeStore, signOutTreeStore, useTreeStore } from '../tree';
import { CLAN, CLAN_ID, FAMILY, LOOSE, ME, SON, treeRoutes } from '../tree/fixtures';
import { historyKeys } from './api';
import { FAMILY_HISTORY, historyEntry, historyRoutes } from './fixtures';

type Role = 'owner' | 'editor' | 'viewer';

function testClient() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return client;
}

function historyApp(role: Role, routes: MockRoutes = historyRoutes(), queryClient = testClient()) {
  let seq = FAMILY.version;
  const posted: ApiCall[] = [];
  const api = mockApi({
    ...treeRoutes(FAMILY, { ...CLAN, role }),
    [`POST /clans/${CLAN_ID}/ops`]: (call) => {
      posted.push(call);
      seq += 1;
      return { body: { seq } };
    },
    ...routes,
  });
  renderRoute(`/clans/${CLAN_ID}/history`, queryClient);
  return { api, posted };
}

async function entries() {
  const list = await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
  return within(list).getAllByRole('listitem');
}

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
});

describe('HistoryPage', () => {
  it('lists the changes newest first with the author, the time and a summary', async () => {
    historyApp('viewer');
    const items = await entries();
    const summaries = [
      'Trần Minh: sửa thông tin của Nguyễn Văn Nam',
      'Lan: chọn Nguyễn Văn Tư làm thuỷ tổ',
      'Lan: thêm Nguyễn Văn Tư',
    ];
    expect(items).toHaveLength(summaries.length);
    summaries.forEach((summary, index) => {
      expect(within(items[index]!).getByText(summary)).toBeInTheDocument();
    });
    expect(within(items[0]!).getByText('#3')).toBeInTheDocument();
    expect(items[0]!.querySelector('time')).toHaveAttribute('datetime', '2026-11-13T08:00:00.000Z');
    // Viewers read the history; they cannot revert.
    expect(screen.queryByRole('button', { name: /Hoàn tác/ })).not.toBeInTheDocument();
  });

  it('is reached from the family tree tabs', async () => {
    historyApp('viewer');
    const tabs = within(await screen.findByRole('navigation', { name: 'Mục của cây gia phả' }));
    expect(tabs.getByRole('link', { name: 'Lịch sử' })).toHaveAttribute('aria-current', 'page');
  });

  it('lets an editor revert one change, sent with the change it reverts', async () => {
    const user = userEvent.setup();
    const { posted } = historyApp('editor');
    await entries();
    // The progenitor is the Owner's to change: no revert of #2 for an editor.
    expect(screen.queryByRole('button', { name: 'Hoàn tác thay đổi #2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi #3' }));
    expect(useTreeStore.getState().tree.persons[SON]?.fullName).toBe('Nguyễn Văn Năm');
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toEqual({
      op: FAMILY_HISTORY[0]!.inverse,
      baseVersion: FAMILY.version,
      expectedUserId: ME.id,
      revertsSeq: 3,
    });
    // One undo step, like any other change.
    expect(useTreeStore.getState().undoStack).toHaveLength(1);
  });

  it('shows the Owner every revert, and says why one no longer applies', async () => {
    const user = userEvent.setup();
    historyApp('owner');
    await entries();
    expect(screen.getByRole('button', { name: 'Hoàn tác thay đổi #2' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi #1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không hoàn tác được thay đổi #1: Không xoá được thuỷ tổ. Hãy chọn thuỷ tổ khác trước.',
    );
  });

  it('refreshes after a change is saved', async () => {
    const user = userEvent.setup();
    const { api } = historyApp('editor');
    await entries();
    const reads = () => api.calls.filter((call) => call.path.endsWith('/history')).length;
    expect(reads()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi #3' }));
    await waitFor(() => expect(reads()).toBe(2));
  });

  it('loads older pages', async () => {
    const user = userEvent.setup();
    const [newest, ...older] = FAMILY_HISTORY;
    historyApp('viewer', {
      [`GET /clans/${CLAN_ID}/history`]: ({ url }) =>
        url.searchParams.get('before') === '3'
          ? { body: { entries: older, nextBefore: null } }
          : { body: { entries: [newest], nextBefore: 3 } },
    });
    expect(await entries()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await waitFor(async () => expect(await entries()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).not.toBeInTheDocument();
  });

  it('says when nothing has changed yet', async () => {
    historyApp('viewer', historyRoutes([]));
    expect(await screen.findByText('Chưa có thay đổi nào.')).toBeInTheDocument();
  });

  it('marks a revert in the list', async () => {
    const op = { type: 'setProgenitor', payload: { personId: null } } as const;
    historyApp('viewer', historyRoutes([historyEntry(4, op, op, { revertsSeq: 2 })]));
    const [item] = await entries();
    expect(item).toHaveTextContent('Hoàn tác thay đổi #2');
  });

  it('reads the history again when the page is reopened after a save made elsewhere', async () => {
    const user = userEvent.setup();
    const saved = historyEntry(
      4,
      { type: 'updatePerson', payload: { id: SON, changes: { fullName: 'Nguyễn Văn Sáu' } } },
      { type: 'updatePerson', payload: { id: SON, changes: { fullName: 'Nguyễn Văn Nam' } } },
    );
    let calls: ApiCall[] = [];
    const app = historyApp('editor', {
      [`GET /clans/${CLAN_ID}/history`]: () => ({
        body: {
          entries: calls.some((call) => call.method === 'POST')
            ? [saved, ...FAMILY_HISTORY]
            : FAMILY_HISTORY,
          nextBefore: null,
        },
      }),
    });
    calls = app.api.calls;
    await entries();
    const reads = () => calls.filter((call) => call.path.endsWith('/history')).length;
    expect(reads()).toBe(1);

    await user.click(screen.getByRole('link', { name: 'Cây' }));
    await screen.findByRole('figure', { name: /Nguyễn Văn Nam/ });
    act(() => {
      useTreeStore.getState().apply(saved.op);
    });
    await waitFor(() => expect(useTreeStore.getState().pending).toHaveLength(0));
    await user.click(screen.getByRole('link', { name: 'Lịch sử' }));

    expect(await screen.findByText('Lan: sửa thông tin của Nguyễn Văn Sáu')).toBeInTheDocument();
    expect(reads()).toBe(2);
    expect(await entries()).toHaveLength(4);
  });

  it('keeps the list and says so when Show more fails, then retries only that page', async () => {
    const user = userEvent.setup();
    const [newest, ...older] = FAMILY_HISTORY;
    let failing = true;
    const { api } = historyApp('viewer', {
      [`GET /clans/${CLAN_ID}/history`]: ({ url }) => {
        if (url.searchParams.get('before') === null) {
          return { body: { entries: [newest], nextBefore: 3 } };
        }
        return failing
          ? apiErrorReply('INTERNAL', 500)
          : { body: { entries: older, nextBefore: null } };
      },
    });
    expect(await entries()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Xem thêm' }));
    const alert = await screen.findByRole('alert');
    expect(await entries()).toHaveLength(1);

    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(async () => expect(await entries()).toHaveLength(3));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The first page was not read again: only the failed older page was.
    expect(api.calls.filter((call) => call.path.endsWith('/history'))).toHaveLength(3);
  });

  it('keeps the list when a refetch fails after loading', async () => {
    const user = userEvent.setup();
    const client = testClient();
    let failing = false;
    historyApp(
      'viewer',
      {
        [`GET /clans/${CLAN_ID}/history`]: () =>
          failing
            ? apiErrorReply('INTERNAL', 500)
            : { body: { entries: FAMILY_HISTORY, nextBefore: null } },
      },
      client,
    );
    expect(await entries()).toHaveLength(3);
    failing = true;
    await act(() => client.invalidateQueries({ queryKey: historyKeys.list(CLAN_ID) }));
    const alert = await screen.findByRole('alert');
    expect(await entries()).toHaveLength(3);

    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await entries()).toHaveLength(3);
  });

  it('keeps focus on Show more while it loads, then moves it to the first new entry', async () => {
    const user = userEvent.setup();
    const [newest, ...older] = FAMILY_HISTORY;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api } = historyApp('viewer', {
      [`GET /clans/${CLAN_ID}/history`]: async ({ url }) => {
        if (url.searchParams.get('before') === null) {
          return { body: { entries: [newest], nextBefore: 3 } };
        }
        await held;
        return { body: { entries: older, nextBefore: null } };
      },
    });
    await entries();
    const more = screen.getByRole('button', { name: 'Xem thêm' });
    await user.click(more);
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-disabled', 'true');
    await user.click(more);
    expect(api.calls.filter((call) => call.path.endsWith('/history'))).toHaveLength(2);

    release();
    await waitFor(async () => expect(await entries()).toHaveLength(3));
    expect((await entries())[1]).toHaveFocus();
  });

  it('shows one Retry when the tree and the history both fail, and retries both', async () => {
    const user = userEvent.setup();
    let failing = true;
    const { api } = historyApp('viewer', {
      [`GET /clans/${CLAN_ID}/history`]: () =>
        failing
          ? apiErrorReply('INTERNAL', 500)
          : { body: { entries: FAMILY_HISTORY, nextBefore: null } },
      [`GET /clans/${CLAN_ID}/tree`]: () =>
        failing ? apiErrorReply('INTERNAL', 500) : { body: FAMILY },
    });
    await screen.findByRole('alert');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await entries()).toHaveLength(3);
    expect(api.calls.filter((call) => call.path.endsWith('/tree'))).toHaveLength(2);
    expect(api.calls.filter((call) => call.path.endsWith('/history'))).toHaveLength(2);
  });

  it('disables Revert on a change that is already being reverted', async () => {
    const user = userEvent.setup();
    historyApp('editor', {
      ...historyRoutes(),
      [`POST /clans/${CLAN_ID}/ops`]: () => new Promise(() => undefined),
    });
    await entries();
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi #3' }));
    const busy = screen.getByRole('button', { name: /Đang hoàn tác/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveTextContent('Đang hoàn tác…');
    await user.click(busy);
    expect(useTreeStore.getState().pending).toHaveLength(1);
  });

  it('clears a revert failure when more history loads', async () => {
    const user = userEvent.setup();
    const bad = historyEntry(
      5,
      { type: 'updatePerson', payload: { id: LOOSE, changes: { fullName: 'A' } } },
      { type: 'deletePerson', payload: { id: '64b7f0c2a1b2c3d4e5f6a0ff' } },
    );
    historyApp('owner', {
      [`GET /clans/${CLAN_ID}/history`]: ({ url }) =>
        url.searchParams.get('before') === null
          ? { body: { entries: [bad], nextBefore: 5 } }
          : { body: { entries: FAMILY_HISTORY, nextBefore: null } },
    });
    await entries();
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi #5' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Không hoàn tác được thay đổi #5');
    await user.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('announces loading', async () => {
    historyApp('viewer', {
      [`GET /clans/${CLAN_ID}/history`]: () => new Promise(() => undefined),
    });
    await waitFor(() => {
      const loading = screen.getAllByText('Đang tải…');
      expect(loading.some((node) => node.getAttribute('role') === 'status')).toBe(true);
    });
  });

  it('builds the date formatter once, not once per entry', async () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    historyApp('viewer');
    await entries();
    const built = spy.mock.calls.filter(
      ([, options]) => (options as { dateStyle?: string } | undefined)?.dateStyle === 'short',
    );
    spy.mockRestore();
    expect(built).toHaveLength(1);
  });
});
