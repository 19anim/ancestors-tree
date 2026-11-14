import { z } from 'zod';
import { OpSchema } from '../tree/ops.ts';
import { IdSchema } from './common.ts';

/** Entries per history page unless the client asks for fewer, and the most it may ask for. */
export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_PAGE_MAX = 100;

/** GET /api/clans/:id/history. */
export const HistoryQuerySchema = z.object({
  /** Only changes with a smaller seq: the next, older page. Omitted for the newest. */
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_MAX).default(HISTORY_PAGE_SIZE),
});

/** One saved change (spec §6.4). */
export const HistoryEntrySchema = z.object({
  seq: z.number().int().min(1),
  userId: IdSchema,
  /** The author's display name today; '' when the account no longer exists. */
  authorName: z.string(),
  createdAt: z.iso.datetime(),
  op: OpSchema,
  /** The op that undoes this change, computed when it was saved ("Revert" sends it). */
  inverse: OpSchema,
  /** This change undid or reverted the change with this seq. */
  revertsSeq: z.number().int().min(1).optional(),
  /** This change reverted the tree to how it was after this seq. */
  revertsToSeq: z.number().int().min(1).optional(),
});

export const HistoryPageSchema = z.object({
  entries: z.array(HistoryEntrySchema),
  /** Pass as `before` for the next page; null when this page reaches the first change. */
  nextBefore: z.number().int().min(1).nullable(),
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
