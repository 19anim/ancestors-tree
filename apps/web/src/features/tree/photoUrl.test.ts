import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoUrl, photosEnabled } from './photoUrl';

const PHOTO = { publicId: 'ancestors-tree/dev/clans/c/people/p/0123456789abcdef', version: 7 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('photoUrl', () => {
  it('builds the card and profile URLs of spec §12', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
    expect(photoUrl(PHOTO, 'card')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_face,w_172,h_148,f_auto,q_auto/v7/ancestors-tree/dev/clans/c/people/p/0123456789abcdef',
    );
    expect(photoUrl(PHOTO, 'profile')).toContain('/c_fill,g_face,w_480,h_480,f_auto,q_auto/v7/');
    expect(photosEnabled()).toBe(true);
  });

  it('gives nothing without a photo or without a cloud name', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
    expect(photoUrl(undefined, 'card')).toBeUndefined();
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '');
    expect(photoUrl(PHOTO, 'card')).toBeUndefined();
    expect(photosEnabled()).toBe(false);
  });
});
