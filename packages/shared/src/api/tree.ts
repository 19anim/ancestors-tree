import { z } from 'zod';
import { OpSchema } from '../tree/ops.ts';
import { PersonSchema, UnionSchema } from '../tree/schemas.ts';
import { IdSchema } from './common.ts';

/** GET /api/clans/:id/tree: the whole tree at one version. */
export const TreeResponseSchema = z.object({
  version: z.number().int().min(0),
  progenitorId: IdSchema.nullable(),
  persons: z.array(PersonSchema),
  unions: z.array(UnionSchema),
});

/** POST /api/clans/:id/ops: one op, made against `baseVersion` (spec §6.2). */
export const SubmitOpRequestSchema = z.object({
  op: OpSchema,
  baseVersion: z.number().int().min(0),
});

/** The op's sequence number, which is also the tree's new version. */
export const SubmitOpResponseSchema = z.object({ seq: z.number().int().min(1) });

/** Most entries one GET /ops call returns; ask again with the last seq for more. */
export const OPS_PAGE_SIZE = 500;

export const OpsQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
});

export const OperationEntrySchema = z.object({
  seq: z.number().int().min(1),
  userId: IdSchema,
  createdAt: z.iso.datetime(),
  op: OpSchema,
});

export const OperationListSchema = z.array(OperationEntrySchema);

export type TreeResponse = z.infer<typeof TreeResponseSchema>;
export type SubmitOpRequest = z.infer<typeof SubmitOpRequestSchema>;
export type SubmitOpResponse = z.infer<typeof SubmitOpResponseSchema>;
export type OperationEntry = z.infer<typeof OperationEntrySchema>;
