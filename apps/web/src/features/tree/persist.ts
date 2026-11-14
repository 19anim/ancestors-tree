import { IdSchema } from '@ancestors-tree/shared';
import { OpSchema } from '@ancestors-tree/shared/tree';
import { z } from 'zod';

/** One queue per tab: sessionStorage outlives a reload and a sign-in redirect, not the tab. */
export const SAVED_QUEUE_KEY = 'ancestors-tree:unsent';

const OpRefSchema = z.union([
  z.object({ seq: z.number().int().min(1) }),
  z.object({ pendingId: z.number().int().min(1) }),
]);

const SavedEntrySchema = z.object({
  id: z.number().int().min(1),
  op: OpSchema,
  reverts: OpRefSchema.optional(),
  revertsToSeq: z.number().int().min(1).optional(),
});

/** The unsent entries of one account and family tree, made on `version` (spec §7.3). */
export const SavedQueueSchema = z.object({
  format: z.literal(1),
  userId: IdSchema,
  clanId: IdSchema,
  version: z.number().int().min(0),
  entries: z.array(SavedEntrySchema).min(1),
});

export type SavedQueue = z.infer<typeof SavedQueueSchema>;
export type SavedQueueRead =
  { kind: 'none' } | { kind: 'unreadable' } | { kind: 'saved'; queue: SavedQueue };

export function readSavedQueue(): SavedQueueRead {
  let text: string | null;
  try {
    text = sessionStorage.getItem(SAVED_QUEUE_KEY);
  } catch {
    // Storage is disabled: there is nothing to restore.
    return { kind: 'none' };
  }
  if (text === null) return { kind: 'none' };
  try {
    const parsed = SavedQueueSchema.safeParse(JSON.parse(text));
    return parsed.success ? { kind: 'saved', queue: parsed.data } : { kind: 'unreadable' };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function writeSavedQueue(queue: SavedQueue): void {
  try {
    sessionStorage.setItem(SAVED_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage is full or disabled: the queue still lives in memory, as in P5. The old snapshot
    // is older than the queue now, so a restore from it would lose edits: remove it.
    clearSavedQueue();
  }
}

export function clearSavedQueue(): void {
  try {
    sessionStorage.removeItem(SAVED_QUEUE_KEY);
  } catch {
    // Storage is disabled: nothing was saved.
  }
}
