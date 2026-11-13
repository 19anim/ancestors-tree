import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const clanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    hometown: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type ClanDocument = HydratedDocument<InferSchemaType<typeof clanSchema>>;
export const Clan = model('Clan', clanSchema);
