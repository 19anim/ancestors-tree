import type { Op } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { AppError } from '../http/AppError.ts';
import { personPhotoPrefix } from './paths.ts';
import { createMemoryPhotoStore } from './store.ts';
import { verifyOpPhotos } from './verify.ts';

const CLAN = '65f000000000000000000001';
const PERSON = '65f000000000000000000002';
const OTHER = '65f000000000000000000003';
const FOLDER = 'ancestors-tree/test';
const ID = `${personPhotoPrefix(FOLDER, CLAN, PERSON)}0123456789abcdef`;

const setPhoto = (personId: string, publicId: string, version = 1): Op => ({
  type: 'updatePerson',
  payload: { id: personId, changes: { photo: { publicId, version } } },
});

async function rejection(promise: Promise<void>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : 'other';
  }
}

describe('verifyOpPhotos', () => {
  it('accepts an op without photos, even when photos are not set up', async () => {
    await expect(
      verifyOpPhotos(undefined, CLAN, { type: 'deletePerson', payload: { id: PERSON } }),
    ).resolves.toBeUndefined();
  });

  it("accepts the person's own uploaded photo at its version", async () => {
    const photos = createMemoryPhotoStore({ folder: FOLDER });
    photos.put(ID, { bytes: 1000, version: 1 });
    await expect(verifyOpPhotos(photos, CLAN, setPhoto(PERSON, ID))).resolves.toBeUndefined();
  });

  it("refuses another person's photo, a missing one and another version", async () => {
    const photos = createMemoryPhotoStore({ folder: FOLDER });
    photos.put(ID, { bytes: 1000, version: 1 });
    expect(await rejection(verifyOpPhotos(photos, CLAN, setPhoto(OTHER, ID)))).toBe(
      'PHOTO_REJECTED',
    );
    expect(
      await rejection(verifyOpPhotos(photos, CLAN, setPhoto(PERSON, `${ID.slice(0, -1)}0`))),
    ).toBe('PHOTO_REJECTED');
    expect(await rejection(verifyOpPhotos(photos, CLAN, setPhoto(PERSON, ID, 2)))).toBe(
      'PHOTO_REJECTED',
    );
    expect(photos.has(ID)).toBe(true);
  });

  it('refuses and deletes an oversized photo inside the prefix', async () => {
    const photos = createMemoryPhotoStore({ folder: FOLDER });
    photos.put(ID, { bytes: 2 * 1024 * 1024 + 1, version: 1 });
    expect(await rejection(verifyOpPhotos(photos, CLAN, setPhoto(PERSON, ID)))).toBe(
      'PHOTO_REJECTED',
    );
    expect(photos.has(ID)).toBe(false);
  });

  it('refuses any photo when photos are not set up (a 422, never a retried 5xx)', async () => {
    expect(await rejection(verifyOpPhotos(undefined, CLAN, setPhoto(PERSON, ID)))).toBe(
      'PHOTO_REJECTED',
    );
  });
});
