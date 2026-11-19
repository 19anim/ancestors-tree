import type { Op } from '@ancestors-tree/shared/tree';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../http/AppError.ts';
import { personPhotoPrefix } from './paths.ts';
import { createMemoryPhotoStore, PhotoHostError, type PhotoStore } from './store.ts';
import { verifyOpPhotos as verify } from './verify.ts';

const CLAN = '65f000000000000000000001';
const PERSON = '65f000000000000000000002';
const OTHER = '65f000000000000000000003';
const FOLDER = 'ancestors-tree/test';
const ID = `${personPhotoPrefix(FOLDER, CLAN, PERSON)}0123456789abcdef`;

const setPhoto = (personId: string, publicId: string, version = 1): Op => ({
  type: 'updatePerson',
  payload: { id: personId, changes: { photo: { publicId, version } } },
});

function fakeLogger() {
  const error = vi.fn();
  return { logger: { error } as unknown as Logger, error };
}

const silent = fakeLogger().logger;

function verifyOpPhotos(photos: PhotoStore | undefined, clanId: string, op: Op, logger = silent) {
  return verify(photos, clanId, op, logger);
}

/** A memory store whose inspect fails the way the real host can. */
function failingInspect(error: unknown): PhotoStore {
  return { ...createMemoryPhotoStore({ folder: FOLDER }), inspect: () => Promise.reject(error) };
}

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

  it('still refuses an oversized photo when deleting it fails, and logs the failure', async () => {
    const memory = createMemoryPhotoStore({ folder: FOLDER });
    memory.put(ID, { bytes: 2 * 1024 * 1024 + 1, version: 1 });
    const failure = new PhotoHostError('Cloudinary destroy failed', 500);
    const photos: PhotoStore = { ...memory, destroy: () => Promise.reject(failure) };
    const { logger, error } = fakeLogger();
    expect(await rejection(verifyOpPhotos(photos, CLAN, setPhoto(PERSON, ID), logger))).toBe(
      'PHOTO_REJECTED',
    );
    expect(error).toHaveBeenCalledWith({ err: failure, publicId: ID }, expect.any(String));
  });

  it.each([400, 401, 403])(
    'refuses with a logged 422 when the host answers %i (a configuration error)',
    async (status) => {
      const failure = new PhotoHostError('Cloudinary inspect failed', status);
      const { logger, error } = fakeLogger();
      expect(
        await rejection(
          verifyOpPhotos(failingInspect(failure), CLAN, setPhoto(PERSON, ID), logger),
        ),
      ).toBe('PHOTO_REJECTED');
      expect(error).toHaveBeenCalledWith({ err: failure, publicId: ID }, expect.any(String));
    },
  );

  it.each([
    ['a host 5xx', new PhotoHostError('Cloudinary inspect failed', 503)],
    ['a 420 rate limit', new PhotoHostError('Cloudinary inspect failed', 420)],
    ['a 429 rate limit', new PhotoHostError('Cloudinary inspect failed', 429)],
    [
      'a network error',
      new PhotoHostError('Cloudinary inspect failed', undefined, {
        cause: new Error('socket hang up'),
      }),
    ],
  ])('lets %s through as a 5xx the web retries', async (_name, failure) => {
    await expect(verifyOpPhotos(failingInspect(failure), CLAN, setPhoto(PERSON, ID))).rejects.toBe(
      failure,
    );
  });
});
