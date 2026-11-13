import { model, Schema } from 'mongoose';

/**
 * The operation log (spec §5, §6.2): one entry per accepted change, numbered by the clan's
 * version. The unique (clanId, seq) index is the last guard against two writers taking one seq.
 */
const operationSchema = new Schema(
  {
    clanId: { type: Schema.Types.ObjectId, ref: 'Clan', required: true },
    seq: { type: Number, required: true, min: 1 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    /** The op that undoes this one, as returned by applyOp (undo and history in P6). */
    inverse: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

operationSchema.index({ clanId: 1, seq: 1 }, { unique: true });

export const OperationModel = model('Operation', operationSchema);
