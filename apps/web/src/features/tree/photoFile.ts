/** Spec §12: jpg, png or webp; shrunk in the browser to 1600 px before the 2 MB check. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Larger files are refused before decoding: a phone photo is 3–6 MB. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 1600;
const QUALITY = 0.85;

export type PhotoProblem = 'type' | 'sourceTooLarge' | 'unreadable' | 'tooLarge';

export class PhotoFileError extends Error {
  readonly problem: PhotoProblem;

  constructor(problem: PhotoProblem) {
    super(`Photo file problem: ${problem}`);
    this.name = 'PhotoFileError';
    this.problem = problem;
  }
}

export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function checkSource(file: File): PhotoProblem | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > MAX_SOURCE_BYTES) return 'sourceTooLarge';
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
}

/**
 * At most 1600 px on the long side, upright (EXIF orientation applied), re-encoded as WebP, or
 * JPEG where the browser cannot encode WebP. A white background keeps transparent PNGs light in
 * JPEG.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoFileError('unreadable');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_PHOTO_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    throw new PhotoFileError('unreadable');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg');
  if (jpeg === null) throw new PhotoFileError('unreadable');
  return jpeg;
}
