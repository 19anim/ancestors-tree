import {
  HistoryPageSchema,
  HistoryQuerySchema,
  IdSchema,
  type HistoryEntry,
} from '@ancestors-tree/shared';
import type { Op } from '@ancestors-tree/shared/tree';
import type { Types } from 'mongoose';
import { z } from 'zod';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { OperationModel } from '../models/Operation.ts';
import { namesOf } from '../users/names.ts';

const ClanParamsSchema = z.object({ id: IdSchema });

interface HistoryRecord {
  seq: number;
  userId: Types.ObjectId;
  type: Op['type'];
  payload: unknown;
  inverse: unknown;
  createdAt: Date;
  revertsSeq?: number;
  revertsToSeq?: number;
}

function toHistoryEntry(record: HistoryRecord, names: Map<string, string>): HistoryEntry {
  const userId = record.userId.toString();
  return {
    seq: record.seq,
    userId,
    authorName: names.get(userId) ?? '',
    createdAt: record.createdAt.toISOString(),
    // Stored from a parsed op and applyOp's inverse, so both are valid ops.
    op: { type: record.type, payload: record.payload } as Op,
    inverse: record.inverse as Op,
    ...(record.revertsSeq === undefined ? {} : { revertsSeq: record.revertsSeq }),
    ...(record.revertsToSeq === undefined ? {} : { revertsToSeq: record.revertsToSeq }),
  };
}

export function registerHistoryRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/history',
    summary: 'Saved changes, newest first, with their authors and inverses',
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ClanParamsSchema, query: HistoryQuerySchema },
    responses: { 200: { description: 'One page of the history', schema: HistoryPageSchema } },
    handler: async ({ params, query }) => {
      const records = await OperationModel.find({
        clanId: params.id,
        ...(query.before === undefined ? {} : { seq: { $lt: query.before } }),
      })
        .sort({ seq: -1 })
        // One more than asked: it tells whether an older page exists.
        .limit(query.limit + 1)
        .lean<HistoryRecord[]>();
      const page = records.slice(0, query.limit);
      const names = await namesOf(page.map((record) => record.userId.toString()));
      const oldest = page.at(-1);
      return {
        status: 200,
        body: {
          entries: page.map((record) => toHistoryEntry(record, names)),
          nextBefore: records.length > query.limit && oldest ? oldest.seq : null,
        },
      };
    },
  });
}
