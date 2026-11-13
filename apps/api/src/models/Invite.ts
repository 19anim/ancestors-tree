import { model, Schema } from 'mongoose';

const inviteSchema = new Schema(
  {
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true, index: true },
    /** 32 URL-safe characters (spec §5, §12); kept so the owner can copy the link again. */
    token: { type: String, required: true, unique: true },
    role: { type: String, enum: ['editor', 'viewer'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** MongoDB deletes expired invites (TTL index). */
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Invite = model('Invite', inviteSchema);
