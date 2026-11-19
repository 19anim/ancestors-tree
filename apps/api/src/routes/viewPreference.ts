import {
  EMPTY_VIEW_PREFERENCE,
  IdSchema,
  ViewPreferenceSchema,
  type ViewPreference,
} from '@ancestors-tree/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { PersonModel } from '../models/Person.ts';
import { ViewPreferenceModel } from '../models/ViewPreference.ts';

const ParamsSchema = z.object({ id: IdSchema });
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown }).code === DUPLICATE_KEY;
}

/** A stored document as the API sends it. None, or an unreadable one, is "no choices". */
function toViewPreference(record: unknown): ViewPreference {
  if (record === null || typeof record !== 'object') return EMPTY_VIEW_PREFERENCE;
  const { enabled, theme, cards } = record as Record<string, unknown>;
  const parsed = ViewPreferenceSchema.safeParse({ enabled, theme, cards });
  return parsed.success ? parsed.data : EMPTY_VIEW_PREFERENCE;
}

/** Only the cards of people still in the clan (spec §5: the others are pruned on save). */
async function keepCardsInClan(
  clanId: string,
  cards: ViewPreference['cards'],
): Promise<ViewPreference['cards']> {
  const ids = Object.keys(cards);
  if (ids.length === 0) return {};
  const found = await PersonModel.find({ clanId, _id: { $in: ids } }, { _id: 1 }).lean<
    { _id: Types.ObjectId }[]
  >();
  const kept = new Set(found.map((record) => record._id.toString()));
  return Object.fromEntries(Object.entries(cards).filter(([id]) => kept.has(id)));
}

export function registerViewPreferenceRoutes(api: RouteRegistry): void {
  api.define({
    method: 'get',
    path: '/clans/:id/view-preference',
    summary: "The caller's own decoration of this family tree (spec §13.4)",
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ParamsSchema },
    responses: {
      200: {
        description: 'Whether it is on, the tree theme and the card choices; empty when none',
        schema: ViewPreferenceSchema,
      },
    },
    handler: async ({ params, userId }) => {
      const record = await ViewPreferenceModel.findOne({
        clanId: params.id,
        userId: userId(),
      }).lean();
      return { status: 200, body: toViewPreference(record) };
    },
  });

  api.define({
    method: 'put',
    path: '/clans/:id/view-preference',
    summary: "Replace the caller's own decoration of this family tree (spec §13.4)",
    tags: ['Tree'],
    access: { clanRole: 'viewer' },
    request: { params: ParamsSchema, body: ViewPreferenceSchema },
    responses: {
      200: {
        description: 'Saved, with cards of people not in the tree left out',
        schema: ViewPreferenceSchema,
      },
    },
    handler: async ({ params, body, userId }) => {
      const cards = await keepCardsInClan(params.id, body.cards);
      const filter = { clanId: params.id, userId: userId() };
      const update = { $set: { enabled: body.enabled, theme: body.theme, cards } };
      const save = () =>
        ViewPreferenceModel.findOneAndUpdate(filter, update, {
          upsert: true,
          returnDocument: 'after',
        }).lean();
      let record;
      try {
        record = await save();
      } catch (error) {
        // Two first saves at once: one inserts, the other's upsert hits the unique index and
        // finds the document on its second try.
        if (!isDuplicateKey(error)) throw error;
        record = await save();
      }
      return { status: 200, body: toViewPreference(record) };
    },
  });
}
