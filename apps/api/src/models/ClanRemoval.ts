import { model, Schema } from 'mongoose';

/** The owner removed this person from the clan; invite links created before that stop working for them. */
const clanRemovalSchema = new Schema({
  clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  removedAt: { type: Date, required: true },
});

clanRemovalSchema.index({ clanId: 1, userId: 1 }, { unique: true });

export const ClanRemoval = model('ClanRemoval', clanRemovalSchema);
