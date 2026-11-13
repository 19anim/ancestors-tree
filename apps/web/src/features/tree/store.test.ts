import type { Op } from '@ancestors-tree/shared/tree';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorReply, mockApi } from '../../test/api';
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
import { resetTreeStore, useTreeStore } from './store';

const OPS = `POST /clans/${CLAN_ID}/ops`;
const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const OTHER_ID = '64b7f0c2a1b2c3d4e5f6a0f2';
const addPerson = (id: string, fullName = 'Nguyễn Văn Út'): Op => ({
  type: 'addPerson',
  payload: fixturePerson(id, fullName),
});

const store = () => useTreeStore.getState();

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

    await vi.waitFor(() => expect(store().notice).toEqual({ kind: 'reloaded' }));
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

describe('opening the tree again', () => {
  it('keeps unsent changes of the same family tree', async () => {
    mockApi({ ...treeRoutes(), [OPS]: () => new Promise(() => undefined) });
    await store().load(CLAN_ID);
    store().apply(addPerson(NEW_ID));
    await store().load(CLAN_ID);
    expect(store().pending).toHaveLength(1);
    expect(store().tree.persons[NEW_ID]).toBeDefined();
  });
});
