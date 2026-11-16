import { PhotoUploadResponseSchema, type PhotoUploadResponse } from '@ancestors-tree/shared';
import type { PersonPhoto } from '@ancestors-tree/shared/tree';
import { z } from 'zod';
import { apiRequest } from '../../shared/lib/apiClient';

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoUploadError';
  }
}

const UploadedSchema = z.object({ public_id: z.string(), version: z.number().int().positive() });

export function requestPhotoUpload(clanId: string, personId: string): Promise<PhotoUploadResponse> {
  return apiRequest(`/clans/${clanId}/people/${personId}/photo-upload`, PhotoUploadResponseSchema, {
    method: 'POST',
  });
}

/** Straight to Cloudinary (spec §12). XHR, not fetch: fetch cannot report upload progress. */
export function uploadPhoto(
  target: PhotoUploadResponse,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PersonPhoto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
    form.append('file', file);
    const abort = () => {
      xhr.abort();
      reject(new DOMException('The upload was cancelled', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new PhotoUploadError('The upload did not reach the image host'));
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', abort);
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      const parsed = UploadedSchema.safeParse(body);
      if (xhr.status < 200 || xhr.status >= 300 || !parsed.success) {
        reject(new PhotoUploadError(`The image host answered ${xhr.status}`));
        return;
      }
      resolve({ publicId: parsed.data.public_id, version: parsed.data.version });
    };
    xhr.open('POST', target.url);
    xhr.send(form);
  });
}
