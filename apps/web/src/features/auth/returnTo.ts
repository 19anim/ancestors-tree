import { ReturnToSchema } from '@ancestors-tree/shared';

/** Where to go after signing in: only paths inside the app. */
export function safeReturnTo(value: string | null, fallback = '/clans'): string {
  const parsed = ReturnToSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
