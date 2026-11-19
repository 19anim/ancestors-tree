import { z } from 'zod';
import { MAX_PERSONS } from '../tree/schemas.ts';
import { CardStyleSchema, TreeThemeSchema } from '../tree/theme.ts';
import { IdSchema } from './common.ts';

/** GET/PUT /api/clans/:id/view-preference: my own decoration of one clan (spec §5, §13.4). */
export const ViewPreferenceSchema = z.strictObject({
  /** false = "Back to the shared theme", keeping the choices. */
  enabled: z.boolean(),
  theme: TreeThemeSchema,
  cards: z
    .record(IdSchema, CardStyleSchema)
    .refine((cards) => Object.keys(cards).length <= MAX_PERSONS, {
      message: `At most ${MAX_PERSONS} cards`,
    }),
});

export type ViewPreference = z.infer<typeof ViewPreferenceSchema>;

/** What a member who never decorated has. */
export const EMPTY_VIEW_PREFERENCE: ViewPreference = { enabled: false, theme: {}, cards: {} };
