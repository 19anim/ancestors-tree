import {
  IdSchema,
  OPS_PAGE_SIZE,
  OperationListSchema,
  OpsQuerySchema,
  SubmitOpRequestSchema,
  SubmitOpResponseSchema,
  TreeResponseSchema,
  type OperationEntry,
} from '@ancestors-tree/shared';
import {
  applyOp,
  needsOwner,
  OpError,
  type ApplyOpResult,
  type Op,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import mongoose, { type Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { OperationModel } from '../models/Operation.ts';
import { findClan, loadTreeState, saveTreeChanges } from '../tree/store.ts';

const ClanParamsSchema = z.object({ id: IdSchema });
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown }).code === DUPLICATE_KEY;
}

function applyOrReject(tree: TreeState, op: Op): ApplyOpResult {
  try {
    return applyOp(tree, op);
  } catch (error) {
    if (error instanceof OpError) {
      throw new AppError('RULE_VIOLATION', error.message, undefined, error.code);
    }
    throw error;
  }
}

interface OperationRecord {
  seq: number;
  userId: Types.ObjectId;
  type: Op['type'];
  payload: unknown;
  createdAt: Date;
}

function toOperationEntry(record: OperationRecord): OperationEntry {
  return {
    seq: record.seq,
    userId: record.userId.toString(),
    createdAt: record.createdAt.toISOString(),
    // Stored from a parsed op, so type and payload belong together.
    op: { type: record.type, payload: record.payload } as Op,
  };
}

export function registerTreeRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/tree',
    summary: 'The whole family tree at its current version',
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ClanParamsSchema },
    responses: {
      200: { description: 'People, unions and the version', schema: TreeResponseSchema },
    },
    handler: async ({ params }) => {
      // One snapshot: the version always matches the people and unions sent with it.
      const body = await mongoose.connection.transaction(
        async (session) => {
          const clan = await findClan(params.id, session);
          const tree = await loadTreeState(clan, session);
          return {
            version: clan.version,
            progenitorId: tree.progenitorId,
            persons: Object.values(tree.persons),
            unions: Object.values(tree.unions),
          };
        },
        { readConcern: { level: 'snapshot' } },
      );
      return { status: 200, body };
    },
  });

  api.define({
    method: 'post',
    path: '/clans/:id/ops',
    summary: 'Apply one change (an op) made against baseVersion',
    tags: ['Tree'],
    access: { clanRole: 'editor' },
    request: { params: ClanParamsSchema, body: SubmitOpRequestSchema },
    responses: {
      200: { description: 'Saved; seq is the new version', schema: SubmitOpResponseSchema },
    },
    handler: async ({ params, body, membership, userId }) => {
      const { op, baseVersion } = body;
      if (needsOwner(op) && membership().role !== 'owner') {
        throw new AppError('FORBIDDEN', 'Only the Manager can choose the progenitor');
      }
      const seq = await mongoose.connection.transaction(async (session) => {
        const clan = await findClan(params.id, session);
        if (clan.version !== baseVersion) {
          throw new AppError(
            'VERSION_CONFLICT',
            `The family tree is at version ${clan.version}, not ${baseVersion}`,
          );
        }
        const before = await loadTreeState(clan, session);
        const { tree: after, inverse } = applyOrReject(before, op);
        try {
          await saveTreeChanges(params.id, before, after, session);
        } catch (error) {
          // The filter includes clanId, so a duplicate _id belongs to another family tree.
          if (!isDuplicateKey(error)) throw error;
          throw new AppError(
            'RULE_VIOLATION',
            'This id is already used',
            undefined,
            'DUPLICATE_ID',
          );
        }
        const next = clan.version + 1;
        try {
          await OperationModel.create(
            [
              {
                clanId: clan._id,
                seq: next,
                userId: userId(),
                type: op.type,
                payload: op.payload,
                inverse,
              },
            ],
            { session },
          );
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
          throw new AppError('VERSION_CONFLICT', 'Another change was saved first');
        }
        clan.set({ version: next, progenitorId: after.progenitorId });
        await clan.save({ session });
        return next;
      });
      return { status: 200, body: { seq } };
    },
  });

  api.define({
    method: 'get',
    path: '/clans/:id/ops',
    summary: `Operations after a version, oldest first (at most ${OPS_PAGE_SIZE})`,
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ClanParamsSchema, query: OpsQuerySchema },
    responses: { 200: { description: 'The operations', schema: OperationListSchema } },
    handler: async ({ params, query }) => {
      const records = await OperationModel.find({ clanId: params.id, seq: { $gt: query.since } })
        .sort({ seq: 1 })
        .limit(OPS_PAGE_SIZE)
        .lean<OperationRecord[]>();
      return { status: 200, body: records.map(toOperationEntry) };
    },
  });
}
