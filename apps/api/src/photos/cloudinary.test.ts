import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCloudinaryPhotoStore, parseCloudinaryUrl } from './cloudinary.ts';

const KEY = 'key123';
const SECRET = 'secret456';
const CLOUD = 'demo-cloud';
const URL_FROM_PARTS = `cloudinary://${KEY}:${SECRET}@${CLOUD}`;

describe('parseCloudinaryUrl', () => {
  it('reads the key, secret and cloud name', () => {
    expect(parseCloudinaryUrl(URL_FROM_PARTS)).toEqual({
      cloudName: CLOUD,
      apiKey: KEY,
      apiSecret: SECRET,
    });
  });

  it('refuses anything else without echoing it', () => {
    expect(() => parseCloudinaryUrl(`https://${SECRET}@x`)).toThrow(/CLOUDINARY_URL/);
    expect(() => parseCloudinaryUrl(`https://${SECRET}@x`)).not.toThrow(new RegExp(SECRET));
  });
});

describe('createCloudinaryPhotoStore().signUpload', () => {
  it('signs every upload parameter with the API secret', () => {
    const store = createCloudinaryPhotoStore({
      url: URL_FROM_PARTS,
      folder: 'ancestors-tree/test',
    });
    const publicId = 'ancestors-tree/test/clans/c1/people/p1/0123456789abcdef';
    const { url, fields } = store.signUpload(publicId, 'c1');
    expect(url).toBe(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`);
    expect(fields.api_key).toBe(KEY);
    const { signature, api_key: _key, ...signed } = fields;
    const toSign = Object.keys(signed)
      .sort()
      .map((name) => `${name}=${signed[name]}`)
      .join('&');
    expect(signature).toBe(
      createHash('sha1')
        .update(toSign + SECRET)
        .digest('hex'),
    );
    expect(signed).toMatchObject({
      public_id: publicId,
      asset_folder: 'ancestors-tree/test/clans/c1/people/p1',
      allowed_formats: 'jpg,png,webp',
      tags: 'clan_c1',
      transformation: 'c_limit,w_1600,h_1600',
    });
    expect(Number(signed.timestamp)).toBeGreaterThan(1_700_000_000);
  });
});
