import { model, Schema } from 'mongoose';

/**
 * "Only for me" (spec §5, §13.4): one member's own decoration of one clan. Not an op: it never
 * appears in the clan's history, and share links and exports never read it.
 */
const viewPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true, index: true },
    enabled: { type: Boolean, required: true },
    theme: { type: Schema.Types.Mixed, default: () => ({}) },
    cards: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  // minimize: false keeps an empty theme or cards object instead of dropping the field.
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false },
);

viewPreferenceSchema.index({ userId: 1, clanId: 1 }, { unique: true });

export const ViewPreferenceModel = model('ViewPreference', viewPreferenceSchema);
