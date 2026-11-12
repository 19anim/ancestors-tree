import { model, Schema } from 'mongoose';

const membershipSchema = new Schema(
  {
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

membershipSchema.index({ clanId: 1, userId: 1 }, { unique: true });

export const Membership = model('Membership', membershipSchema);
