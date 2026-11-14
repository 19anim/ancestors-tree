import type { Op, Person } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi, UNAUTHENTICATED_REPLY, type MockRoutes } from '../../test/api';
import {
  CLAN_ID,
  EMPTY_TREE_RESPONSE,
  FAMILY,
  fixturePerson,
  GRANDPA,
  LOOSE,
  ME,
  OTHER_USER_ID,
  remoteEntry,
  SON,
  treeRoutes,
} from './fixtures';
import { MAX_UNDO_STEPS } from './pending';
import { SAVED_QUEUE_KEY, writeSavedQueue } from './persist';
import {
  MAX_CONFLICTS_IN_A_ROW,
  RETRY_DELAYS_MS,
  resetTreeStore,
  selectHasUnsentChanges,
  signOutTreeStore,
  useTreeStore,
} from './store';

const OPS = `POST /clans/${CLAN_ID}/ops`;
const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const OTHER_ID = '64b7f0c2a1b2c3d4e5f6a0f2';
const addPerson = (id: string, fullName = 'Nguyễn Văn Út'): Op => ({
  type: 'addPerson',
  payload: fixturePerson(id, fullName),
});

const store = () => useTreeStore.getState();
const TREE = `GET /clans/${CLAN_ID}/tree`;
const OPS_LOG = `GET /clans/${CLAN_ID}/ops`;
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
  signOutTreeStore();
  store().setAccount(ME.id);
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
      expectedUserId: ME.id,
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
      { op: addPerson(NEW_ID), baseVersion: 0, expectedUserId: ME.id },
      { op: addPerson(OTHER_ID, 'Nguyễn Văn Sáu'), baseVersion: 1, expectedUserId: ME.id },
    ]);
    expect(store().confirmedVersion).toBe(2);
  });
});

describe('when the server says no', () => {
  it('rebases after a version conflict: the missed change and the edit both stay', async () => {
    const bodies: unknown[] = [];
    let treeReads = 0;
    const someoneElse = addPerson(OTHER_ID, 'Nguyễn Văn Sáu');
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        treeReads += 1;
        return { body: FAMILY };
      },
      [OPS_LOG]: ({ url }) => ({
        body: url.searchParams.get('since') === '3' ? [remoteEntry(4, someoneElse)] : [],
      }),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return bodies.length === 1 ? apiErrorReply('VERSION_CONFLICT', 409) : { body: { seq: 5 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));

    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies).toEqual([
      { op: addPerson(NEW_ID), baseVersion: 3, expectedUserId: ME.id },
      { op: addPerson(NEW_ID), baseVersion: 4, expectedUserId: ME.id },
    ]);
    expect(store().confirmedVersion).toBe(5);
    expect(store().tree.persons[OTHER_ID]).toBeDefined();
    expect(store().tree.persons[NEW_ID]).toBeDefined();
    expect(store().notice).toBeNull();
    expect(treeReads).toBe(1);
  });

  it('drops an edit the missed changes made impossible, and says why', async () => {
    const unionId = '64b7f0c2a1b2c3d4e5f6b0f1';
    const looseChild: Op = {
      type: 'batch',
      payload: {
        ops: [
          {
            type: 'addUnion',
            payload: { id: unionId, partnerIds: [LOOSE], order: 1, status: 'married' },
          },
          {
            type: 'addPerson',
            payload: fixturePerson(OTHER_ID, 'Trần Văn Cường', { parentUnionId: unionId }),
          },
        ],
      },
    };
    const api = mockApi({
      ...treeRoutes(),
      [OPS_LOG]: () => ({ body: [remoteEntry(4, looseChild)] }),
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply({ type: 'deletePerson', payload: { id: LOOSE } });

    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    expect(store().notice).toMatchObject({
      kind: 'rejected',
      clanId: CLAN_ID,
      error: { code: 'PERSON_HAS_CHILDREN' },
      dropped: 0,
    });
    expect(store().pending).toEqual([]);
    expect(store().tree.persons[LOOSE]).toBeDefined();
    expect(store().confirmedVersion).toBe(4);
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it(`reloads the whole tree after ${MAX_CONFLICTS_IN_A_ROW} conflicts in a row`, async () => {
    let treeReads = 0;
    const api = mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        treeReads += 1;
        return { body: { ...FAMILY, version: treeReads === 1 ? 3 : 8 } };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID }));
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(MAX_CONFLICTS_IN_A_ROW);
    expect(
      api.calls.filter((call) => call.path.endsWith('/ops') && call.method === 'GET'),
    ).toHaveLength(MAX_CONFLICTS_IN_A_ROW - 1);
    expect(treeReads).toBe(2);
    expect(store().confirmedVersion).toBe(8);
    expect(store().pending).toEqual([]);
  });

  it('confirms an op that was saved although its answer was lost', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let posts = 0;
    mockApi({
      ...treeRoutes(),
      // The first answer is lost on the way back; the server did save the op as seq 4.
      [OPS]: () => {
        posts += 1;
        return posts === 1 ? { status: 503, body: {} } : apiErrorReply('VERSION_CONFLICT', 409);
      },
      [OPS_LOG]: () => ({ body: [remoteEntry(4, bio('Con trưởng'), ME.id)] }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(1000);

    await until(() => store().pending.length === 0);
    expect(posts).toBe(2);
    expect(store().confirmedVersion).toBe(4);
    expect(store().confirmedTree.persons[SON]?.bio).toBe('Con trưởng');
    expect(store().notice).toBeNull();
  });

  it('rolls back an op refused with a reason this version does not know', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => ({
        status: 422,
        body: { error: { code: 'RULE_VIOLATION', message: 'No', reason: 'A_FUTURE_RULE' } },
      }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    expect(store().notice).toMatchObject({ error: { code: 'RULE_VIOLATION' } });
    expect(store().tree.persons[SON]?.bio).toBeUndefined();
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

describe('when the reload after an unreadable answer fails', () => {
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
      [OPS]: () => ({ body: { saved: true } }),
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
      [OPS]: () => ({ body: { saved: true } }),
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
      [OPS]: () => ({ body: { saved: true } }),
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
      [OPS]: () => ({ body: { saved: true } }),
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
    await retryScheduled();
    await store().load(OTHER_CLAN);
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: false,
    });
  });
});

describe('the account', () => {
  it('drops the unsent ops of the previous account when another one signs in', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    store().setAccount(OTHER_USER_ID);
    expect(store().userId).toBe(OTHER_USER_ID);
    expect(store().pending).toEqual([]);
    expect(store().clanId).toBeNull();
    // The op was on its way: it may have been saved after all.
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: true,
    });

    await store().load(CLAN_ID);
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: true,
    });
  });

  it('keeps everything when the same account is set again', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    useTreeStore.setState({ notice: { kind: 'reloaded', clanId: CLAN_ID } });
    store().setAccount(ME.id);
    expect(store().pending).toHaveLength(1);
    expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID });
  });

  it('sends the kept ops when the same account signs in again after its session expired', async () => {
    let signedIn = false;
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return signedIn ? { body: { seq: 4 } } : UNAUTHENTICATED_REPLY;
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().signedOut).toBe(true));

    signedIn = true;
    store().setAccount(ME.id);
    expect(store().signedOut).toBe(false);
    expect(store().notice).toBeNull();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies).toHaveLength(2);
  });

  it('refuses an edit until the account is known', async () => {
    signOutTreeStore();
    const api = mockApi(treeRoutes());
    await store().load(CLAN_ID);
    expect(store().apply(bio('Con trưởng'))).toEqual({ ok: false, reason: 'NOT_LOADED' });
    expect(api.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('survives a reset but not a sign-out', () => {
    resetTreeStore();
    expect(store().userId).toBe(ME.id);
    signOutTreeStore();
    expect(store().userId).toBeNull();
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

describe('when the session belongs to another account', () => {
  it('stops sending, keeps every op, and sends them when the right account is back', async () => {
    let mismatch = true;
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return mismatch ? apiErrorReply('IDENTITY_MISMATCH', 409) : { body: { seq: 4 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await vi.waitFor(() =>
      expect(store().notice).toEqual({ kind: 'otherAccount', clanId: CLAN_ID }),
    );
    expect(store().otherAccount).toBe(true);
    expect(store().pending).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies).toHaveLength(1);

    // The user signed in again with the account that made the change.
    mismatch = false;
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().otherAccount).toBe(false);
    expect(store().notice).toBeNull();
  });

  it('drops them when the tab learns that the other account is signed in', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => apiErrorReply('IDENTITY_MISMATCH', 409) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().otherAccount).toBe(true));
    store().setAccount(OTHER_USER_ID);
    expect(store().pending).toEqual([]);
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: false,
    });
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
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 2,
      inFlight: true,
    });
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
      [OPS]: () => ({ body: { saved: true } }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().status).toBe('error'));

    await store().load(CLAN_ID);
    expect(store().status).toBe('ready');
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: false,
    });
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

describe('counting conflicts in a row', () => {
  it('starts again for each edit: two dropped edits do not make the next 409 a reload', async () => {
    const FIRST = '64b7f0c2a1b2c3d4e5f6a0f3';
    const SECOND = '64b7f0c2a1b2c3d4e5f6a0f4';
    let bioPosts = 0;
    let treeReads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        treeReads += 1;
        return { body: FAMILY };
      },
      // Someone else saved a person with the id of each of our first two edits.
      [OPS_LOG]: ({ url }) => {
        const since = url.searchParams.get('since');
        if (since === '3') return { body: [remoteEntry(4, addPerson(FIRST, 'Người khác'))] };
        if (since === '4') return { body: [remoteEntry(5, addPerson(SECOND, 'Người khác'))] };
        return { body: [] };
      },
      [OPS]: ({ body }) => {
        const op = (body as { op: Op }).op;
        if (op.type !== 'updatePerson') return apiErrorReply('VERSION_CONFLICT', 409);
        bioPosts += 1;
        return bioPosts === 1 ? apiErrorReply('VERSION_CONFLICT', 409) : { body: { seq: 6 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(FIRST));
    await until(() => store().confirmedVersion === 4 && store().pending.length === 0);
    store().apply(addPerson(SECOND));
    await until(() => store().confirmedVersion === 5 && store().pending.length === 0);

    store().apply(bio('Con trưởng'));
    await until(() => store().pending.length === 0);
    expect(store().notice?.kind).not.toBe('reloaded');
    expect(store().confirmedVersion).toBe(6);
    expect(store().confirmedTree.persons[SON]?.bio).toBe('Con trưởng');
    expect(treeReads).toBe(1);
  });
});

describe('the rebase and what happens around it', () => {
  /** A 409 for the first POST, then the next seq each time. */
  function conflictOnce(): MockRoutes[string] {
    let posts = 0;
    let seq = 3;
    return () => {
      posts += 1;
      if (posts === 1) return apiErrorReply('VERSION_CONFLICT', 409);
      seq += 1;
      return { body: { seq } };
    };
  }

  it('replays an edit made while the rebase reads the log, after the one that was refused', async () => {
    const held = gate();
    const api = mockApi({
      ...treeRoutes(),
      [OPS_LOG]: async () => {
        await held.wait;
        return { body: [] };
      },
      [OPS]: conflictOnce(),
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    await until(() =>
      api.calls.some((call) => call.path.endsWith('/ops') && call.method === 'GET'),
    );

    expect(store().apply(bio('Con trưởng'))).toEqual({ ok: true });
    held.open();
    await until(() => store().pending.length === 0);
    expect(store().confirmedTree.persons[NEW_ID]).toBeDefined();
    expect(store().confirmedTree.persons[SON]?.bio).toBe('Con trưởng');
    expect(store().confirmedVersion).toBe(5);
    expect(store().notice).toBeNull();
  });

  it('ignores a rebase answer that arrives after another family tree was opened', async () => {
    const held = gate();
    mockApi({
      ...treeRoutes(),
      [OPS_LOG]: async () => {
        await held.wait;
        return { body: [remoteEntry(4, addPerson(OTHER_ID, 'Nguyễn Văn Sáu'))] };
      },
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await until(() => vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('since=')));

    await store().load(OTHER_CLAN);
    const before = store();
    held.open();
    await new Promise((resolve) => realSetTimeout(resolve, 20));
    expect(store().clanId).toBe(OTHER_CLAN);
    expect(store().confirmedTree).toBe(before.confirmedTree);
    expect(store().confirmedVersion).toBe(before.confirmedVersion);
    expect(store().pending).toEqual([]);
    expect(store().notice).toMatchObject({ kind: 'discarded', count: 1 });
  });

  it('retries the log read with backoff when the server cannot be reached', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reads = 0;
    mockApi({
      ...treeRoutes(),
      [OPS_LOG]: () => {
        reads += 1;
        return reads === 1 ? { status: 503, body: {} } : { body: [] };
      },
      [OPS]: conflictOnce(),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await retryScheduled();
    expect(store().retrying).toBe(true);
    expect(store().pending).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(reads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => store().pending.length === 0);
    expect(reads).toBe(2);
    expect(store().notice).toBeNull();
  });

  it('stops and keeps the ops when the session ended during the log read', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS_LOG]: () => UNAUTHENTICATED_REPLY,
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await until(() => store().signedOut);
    expect(store().notice).toEqual({ kind: 'signedOut', clanId: CLAN_ID });
    expect(store().pending).toHaveLength(1);
    expect(store().retrying).toBe(false);
  });

  it('shows an error and keeps the ops when the log may not be read', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS_LOG]: () => apiErrorReply('FORBIDDEN', 403),
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await until(() => store().status === 'error');
    expect(store().loadError).toMatchObject({ code: 'FORBIDDEN' });
    expect(store().pending).toHaveLength(1);
    expect(selectHasUnsentChanges(store())).toBe(true);
  });

  it('reads the whole tree when the missed log has a gap', async () => {
    let treeReads = 0;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => {
        treeReads += 1;
        return { body: { ...FAMILY, version: treeReads === 1 ? 3 : 9 } };
      },
      // Seq 4 is missing.
      [OPS_LOG]: () => ({ body: [remoteEntry(5, addPerson(OTHER_ID, 'Nguyễn Văn Sáu'))] }),
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));

    await until(() => store().notice?.kind === 'reloaded');
    expect(treeReads).toBe(2);
    expect(store().confirmedVersion).toBe(9);
    expect(store().pending).toEqual([]);
  });

  it('counts the edits that depended on a dropped one', async () => {
    const unionId = '64b7f0c2a1b2c3d4e5f6b0f1';
    const union: Op = {
      type: 'addUnion',
      payload: { id: unionId, partnerIds: [LOOSE], order: 1, status: 'married' },
    };
    mockApi({
      ...treeRoutes(),
      // Someone else used the id of our new union for a person.
      [OPS_LOG]: () => ({ body: [remoteEntry(4, addPerson(unionId, 'Người khác'))] }),
      [OPS]: () => apiErrorReply('VERSION_CONFLICT', 409),
    });
    await store().load(CLAN_ID);
    store().apply(union);
    // The child needs the union, which the missed change made impossible.
    store().apply({
      type: 'addPerson',
      payload: fixturePerson(NEW_ID, 'Trần Văn Cường', { parentUnionId: unionId }),
    });

    await until(() => store().notice?.kind === 'rejected');
    expect(store().notice).toMatchObject({
      kind: 'rejected',
      clanId: CLAN_ID,
      error: { code: 'DUPLICATE_ID' },
    });
    const notice = store().notice;
    expect(notice?.kind === 'rejected' && notice.dropped).toBeGreaterThan(0);
    expect(store().pending).toEqual([]);
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
  });
});

describe('keeping the queue across a reload of the tab', () => {
  const saved = (overrides: Partial<Parameters<typeof writeSavedQueue>[0]> = {}) =>
    writeSavedQueue({
      format: 1,
      userId: ME.id,
      clanId: CLAN_ID,
      version: 3,
      entries: [{ id: 1, op: bio('Con trưởng') }],
      ...overrides,
    });
  /** A fresh tab: no account yet, then the app shell learns it. */
  const reloadTab = () => {
    signOutTreeStore();
  };
  const savedQueue = () => JSON.parse(sessionStorage.getItem(SAVED_QUEUE_KEY) ?? 'null');

  it('saves the queue with the account, the tree and the version', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    expect(savedQueue()).toEqual({
      format: 1,
      userId: ME.id,
      clanId: CLAN_ID,
      version: 3,
      entries: [{ id: expect.any(Number), op: bio('Con trưởng') }],
    });
  });

  it('restores it for the same account at the same version, and sends it', async () => {
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return { body: { seq: 4 } };
      },
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    expect(store().clanId).toBe(CLAN_ID);
    await vi.waitFor(() => expect(store().confirmedVersion).toBe(4));
    expect(bodies).toEqual([{ op: bio('Con trưởng'), baseVersion: 3, expectedUserId: ME.id }]);
    expect(store().pending).toEqual([]);
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('restores it through the log when the tree moved on', async () => {
    const someoneElse = addPerson(OTHER_ID, 'Nguyễn Văn Sáu');
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes({
        ...FAMILY,
        version: 4,
        persons: [...FAMILY.persons, someoneElse.payload as Person],
      }),
      [OPS_LOG]: () => ({ body: [remoteEntry(4, someoneElse)] }),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return { body: { seq: 5 } };
      },
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().confirmedVersion).toBe(5));
    expect(bodies).toEqual([{ op: bio('Con trưởng'), baseVersion: 4, expectedUserId: ME.id }]);
    expect(store().tree.persons[OTHER_ID]).toBeDefined();
    expect(store().tree.persons[SON]?.bio).toBe('Con trưởng');
  });

  it('confirms a restored change that was saved just before the reload', async () => {
    const api = mockApi({
      ...treeRoutes({
        ...FAMILY,
        version: 4,
        persons: FAMILY.persons.map((person) =>
          person.id === SON ? { ...person, bio: 'Con trưởng' } : person,
        ),
      }),
      [OPS_LOG]: () => ({ body: [remoteEntry(4, bio('Con trưởng'), ME.id)] }),
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().pending).toEqual([]);
    expect(store().notice).toBeNull();
    expect(api.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('keeps it when the tree cannot be read yet, and restores it on the next load', async () => {
    let up = false;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => (up ? { body: FAMILY } : { status: 503, body: {} }),
      [OPS]: () => ({ body: { seq: 4 } }),
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().status).toBe('error'));
    expect(store().pending).toHaveLength(1);
    expect(savedQueue()?.entries).toHaveLength(1);

    up = true;
    await store().load(CLAN_ID);
    await vi.waitFor(() => expect(store().confirmedVersion).toBe(4));
    expect(store().pending).toEqual([]);
  });

  it('drops a queue another account saved, and says so', () => {
    reloadTab();
    saved({ userId: OTHER_USER_ID });
    store().setAccount(ME.id);
    expect(store().pending).toEqual([]);
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: false,
    });
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('drops it when another family tree is already open, and says so', async () => {
    mockApi({
      ...treeRoutes(),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    reloadTab();
    saved();
    await store().load(OTHER_CLAN);
    store().setAccount(ME.id);
    expect(store().clanId).toBe(OTHER_CLAN);
    expect(store().notice).toEqual({
      kind: 'discarded',
      clanId: CLAN_ID,
      count: 1,
      inFlight: false,
    });
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('says so when the saved queue cannot be read', () => {
    reloadTab();
    sessionStorage.setItem(SAVED_QUEUE_KEY, '{broken');
    store().setAccount(ME.id);
    expect(store().notice).toEqual({ kind: 'savedUnreadable', clanId: null });
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('moves the next entry id past the restored ones', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    reloadTab();
    // Far above any id an earlier test handed out, so only the restore can lift the counter.
    saved({
      entries: [
        { id: 1000, op: bio('Con trưởng') },
        { id: 1001, op: bio('Con cả') },
      ],
    });
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().apply(addPerson(NEW_ID))).toEqual({ ok: true });
    const ids = store().pending.map((entry) => entry.id);
    expect(ids.slice(0, 2)).toEqual([1000, 1001]);
    expect(ids[2]).toBeGreaterThan(1001);
  });

  it('reads the tree again and says so when the log does not fit the saved queue', async () => {
    mockApi({
      ...treeRoutes({ ...FAMILY, version: 9 }),
      // Seq 4 is missing.
      [OPS_LOG]: () => ({ body: [remoteEntry(5, addPerson(OTHER_ID, 'Nguyễn Văn Sáu'))] }),
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().notice).toEqual({ kind: 'reloaded', clanId: CLAN_ID });
    expect(store().pending).toEqual([]);
    expect(store().confirmedVersion).toBe(9);
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });

  it('says so when a restored change no longer applies', async () => {
    // Someone else took the id this change would add.
    const taken = addPerson(NEW_ID, 'Người khác');
    mockApi({
      ...treeRoutes({
        ...FAMILY,
        version: 4,
        persons: [...FAMILY.persons, taken.payload as Person],
      }),
      [OPS_LOG]: () => ({ body: [remoteEntry(4, taken)] }),
    });
    reloadTab();
    saved({ entries: [{ id: 1, op: addPerson(NEW_ID) }] });
    store().setAccount(ME.id);
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().notice).toMatchObject({
      kind: 'rejected',
      clanId: CLAN_ID,
      error: { code: 'DUPLICATE_ID' },
      dropped: 0,
    });
    expect(store().pending).toEqual([]);
  });

  it('tries the restore again by itself after a network failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let up = false;
    mockApi({
      ...treeRoutes(),
      [TREE]: () => (up ? { body: FAMILY } : { status: 503, body: {} }),
      [OPS]: () => ({ body: { seq: 4 } }),
    });
    reloadTab();
    saved();
    store().setAccount(ME.id);
    await retryScheduled();
    expect(store().pending).toHaveLength(1);
    expect(savedQueue()?.entries).toHaveLength(1);

    up = true;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await until(() => store().confirmedVersion === 4);
    expect(store().status).toBe('ready');
    expect(store().pending).toEqual([]);
  });

  it('forgets the saved queue on sign-out', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    expect(savedQueue()).not.toBeNull();
    signOutTreeStore();
    expect(sessionStorage.getItem(SAVED_QUEUE_KEY)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undoes and redoes a change, also one not saved yet', async () => {
    const held = gate();
    const bodies: Array<Record<string, unknown>> = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: async ({ body }) => {
        bodies.push(body as Record<string, unknown>);
        if (bodies.length === 1) await held.wait;
        return { body: { seq: 3 + bodies.length } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    expect(store().undo()).toEqual({ ok: true });
    expect(store().tree.persons[NEW_ID]).toBeUndefined();
    expect(store().undoStack).toEqual([]);
    expect(store().redoStack).toHaveLength(1);
    expect(store().pending[1]?.reverts).toEqual({ pendingId: store().pending[0]?.id });

    held.open();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    // The undo names the change it undoes by the seq it got.
    expect(bodies[1]).toEqual({
      op: { type: 'deletePerson', payload: { id: NEW_ID } },
      baseVersion: 4,
      expectedUserId: ME.id,
      revertsSeq: 4,
    });

    expect(store().redo()).toEqual({ ok: true });
    expect(store().tree.persons[NEW_ID]).toBeDefined();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    // Redo is the change made again: no revertsSeq.
    expect(bodies[2]).toEqual({ op: addPerson(NEW_ID), baseVersion: 5, expectedUserId: ME.id });
    expect(store().undoStack.map((entry) => entry.ref)).toEqual([{ seq: 6 }]);
    expect(store().redoStack).toEqual([]);
  });

  it('answers null when there is nothing to undo or redo', async () => {
    mockApi(treeRoutes());
    await store().load(CLAN_ID);
    expect(store().undo()).toBeNull();
    expect(store().redo()).toBeNull();
  });

  it('says why an undo no longer applies, and drops that step', async () => {
    mockApi(treeRoutes());
    await store().load(CLAN_ID);
    useTreeStore.setState({
      undoStack: [
        {
          op: addPerson(NEW_ID),
          inverse: { type: 'deletePerson', payload: { id: GRANDPA } },
          ref: { seq: 2 },
        },
      ],
    });
    expect(store().undo()).toEqual({ ok: false, reason: 'PROGENITOR_PROTECTED' });
    expect(store().undoStack).toEqual([]);
    expect(store().pending).toEqual([]);
  });

  it('starts a new branch: a new change forgets what could be redone', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(bio('Một'));
    store().undo();
    expect(store().redoStack).toHaveLength(1);
    store().apply(bio('Hai'));
    expect(store().redoStack).toEqual([]);
  });

  it('forgets the steps of a refused change', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => apiErrorReply('FORBIDDEN', 403) });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    expect(store().undoStack).toEqual([]);
  });

  it('keeps the step of a rebased change with its inverse on the new tree', async () => {
    let posts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS_LOG]: () => ({ body: [remoteEntry(4, bio('Từ máy khác'))] }),
      [OPS]: () => {
        posts += 1;
        return posts === 1 ? apiErrorReply('VERSION_CONFLICT', 409) : { body: { seq: 5 } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Của tôi'));
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().undoStack).toEqual([
      { op: bio('Của tôi'), inverse: bio('Từ máy khác'), ref: { seq: 5 } },
    ]);
  });

  it('names a change by its seq when its lost answer is found in the log', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bodies: Array<Record<string, unknown>> = [];
    let inverse: Op = bio('');
    mockApi({
      ...treeRoutes(),
      // The answers to the edit and then to its undo are lost: both were saved all the same.
      [OPS]: ({ body }) => {
        bodies.push(body as Record<string, unknown>);
        return bodies.length % 2 === 1
          ? { status: 503, body: {} }
          : apiErrorReply('VERSION_CONFLICT', 409);
      },
      [OPS_LOG]: ({ url }) => ({
        body:
          url.searchParams.get('since') === '3'
            ? [remoteEntry(4, bio('Con trưởng'), ME.id)]
            : [remoteEntry(5, inverse, ME.id)],
      }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => store().pending.length === 0 && store().confirmedVersion === 4);
    expect(store().undoStack.map((step) => step.ref)).toEqual([{ seq: 4 }]);

    inverse = store().undoStack[0]?.inverse ?? inverse;
    expect(store().undo()).toEqual({ ok: true });
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => store().pending.length === 0 && store().confirmedVersion === 5);
    expect(bodies[2]).toMatchObject({ revertsSeq: 4 });
    expect(store().redoStack.map((step) => step.ref)).toEqual([{ seq: 5 }]);
  });

  it('forgets the steps of unsent changes when the whole tree is read again, and keeps saved ones', async () => {
    let posts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        posts += 1;
        return posts === 1 ? { body: { seq: 4 } } : apiErrorReply('VERSION_CONFLICT', 409);
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Một'));
    store().apply(bio('Hai'));
    store().apply(bio('Tư'));
    store().undo();
    expect(store().undoStack).toHaveLength(2);
    expect(store().redoStack).toHaveLength(1);

    await vi.waitFor(() => expect(store().notice?.kind).toBe('reloaded'));
    expect(store().undoStack.map((step) => step.ref)).toEqual([{ seq: 4 }]);
    expect(store().redoStack).toEqual([]);
  });

  it('names the redo step by the seq of the undo once it is saved', async () => {
    let posts = 0;
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        posts += 1;
        return { body: { seq: 3 + posts } };
      },
    });
    await store().load(CLAN_ID);
    store().apply(bio('Con trưởng'));
    store().undo();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(store().redoStack.map((step) => step.ref)).toEqual([{ seq: 5 }]);
  });

  it('refreshes the inverses of kept steps and forgets the redo of a dropped undo', async () => {
    let posts = 0;
    const FIRST = '64b7f0c2a1b2c3d4e5f6a0f3';
    mockApi({
      ...treeRoutes(),
      [OPS]: () => {
        posts += 1;
        return posts === 1 ? apiErrorReply('FORBIDDEN', 403) : new Promise(() => undefined);
      },
    });
    await store().load(CLAN_ID);
    // The first edit adds a person and sets a bio; the third builds on the person it adds.
    store().apply({
      type: 'batch',
      payload: {
        ops: [
          { type: 'addPerson', payload: fixturePerson(FIRST, 'Nguyễn Văn Út') },
          { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Một' } } },
        ],
      },
    });
    store().apply(bio('Hai'));
    store().apply({ type: 'updatePerson', payload: { id: FIRST, changes: { bio: 'Phụ' } } });
    store().undo();
    expect(store().undoStack).toHaveLength(2);
    expect(store().redoStack).toHaveLength(1);
    expect(store().undoStack[1]?.inverse).toEqual(bio('Một'));

    await vi.waitFor(() => expect(store().notice?.kind).toBe('rejected'));
    // The first edit is gone with the third and the undo of the third.
    expect(store().pending.map((entry) => entry.op)).toEqual([bio('Hai')]);
    expect(store().redoStack).toEqual([]);
    expect(store().undoStack).toHaveLength(1);
    expect(store().undoStack[0]?.op).toEqual(bio('Hai'));
    expect(store().undoStack[0]?.inverse).not.toEqual(bio('Một'));
  });

  it('forgets every step when another family tree is opened or the user signs out', async () => {
    mockApi({
      ...treeRoutes(),
      [OPS]: () => new Promise(() => undefined),
      [`GET /clans/${OTHER_CLAN}/tree`]: () => ({ body: EMPTY_TREE_RESPONSE }),
    });
    await store().load(CLAN_ID);
    store().apply(bio('Một'));
    store().apply(bio('Hai'));
    store().undo();
    expect(store().undoStack).toHaveLength(1);
    expect(store().redoStack).toHaveLength(1);

    await store().load(OTHER_CLAN);
    expect(store().undoStack).toEqual([]);
    expect(store().redoStack).toEqual([]);

    useTreeStore.setState({
      undoStack: [{ op: bio('x'), inverse: bio('y'), ref: { seq: 2 } }],
      redoStack: [{ op: bio('x'), ref: { seq: 3 } }],
    });
    signOutTreeStore();
    expect(store().undoStack).toEqual([]);
    expect(store().redoStack).toEqual([]);
  });

  it.each([
    ['signedOut', UNAUTHENTICATED_REPLY],
    ['otherAccount', apiErrorReply('IDENTITY_MISMATCH', 409)],
  ] as const)(
    'still queues an undo after the queue stopped (%s), and loses nothing',
    async (flag, stop) => {
      let stopped = true;
      mockApi({ ...treeRoutes(), [OPS]: () => (stopped ? stop : { body: { seq: 4 } }) });
      await store().load(CLAN_ID);
      store().apply(bio('Con trưởng'));
      await vi.waitFor(() => expect(store()[flag]).toBe(true));

      expect(store().undo()).toEqual({ ok: true });
      expect(store().pending).toHaveLength(2);
      expect(store().tree.persons[SON]?.bio).toBeUndefined();
      await vi.waitFor(() => expect(store()[flag]).toBe(true));
      expect(store().pending).toHaveLength(2);

      stopped = false;
      store().setAccount(ME.id);
      await store().load(CLAN_ID);
      await vi.waitFor(() => expect(store().pending).toHaveLength(0));
      expect(store().confirmedTree.persons[SON]?.bio).toBeUndefined();
    },
  );

  it(`keeps the latest ${MAX_UNDO_STEPS} steps`, async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    for (let index = 0; index <= MAX_UNDO_STEPS; index += 1) store().apply(bio(`Lần ${index}`));
    expect(store().undoStack).toHaveLength(MAX_UNDO_STEPS);
    expect(store().undoStack[0]?.op).toEqual(bio('Lần 1'));
  });

  it('reverts a saved change as a new change that can be undone', async () => {
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: ({ body }) => {
        bodies.push(body);
        return { body: { seq: 3 + bodies.length } };
      },
    });
    await store().load(CLAN_ID);
    const inverse: Op = { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Cũ' } } };
    expect(store().revertChange(inverse, 2)).toEqual({ ok: true });
    expect(store().tree.persons[SON]?.bio).toBe('Cũ');
    expect(store().pending[0]).toMatchObject({ op: inverse, reverts: { seq: 2 } });
    expect(store().undoStack.at(-1)).toMatchObject({ op: inverse });
    expect(store().redoStack).toEqual([]);
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies[0]).toEqual({
      op: inverse,
      baseVersion: 3,
      expectedUserId: ME.id,
      revertsSeq: 2,
    });

    expect(store().undo()).toEqual({ ok: true });
    expect(store().tree.persons[SON]?.bio).toBeUndefined();
  });

  it('reverts to a point only from the version it was built on, with nothing pending', async () => {
    const held = gate();
    const bodies: unknown[] = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: async ({ body }) => {
        bodies.push(body);
        if (bodies.length === 1) await held.wait;
        return { body: { seq: 3 + bodies.length } };
      },
    });
    await store().load(CLAN_ID);
    const back: Op = { type: 'updatePerson', payload: { id: SON, changes: { bio: 'Cũ' } } };
    expect(store().revertTo(back, 2, 2)).toEqual({ ok: false, reason: 'OUT_OF_DATE' });

    store().apply(addPerson(NEW_ID));
    expect(store().revertTo(back, 2, 3)).toEqual({ ok: false, reason: 'OUT_OF_DATE' });
    held.open();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));

    expect(store().revertTo(back, 2, 4)).toEqual({ ok: true });
    expect(store().pending[0]).toMatchObject({ op: back, revertsToSeq: 2 });
    expect(store().undoStack.at(-1)).toMatchObject({ op: back });
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies[1]).toEqual({ op: back, baseVersion: 4, expectedUserId: ME.id, revertsToSeq: 2 });
  });

  it('undoes a whole revert to a point in one step, naming the revert it undoes', async () => {
    const held = gate();
    const bodies: Array<Record<string, unknown>> = [];
    mockApi({
      ...treeRoutes(),
      [OPS]: async ({ body }) => {
        bodies.push(body as Record<string, unknown>);
        if (bodies.length === 1) await held.wait;
        return { body: { seq: 3 + bodies.length } };
      },
    });
    await store().load(CLAN_ID);
    const before = store().tree;
    const back: Op = {
      type: 'batch',
      payload: {
        ops: [
          { type: 'updatePerson', payload: { id: SON, changes: { fullName: 'Nguyễn Văn Năm' } } },
          { type: 'setProgenitor', payload: { personId: null } },
        ],
      },
    };
    expect(store().revertTo(back, 1, 3)).toEqual({ ok: true });
    expect(store().tree).not.toEqual(before);

    // Undone before the revert is saved: the undo names it by its place in the queue.
    expect(store().undo()).toEqual({ ok: true });
    expect(store().tree).toEqual(before);
    expect(store().pending[1]?.reverts).toEqual({ pendingId: store().pending[0]?.id });

    held.open();
    await vi.waitFor(() => expect(store().pending).toHaveLength(0));
    expect(bodies[0]).toMatchObject({ op: back, revertsToSeq: 1 });
    // Once the revert is saved (seq 4), the undo's POST names that seq.
    expect(bodies[1]).toMatchObject({ baseVersion: 4, revertsSeq: 4 });
    expect(bodies[1]).not.toHaveProperty('revertsToSeq');
    expect(store().tree).toEqual(before);
  });
});
