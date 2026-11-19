import type { PersonPhoto } from '@ancestors-tree/shared/tree';

/** Named transformations (spec §12): twice the 86×74 card photo, and the profile's square. */
const VARIANTS = {
  card: 'c_fill,g_face,w_172,h_148,f_auto,q_auto',
  profile: 'c_fill,g_face,w_480,h_480,f_auto,q_auto',
} as const;

/** Read on every call, so tests can stub it. */
export function cloudName(): string | undefined {
  const name = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  return name ? name : undefined;
}

export function photosEnabled(): boolean {
  return cloudName() !== undefined;
}

export function photoUrl(
  photo: PersonPhoto | undefined,
  variant: keyof typeof VARIANTS,
): string | undefined {
  const cloud = cloudName();
  if (photo === undefined || cloud === undefined) return undefined;
  const path = photo.publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/${VARIANTS[variant]}/v${photo.version}/${path}`;
}
