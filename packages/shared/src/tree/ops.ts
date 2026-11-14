import { z } from 'zod';
import { IdSchema } from '../api/common.ts';
import { PersonChangesSchema, PersonSchema, UnionChangesSchema, UnionSchema } from './schemas.ts';

/** Most ops in one batch. */
export const MAX_BATCH_OPS = 500;

const IdPayloadSchema = z.object({ id: IdSchema });

const AddPersonOpSchema = z.object({ type: z.literal('addPerson'), payload: PersonSchema });
const UpdatePersonOpSchema = z.object({
  type: z.literal('updatePerson'),
  payload: z.object({ id: IdSchema, changes: PersonChangesSchema }),
});
const DeletePersonOpSchema = z.object({
  type: z.literal('deletePerson'),
  payload: IdPayloadSchema,
});
const AddUnionOpSchema = z.object({ type: z.literal('addUnion'), payload: UnionSchema });
const UpdateUnionOpSchema = z.object({
  type: z.literal('updateUnion'),
  payload: z.object({ id: IdSchema, changes: UnionChangesSchema }),
});
const DeleteUnionOpSchema = z.object({ type: z.literal('deleteUnion'), payload: IdPayloadSchema });
const SetParentsOpSchema = z.object({
  type: z.literal('setParents'),
  payload: z.object({ personId: IdSchema, parentUnionId: IdSchema.nullable() }),
});
/** Undo of deletePerson: the person plus every union deleted or changed with them. */
const RestorePersonOpSchema = z.object({
  type: z.literal('restorePerson'),
  payload: z.object({ person: PersonSchema, unions: z.array(UnionSchema).max(100) }),
});
const RestoreUnionOpSchema = z.object({ type: z.literal('restoreUnion'), payload: UnionSchema });
/** Owner only (spec §3). */
const SetProgenitorOpSchema = z.object({
  type: z.literal('setProgenitor'),
  payload: z.object({ personId: IdSchema.nullable() }),
});

const SINGLE_OP_SCHEMAS = [
  AddPersonOpSchema,
  UpdatePersonOpSchema,
  DeletePersonOpSchema,
  AddUnionOpSchema,
  UpdateUnionOpSchema,
  DeleteUnionOpSchema,
  SetParentsOpSchema,
  RestorePersonOpSchema,
  RestoreUnionOpSchema,
  SetProgenitorOpSchema,
] as const;

export const SingleOpSchema = z.discriminatedUnion('type', SINGLE_OP_SCHEMAS);

/** Several ops saved as one change (one undo step). A batch cannot contain another batch. */
export const BatchOpSchema = z.object({
  type: z.literal('batch'),
  payload: z.object({ ops: z.array(SingleOpSchema).min(1).max(MAX_BATCH_OPS) }),
});

export const OpSchema = z.discriminatedUnion('type', [...SINGLE_OP_SCHEMAS, BatchOpSchema]);

export type SingleOp = z.infer<typeof SingleOpSchema>;
export type BatchOp = z.infer<typeof BatchOpSchema>;
export type Op = z.infer<typeof OpSchema>;
export type OpType = Op['type'];

/** Choosing the progenitor is the Owner's (spec §3), also inside a batch. */
export function needsOwner(op: Op): boolean {
  if (op.type === 'batch') return op.payload.ops.some((child) => child.type === 'setProgenitor');
  return op.type === 'setProgenitor';
}
