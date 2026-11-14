import type { Op } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi, UNAUTHENTICATED_REPLY } from '../../test/api';
import {
  CLAN_ID,
  EMPTY_TREE_RESPONSE,
  FAMILY,
  fixturePerson,
  GRANDPA,
  LOOSE,
  SON,
  treeRoutes,
} from './fixtures';
import { RETRY_DELAYS_MS, resetTreeStore, selectHasUnsentChanges, useTreeStore } from './store';

const OPS = `POST /clans/${CLAN_ID}/ops`;
const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const OTHER_ID = '64b7f0c2a1b2c3d4e5f6a0f2';
const addPerson = (id: string, fullName = 'Nguyễn Văn Út'): Op => ({
  type: 'addPerson',
  payload: fixturePerson(id, fullName),
});

const store = () => useTreeStore.getState();
const TREE = `GET /clans/${CLAN_ID}/tree`;
const OTHER_CLAN = '64b7f0c2a1b2c3d4e5f60002';
const bio = (text: string): Op => ({
  type: 'updatePerson',
  payload: { id: SON, changes: { bio: text } },
});

/** A promise the test resolves when it wants a held answer to arrive. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Taken before any test fakes the timers. */
const realSetTimeout = globalThis.setTimeout;

/**
 * Waits on real macrotasks until `check` holds. Unlike vi.waitFor, it never moves fake timers
 * on, so a test can assert that nothing happens before a backoff delay ends.
 */
async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    if (check()) return;
    await new Promise((resolve) => realSetTimeout(resolve, 0));
  }
  throw new Error('until(): the condition never became true');
}

/** With fake timers: waits until the store has scheduled its next retry. */
const retryScheduled = () => until(() => vi.getTimerCount() === 1);

beforeEach(() => {
  resetTreeStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loading', () => {
  it('loads the tree and its version', async () => {
    mockApi(treeRoutes());
    await store().load(CLAN_ID);
    expect(store().status).toBe('ready');
    expect(store().confirmedVersion).toBe(3);
    expect(store().tree.progenitorId).toBe(GRANDPA);
    expect(Object.keys(store().tree.persons)).toHaveLength(4);
    expect(store().confirmedTree).toBe(store().tree);
  });

  it('remembers a failed load', async () => {
    mockApi({ [`GET /clans/${CLAN_ID}/tree`]: () => apiErrorReply('NOT_FOUND', 404) });
    await store().load(CLAN_ID);
    expect(store().status).toBe('error');
    expect(store().loadError).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('applying ops', () => {
  it('shows a change at once and confirms it after the server accepts it', async () => {
    const api = mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE),
      [OPS]: () => ({ body: { seq: 1 } }),
    });
    await store().load(CLAN_ID);

    expect(store().apply(addPerson(NEW_ID))).toEqual({ ok: true });
    expect(store().tree.persons[NEW_ID]?.fullName).toBe('Nguyễn Văn Út');
    expect(store().pending).toHaveLength(1);

    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().confirmedVersion).toBe(1);
    expect(store().confirmedTree.persons[NEW_ID]).toBeDefined();
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
      op: addPerson(NEW_ID),
      baseVersion: 0,
    });
  });

  it('refuses a change that breaks a rule without sending it', async () => {
    const api = mockApi(treeRoutes());
    await store().load(CLAN_ID);
    expect(store().apply({ type: 'deletePerson', payload: { id: GRANDPA } })).toEqual({
      ok: false,
      reason: 'PROGENITOR_PROTECTED',
    });
    expect(store().pending).toEqual([]);
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('sends one op at a time, each against the version the last one created', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE),
      [OPS]: async ({ body }) => {
        bodies.push(body);
        if (bodies.length === 1) await gate;
        return { body: { seq: bodies.length } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    store().apply(addPerson(OTHER_ID, 'Nguyễn Văn Sáu'));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(store().pending).toHaveLength(2);
    release();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies).toEqual([
      { op: addPerson(NEW_ID), baseVersion: 0 },
      { op: addPerson(OTHER_ID, 'Nguyễn Văn Sáu'), baseVersion: 1 },
    ]);
    expect(store().confirmedVersion).toBe(2);
  });
});

describe('when the server says no', () => {
  it('reloads the whole tree after a version conflict', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(),
      [`GET /clans/${CLAN_ID}/tree`]: () => {
        loads += 1;
        return { body: loads === 1 ? FAMILY : { ...FAMILY, version: 7 } };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(loads).toBe(2);
    expect(store().confirmedVersion).toBe(7);
    expect(store().pending).toEqual([]);
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
  });

  it('rolls back a rejected op, keeps the independent ones and drops the dependent ones', async () => {
    const posted: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        posted.push(body);
        return posted.length === 1
          ? {
              status: 422,
              body: { error: { code: 'RULE_VIOLATION', message: 'No', reason: 'CYCLE' } },
            }
          : { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    // The server will refuse the first op. The second depends on it; the third does not.
    store().apply(addPerson(NEW_ID));
    store().apply({ type: 'setProgenitor', payload: { personId: NEW_ID } });
    store().apply({ type: 'updatePerson', payload: { id: LOOSE, changes: { bio: 'Chú họ' } } });

    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().notice).toMatchObject({ kind: 'rejected', error: { reason: 'CYCLE' } });
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
    expect(store().tree.progenitorId).toBe(GRANDPA);
    expect(store().tree.persons[LOOSE]?.bio).toBe('Chú họ');
    expect(posted).toHaveLength(2);
    expect(store().confirmedVersion).toBe(4);
  });

  it('keeps an op and retries it after a pause when the server cannot be reached', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let attempts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        attempts += 1;
        return attempts === 1 ? { status: 503, body: {} } : { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply({ type: 'updatePerson', payload: { id: SON, changes: { bio: 'Con trưởng' } } });

    await vi.waitFor(() => expect(store().retrying).toBe(true));
    expect(store().tree.persons[SON]?.bio).toBe('Con trưởng');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(attempts).toBe(2);
    expect(store().retrying).toBe(false);
  });

  it('forgets the notice when asked', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => apiErrorReply('FORBIDDEN', 403) });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    store().dismissNotice();
    expect(store().notice).toBeNull();
  });
});

describe('a saved op whose answer cannot be read', () => {
  it('reloads the tree instead of rolling the op back', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        loads += 1;
        return { body: { ...FAMILY, version: loads === 1 ? 3 : 4 } };
      },
      // 200 with a body that does not match the schema: the server did save the op.
      [OPS]: () => ({ body: { saved: true } }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(loads).toBe(2);
    expect(store().confirmedVersion).toBe(4);
    expect(store().pending).toEqual([]);
  });

  it('reloads the tree when sending fails without an answer from the API', async () => {
    const api = mockApi(treeRoutes());
    await store().load(CLAN_ID);
    // Something that is not a Response at all: apiRequest throws a TypeError, not an ApiError.
    vi.mocked(fetch).mockImplementationOnce(async () => null as unknown as Response);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(api.calls.filter((call) => call.method === 'GET')).toHaveLength(2);
    expect(store().pending).toEqual([]);
  });
});

describe('retrying', () => {
  it('retries after a network failure (status 0)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let attempts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().retrying).toBe(true));
    expect(store().notice).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(attempts).toBe(2);
  });

  it('retries after 429', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let attempts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        attempts += 1;
        return attempts === 1 ? apiErrorReply('RATE_LIMITED', 429) : { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().retrying).toBe(true));
    expect(store().pending).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().notice).toBeNull();
  });

  it('waits 1 s, then 2 s, then 4 s between attempts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let attempts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        attempts += 1;
        return attempts <= 3 ? { status: 503, body: {} } : { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    expect(RETRY_DELAYS_MS.slice(0, 3)).toEqual([1000, 2000, 4000]);

    await retryScheduled();
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => attempts === 2);
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => attempts === 3);
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(3999);
    expect(attempts).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(attempts).toBe(4);
    expect(store().retrying).toBe(false);
  });
});

describe('when the reload after a conflict fails', () => {
  it('retries the reload with backoff, without posting the op again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let loads = 0;
    let treeUp = false;
    const api = mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        loads += 1;
        if (loads === 1) return { body: FAMILY };
        return treeUp ? { body: { ...FAMILY, version: 9 } } : { status: 503, body: {} };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await retryScheduled();
    expect(store().retrying).toBe(true);
    const posts = () => api.calls.filter((call) => call.method === 'POST').length;
    expect(posts()).toBe(1);
    expect(loads).toBe(2);
    // The unsent ops are kept; a new edit is refused, because the reload would drop it.
    expect(store().status).toBe('ready');
    expect(store().pending).toHaveLength(1);
    expect(store().apply(bio('Con thứ'))).toEqual({ ok: false, reason: 'NOT_LOADED' });
    expect(store().pending).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(loads).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => loads === 3);
    // Then 2 s and 4 s: no request in between, and never the op again.
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(1999);
    expect(loads).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => loads === 4);
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(4000);
    await until(() => loads === 5);
    await retryScheduled();
    // Seven fake seconds in: one POST and five GETs, nothing more.
    expect(posts()).toBe(1);
    expect(api.calls).toHaveLength(6);
    expect(store().pending).toHaveLength(1);

    treeUp = true;
    await vi.advanceTimersByTimeAsync(8000);
    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(store().confirmedVersion).toBe(9);
    expect(store().pending).toEqual([]);
    expect(store().retrying).toBe(false);
    expect(posts()).toBe(1);
  });

  it('shows the error when the tree cannot be read any more, keeping the unsent ops', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        loads += 1;
        return loads === 1 ? { body: FAMILY } : apiErrorReply('NOT_FOUND', 404);
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().status).toBe('error'));
    expect(store().loadError).toMatchObject({ code: 'NOT_FOUND' });
    expect(store().pending).toHaveLength(1);
    expect(selectHasUnsentChanges(store())).toBe(true);
  });

  it('refuses an edit while the reload is on its way, so none is dropped unseen', async () => {
    const held = gate();
    let loads = 0;
    const api = mockApi({
      ...treeRoutes(),
      [TREE]: async () => {
        loads += 1;
        if (loads === 2) await held.wait;
        return { body: { ...FAMILY, version: loads === 1 ? 3 : 5 } };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(loads).toBe(2));

    expect(store().apply(addPerson(NEW_ID))).toEqual({ ok: false, reason: 'NOT_LOADED' });
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
    held.open();
    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
    expect(store().pending).toEqual([]);
    expect(store().confirmedVersion).toBe(5);
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

describe('a notice nobody has seen yet', () => {
  it('survives opening another family tree', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));

    await store().load(OTHER_CLAN);
    expect(store().clanId).toBe(OTHER_CLAN);
    expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID });
    store().dismissNotice();
    expect(store().notice).toBeNull();
  });

  it('survives opening another family tree after a refused op', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => apiErrorReply('FORBIDDEN', 403),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    await store().load(OTHER_CLAN);
    expect(store().notice).toMatchObject({ kind: 'rejected', clanId: CLAN_ID });
  });

  it('is replaced by a discarded notice, which the guard asked about first', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => ({ status: 503, body: {} }),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await store().load(CLAN_ID);
    useTreeStore.setState({ notice: { kind: 'reloaded', clanId: CLAN_ID } });
    store().apply(bio('Con trưởng'));
    await store().load(OTHER_CLAN);
    expect(store().notice).toEqual({ kind: 'discarded', clanId: CLAN_ID, count: 1 });
  });
});

describe('a refused op with ops that depend on it', () => {
  it('says how many dependent ops were dropped with it', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => apiErrorReply('FORBIDDEN', 403),
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    store().apply({
      type: 'addUnion',
      payload: { id: OTHER_ID, partnerIds: [SON, NEW_ID], order: 1, status: 'married' },
    });
    expect(store().pending).toHaveLength(2);

    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().notice).toMatchObject({ kind: 'rejected', clanId: CLAN_ID, dropped: 1 });
  });
});

describe('when the session has expired', () => {
  it('stops sending, keeps every op and asks to sign in again', async () => {
    let signedIn = false;
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return signedIn ? { body: { seq: 3 + bodies.length } } : UNAUTHENTICATED_REPLY;
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    store().apply(addPerson(NEW_ID));

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'signedOut', clanId: CLAN_ID }));
    expect(store().signedOut).toBe(true);
    expect(store().pending).toHaveLength(2);
    expect(store().tree.persons[NEW_ID]).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies).toHaveLength(1);

    // Signed in again (another tab, or the sign-in page): opening the tree sends them.
    signedIn = true;
    await store().load(CLAN_ID);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().signedOut).toBe(false);
    expect(store().notice).toBeNull();
    expect(store().confirmedTree.persons[NEW_ID]).toBeDefined();
    expect(bodies).toHaveLength(3);
  });

  it('sends again with the next edit', async () => {
    let signedIn = false;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => (signedIn ? { body: { seq: 4 } } : UNAUTHENTICATED_REPLY),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().signedOut).toBe(true));

    signedIn = true;
    store().apply(addPerson(NEW_ID));
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().signedOut).toBe(false);
  });
});

describe('unsent changes', () => {
  it('can be read as a plain boolean', async () => {
    const held = gate();
    mockApi({
      ...treeRoutes(),
      [OPS]: async () => {
        await held.wait;
        return { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    expect(selectHasUnsentChanges(store())).toBe(false);
    store().apply(bio('Con trưởng'));
    expect(selectHasUnsentChanges(store())).toBe(true);
    held.open();
    await vi.waitFor(() => expect(selectHasUnsentChanges(store())).toBe(false));
  });
});

describe('opening the tree again', () => {
  it('keeps unsent changes of the same family tree', async () => {
    const held = gate();
    mockApi({
      ...treeRoutes(),
      [OPS]: async () => {
        await held.wait;
        return { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    await store().load(CLAN_ID);
    expect(store().pending).toHaveLength(1);
    expect(store().tree.persons[NEW_ID]).toBeDefined();
    expect(store().notice).toBeNull();

    held.open();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().confirmedTree.persons[NEW_ID]).toBeDefined();
  });

  it('keeps a loaded tree on screen and refreshes it quietly', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        loads += 1;
        return { body: { ...FAMILY, version: loads === 1 ? 3 : 6 } };
      },
    });
    await store().load(CLAN_ID);
    const shown = store().tree;

    const again = store().load(CLAN_ID);
    expect(store().status).toBe('ready');
    expect(store().tree).toBe(shown);
    await again;
    expect(loads).toBe(2);
    expect(store().confirmedVersion).toBe(6);
    expect(store().status).toBe('ready');
    expect(store().notice).toBeNull();
  });

  it('asks for the tree once when opened twice in a row (StrictMode)', async () => {
    const api = mockApi(treeRoutes());
    const first = store().load(CLAN_ID);
    await store().load(CLAN_ID);
    await first;
    expect(store().status).toBe('ready');
    expect(api.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('says how many unsent changes were dropped when another family tree opens', async () => {
    const held = gate();
    let posted = 0;
    mockApi({
      ...treeRoutes(),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: { ...EMPTY_TREE_RESPONSE, version: 11 } }),
      [OPS]: async () => {
        posted += 1;
        await held.wait;
        return { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    store().apply(addPerson(NEW_ID));
    await vi.waitFor(() => expect(posted).toBe(1));

    await store().load(OTHER_CLAN);
    expect(store().notice).toEqual({ kind: 'discarded', clanId: CLAN_ID, count: 2 });
    expect(store().clanId).toBe(OTHER_CLAN);

    // The answer for the old family tree arrives late: it must change nothing.
    held.open();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store().confirmedVersion).toBe(11);
    expect(store().pending).toEqual([]);
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
    expect(posted).toBe(1);
  });

  it('says how many unsent changes were dropped when a failed tree is opened again', async () => {
    let loads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        loads += 1;
        return loads === 2 ? apiErrorReply('FORBIDDEN', 403) : { body: FAMILY };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().status).toBe('error'));

    await store().load(CLAN_ID);
    expect(store().status).toBe('ready');
    expect(store().notice).toEqual({ kind: 'discarded', clanId: CLAN_ID, count: 1 });
    expect(store().pending).toEqual([]);
  });
});

describe('before the tree is ready', () => {
  it('refuses an edit while loading, without throwing', async () => {
    mockApi(treeRoutes());
    const loading = store().load(CLAN_ID);
    expect(store().apply(bio('Con trưởng'))).toEqual({ ok: false, reason: 'NOT_LOADED' });
    await loading;
    expect(store().pending).toEqual([]);
  });

  it('refuses an edit after a failed load, without throwing', async () => {
    mockApi({ [TREE]: () => apiErrorReply('NOT_FOUND', 404) });
    await store().load(CLAN_ID);
    expect(store().apply(bio('Con trưởng'))).toEqual({ ok: false, reason: 'NOT_LOADED' });
  });
});
