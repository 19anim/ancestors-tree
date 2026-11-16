import { v2 as cloudinary } from 'cloudinary';
import { uploadParameters, type PhotoAsset, type PhotoStore } from './store.ts';

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

function httpCode(error: unknown): number | undefined {
  return (error as { error?: { http_code?: number } } | null)?.error?.http_code;
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
        if (httpCode(error) === 404) return null;
        throw error;
      }
    },
    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    },
    async deletePrefix(prefix) {
      for (let round = 0; round < MAX_DELETE_ROUNDS; round += 1) {
        const result = (await cloudinary.api.delete_resources_by_prefix(prefix, {
          resource_type: 'image',
          type: 'upload',
        })) as { partial?: boolean };
        if (!result.partial) return;
      }
    },
  };
}
