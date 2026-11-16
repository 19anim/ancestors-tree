import { MAX_PHOTO_BYTES, photosInOp, type Op } from '@ancestors-tree/shared/tree';
import { AppError } from '../http/AppError.ts';
import { personPhotoPrefix } from './paths.ts';
import type { PhotoStore } from './store.ts';

function reject(message: string): never {
  throw new AppError('PHOTO_REJECTED', message);
}

/**
 * Spec §12, verified on save: every photo an op sets (undo, redo and revert included) must be
 * this person's, exist at that version and weigh at most 2 MB. Runs before the transaction: it
 * calls the image host. An oversized asset inside the person's folder is deleted; nothing
 * outside it ever is.
 */
export async function verifyOpPhotos(
  photos: PhotoStore | undefined,
  clanId: string,
  op: Op,
): Promise<void> {
  const found = photosInOp(op);
  if (found.length === 0) return;
  // A 422, not PHOTOS_NOT_CONFIGURED (503): the web's send queue retries 5xx answers forever.
  if (photos === undefined) reject('Photos are not set up on this server');
  for (const { personId, photo } of found) {
    if (!photo.publicId.startsWith(personPhotoPrefix(photos.folder, clanId, personId))) {
      reject("This photo is not in this person's folder");
    }
    const asset = await photos.inspect(photo.publicId);
    if (asset === null) reject('This photo does not exist');
    if (asset.bytes > MAX_PHOTO_BYTES) {
      await photos.destroy(photo.publicId);
      reject('This photo is larger than 2 MB');
    }
    if (asset.version !== photo.version) reject('This photo has another version');
  }
}
