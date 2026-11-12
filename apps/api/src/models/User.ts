import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    locale: { type: String, enum: ['vi', 'en'], default: 'vi', required: true },
    /** bcrypt hash; absent for Google-only accounts. Never sent to clients (see CurrentUser). */
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    /** Set once the user proves they own the email: Google sign-in or a password reset link. */
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
