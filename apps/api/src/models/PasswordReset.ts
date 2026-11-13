import { model, Schema } from 'mongoose';

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    /** When the link stops working (1 h). Documents outlive it, see the createdAt index. */
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * Documents live 24 h, longer than the links, because the forgot-password cap counts them.
 * (An old expiresAt TTL index in a dev database must be dropped by hand.)
 */
passwordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const PasswordReset = model('PasswordReset', passwordResetSchema);
