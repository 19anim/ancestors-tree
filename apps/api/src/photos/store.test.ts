import { describe, expect, it } from 'vitest';
import { createMemoryPhotoStore } from './store.ts';

describe('createMemoryPhotoStore', () => {
  it('signs the exact upload parameters of spec §12', () => {
    const store = createMemoryPhotoStore();
    const signed = store.signUpload(
      'ancestors-tree/test/clans/c1/people/p1/0123456789abcdef',
      'c1',
    );
    expect(signed.fields).toMatchObject({
      public_id: 'ancestors-tree/test/clans/c1/people/p1/0123456789abcdef',
      asset_folder: 'ancestors-tree/test/clans/c1/people/p1',
      allowed_formats: 'jpg,png,webp',
      tags: 'clan_c1',
      transformation: 'c_limit,w_1600,h_1600',
    });
  });

  it('knows what was put, destroyed and deleted by prefix', async () => {
    const store = createMemoryPhotoStore();
    store.put('f/clans/c1/people/p1/a', { bytes: 10, version: 1 });
    expect(await store.inspect('f/clans/c1/people/p1/a')).toEqual({ bytes: 10, version: 1 });
    await store.destroy('f/clans/c1/people/p1/a');
    expect(await store.inspect('f/clans/c1/people/p1/a')).toBeNull();
    store.put('f/clans/c1/people/p2/b', { bytes: 10, version: 1 });
    await store.deletePrefix('f/clans/c1/');
    expect(store.has('f/clans/c1/people/p2/b')).toBe(false);
    expect(store.deletedPrefixes).toEqual(['f/clans/c1/']);
  });

  it('can answer every id as uploaded (the e2e server)', async () => {
    const store = createMemoryPhotoStore({ assumeUploaded: { bytes: 50_000, version: 1 } });
    expect(await store.inspect('any/id')).toEqual({ bytes: 50_000, version: 1 });
  });
});
