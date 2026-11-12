import { z } from 'zod';

export const DatabaseStateSchema = z.enum(['connected', 'connecting', 'disconnected']);

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  database: DatabaseStateSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
