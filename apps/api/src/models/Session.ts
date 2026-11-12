import { model, Schema } from 'mongoose';

/** One refresh token. Rotation creates a new Session in the same family (spec §12). */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Every token issued from one sign-in shares a family; reusing an old one revokes it. */
    familyId: { type: String, required: true, index: true },
    /** SHA-256 of the token: a database leak does not leak live tokens. */
    tokenHash: { type: String, required: true, unique: true },
    /** MongoDB deletes the document after this date (TTL index). */
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Session = model('Session', sessionSchema);
