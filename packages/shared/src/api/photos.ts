import { z } from 'zod';

/** A signed upload (spec §12): post `fields` plus `file` as multipart form data to `url`. */
export const PhotoUploadResponseSchema = z.object({
  publicId: z.string(),
  url: z.url(),
  fields: z.record(z.string(), z.string()),
});

export type PhotoUploadResponse = z.infer<typeof PhotoUploadResponseSchema>;
