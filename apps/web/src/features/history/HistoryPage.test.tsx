import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type ApiCall } from '../../test/api';
import { renderRoute } from '../../test/render';
import { resetTreeStore, signOutTreeStore, useTreeStore } from '../tree';
import { CLAN, CLAN_ID, FAMILY, ME, SON, treeRoutes } from '../tree/fixtures';
import { FAMILY_HISTORY, historyEntry, historyRoutes } from './fixtures';

type Role = 'owner' | 'editor' | 'viewer';

function historyApp(role: Role, routes = historyRoutes()) {
  let seq = FAMILY.version;
  const posted: ApiCall[] = [];
  const api = mockApi({
    ...treeRoutes(FAMILY, { ...CLAN, role }),
    ...routes,
    [`POST /clans/${CLAN_ID}/ops`]: (call) => {
      posted.push(call);
      seq += 1;
      return { body: { seq } };
    },
  });
  renderRoute(`/clans/${CLAN_ID}/history`);
  return { api, posted };
}

async function entries() {
  const list = await screen.findByRole('list', { name: 'Lịch sử thay đổi' });
  return within(list).getAllByRole('listitem');
}

beforeEach(() => {
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

describe('HistoryPage', () => {
  it('lists the changes newest first with the author, the time and a summary', async () => {
    historyApp('viewer');
    const items = await entries();
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Trần Minh: sửa thông tin của Nguyễn Văn Nam',
      'Lan: chọn Nguyễn Văn Tư làm thuỷ tổ',
      'Lan: thêm Nguyễn Văn Tư',
    ]);
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
});
