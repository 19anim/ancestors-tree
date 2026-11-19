import { MAX_PHOTO_BYTES, photosInOp, type Op } from '@ancestors-tree/shared/tree';
import type { Logger } from 'pino';
import { AppError } from '../http/AppError.ts';
import { personPhotoPrefix } from './paths.ts';
import { isLastingPhotoHostFailure, type PhotoAsset, type PhotoStore } from './store.ts';

function reject(message: string): never {
  throw new AppError('PHOTO_REJECTED', message);
}

/**
 * The asset, or null. A lasting refusal from the host (wrong keys) answers a logged 422, like a
 * server without photos; anything that may pass (a host 5xx, a rate limit, a network error) is
 * rethrown as a 5xx, so the web retries it.
 */
async function inspect(
  photos: PhotoStore,
  publicId: string,
  logger: Logger,
): Promise<PhotoAsset | null> {
  try {
    return await photos.inspect(publicId);
  } catch (error) {
    if (!isLastingPhotoHostFailure(error)) throw error;
    logger.error({ err: error, publicId }, 'The image host refused the photo check');
    return reject('The image host refused this server; photos are not set up correctly');
  }
}

/**
 * Spec §12, verified on save: every photo an op sets (undo, redo and revert included) must be
 * this person's, exist at that version and weigh at most 2 MB. Runs before the transaction: it
 * calls the image host. An oversized asset inside the person's folder is deleted; nothing
 * outside it ever is.
 *
 * Every lasting failure answers PHOTO_REJECTED (422), never a 5xx: the web's send queue retries
 * 5xx forever, and every later edit in that tab waits behind the op.
 */
export async function verifyOpPhotos(
  photos: PhotoStore | undefined,
  clanId: string,
  op: Op,
  logger: Logger,
): Promise<void> {
  const found = photosInOp(op);
  if (found.length === 0) return;
  // A 422, not PHOTOS_NOT_CONFIGURED (503): the web's send queue retries 5xx answers forever.
  if (photos === undefined) reject('Photos are not set up on this server');
  for (const { personId, photo } of found) {
    if (!photo.publicId.startsWith(personPhotoPrefix(photos.folder, clanId, personId))) {
      reject("This photo is not in this person's folder");
    }
    const asset = await inspect(photos, photo.publicId, logger);
    if (asset === null) reject('This photo does not exist');
    if (asset.bytes > MAX_PHOTO_BYTES) {
      // The op is refused either way; a failed delete only leaves the asset behind.
      await photos.destroy(photo.publicId).catch((error: unknown) => {
        logger.error(
          { err: error, publicId: photo.publicId },
          'Could not delete an oversized photo',
        );
      });
      reject('This photo is larger than 2 MB');
    }
    if (asset.version !== photo.version) reject('This photo has another version');
  }
}
