import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const clanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    hometown: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Bumped by every accepted operation (spec §6.2); equals the last Operation.seq. */
    version: { type: Number, default: 0, min: 0 },
    /** Generation 1 of the tree; chosen by the Owner with the setProgenitor op. */
    progenitorId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
  },
  { timestamps: true },
);

export type ClanDocument = HydratedDocument<InferSchemaType<typeof clanSchema>>;
export const Clan = model('Clan', clanSchema);
