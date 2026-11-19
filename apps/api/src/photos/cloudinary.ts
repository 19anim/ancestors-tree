import { v2 as cloudinary } from 'cloudinary';
import { PhotoHostError, uploadParameters, type PhotoAsset, type PhotoStore } from './store.ts';

const URL_PATTERN = /^cloudinary:\/\/([^:@/]+):([^@/]+)@([\w-]+)$/;
/** delete_resources_by_prefix removes at most 1000 per call; a clan is far smaller. */
const MAX_DELETE_ROUNDS = 50;

export function parseCloudinaryUrl(url: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const match = URL_PATTERN.exec(url);
  if (!match?.[1] || !match[2] || !match[3]) {
    // Never echo the value: it holds the API secret.
    throw new Error(
      'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
    );
  }
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

interface SdkErrorBody {
  message?: unknown;
  http_code?: unknown;
}

/**
 * The SDK (2.11) rejects with plain objects, not Errors: the Admin API with
 * `{ request_options, query_params, error: { message, http_code } }` for the codes it expects and
 * `{ message, http_code, request_options, query_params }` for any other; the uploader with
 * `{ message, http_code }`; a request that gets no answer with the socket's Error. This keeps the
 * code and message only: request_options holds the API key and secret.
 */
function hostError(call: string, error: unknown): PhotoHostError {
  if (error instanceof Error) {
    return new PhotoHostError(`Cloudinary ${call} failed`, undefined, { cause: error });
  }
  const outer = (error ?? {}) as SdkErrorBody & { error?: SdkErrorBody };
  const body = outer.error ?? outer;
  const status = typeof body.http_code === 'number' ? body.http_code : undefined;
  const reason = body.message instanceof Error ? body.message.message : body.message;
  const message = typeof reason === 'string' ? reason : 'No message';
  return new PhotoHostError(
    `Cloudinary ${call} failed${status === undefined ? '' : ` (HTTP ${status})`}`,
    status,
    { cause: { message, http_code: status } },
  );
}

/** The real image host (spec §12). Upload signing is local; inspect and delete use the Admin API. */
export function createCloudinaryPhotoStore(options: { url: string; folder: string }): PhotoStore {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryUrl(options.url);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return {
    folder: options.folder,
    signUpload(publicId, clanId) {
      const params = {
        ...uploadParameters(publicId, clanId),
        timestamp: String(Math.floor(Date.now() / 1000)),
      };
      const signature = cloudinary.utils.api_sign_request(params, apiSecret);
      return {
        url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        fields: { ...params, api_key: apiKey, signature },
      };
    },
    async inspect(publicId): Promise<PhotoAsset | null> {
      try {
        const resource = (await cloudinary.api.resource(publicId, {
          resource_type: 'image',
          type: 'upload',
        })) as { bytes: number; version: number };
        return { bytes: resource.bytes, version: resource.version };
      } catch (error) {
        const failure = hostError('inspect', error);
        if (failure.status === 404) return null;
        throw failure;
      }
    },
    async destroy(publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      } catch (error) {
        throw hostError('destroy', error);
      }
    },
    async deletePrefix(prefix) {
      try {
        for (let round = 0; round < MAX_DELETE_ROUNDS; round += 1) {
          const result = (await cloudinary.api.delete_resources_by_prefix(prefix, {
            resource_type: 'image',
            type: 'upload',
          })) as { partial?: boolean };
          if (!result.partial) return;
        }
      } catch (error) {
        throw hostError('deletePrefix', error);
      }
    },
  };
}
