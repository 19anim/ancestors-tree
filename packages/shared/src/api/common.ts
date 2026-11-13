import { z } from 'zod';

/** A MongoDB ObjectId as 24 lowercase hex characters. */
export const IdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Must be a 24-character hex id');
