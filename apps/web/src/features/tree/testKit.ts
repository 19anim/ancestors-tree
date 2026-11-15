import type { Clan, TreeResponse } from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import { screen } from '@testing-library/react';
import { mockApi } from '../../test/api';
import { CLAN, CLAN_ID, treeRoutes } from './fixtures';

export const OPS = `POST /clans/${CLAN_ID}/ops`;
export const EDITOR: Clan = { ...CLAN, role: 'editor' };

/** The ops inside the op of a sent request, which must be a batch. */
export function batchOps(request: unknown): Op[] {
  const { op } = request as { op: Op };
  if (op.type !== 'batch') throw new Error(`Expected a batch, got ${op.type}`);
  return op.payload.ops;
}

/** A person's card button, named by their label: the name, then the years and generation. */
export function cardName(name: string): RegExp {
  return new RegExp(`^${name}(,|$)`);
}

export function card(name: string): HTMLElement {
  return screen.getByRole('button', { name: cardName(name) });
}

/** Mocks the tree and accepts every op; returns the bodies the page sent. */
export function editableTree(tree: TreeResponse, clan: Clan = CLAN) {
  let seq = tree.version;
  const api = mockApi({
    ...treeRoutes(tree, clan),
    [OPS]: () => {
      seq += 1;
      return { body: { seq } };
    },
  });
  return () => api.calls.filter((call) => call.method === 'POST').map((call) => call.body);
}
