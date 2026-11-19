/** A signed upload: the browser posts `fields` and the file to `url` (spec §12). */
export interface SignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface PhotoAsset {
  bytes: number;
  version: number;
}

/**
 * A failed call to the image host. `status` is the host's HTTP status, or undefined when no
 * answer came (a network error). `cause` holds only the host's message and code: the SDK's own
 * rejection can carry the request options, API secret included.
 */
export class PhotoHostError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status: number | undefined, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PhotoHostError';
    this.status = status;
  }
}

/** Answers a retry cannot change; rate limits (420, 429) and timeouts (408) pass on their own. */
const PASSING_CLIENT_STATUSES = new Set([408, 420, 429]);

/**
 * True when the host refused for a reason that lasts until an operator acts: a 4xx such as a bad
 * request (400) or a wrong or revoked CLOUDINARY_URL (401, 403). Those must answer the editor
 * with a 4xx, because the web's send queue retries 5xx forever and holds every later edit behind
 * them. A host 5xx, a rate limit or a network error is false: it passes, so a retry is right.
 */
export function isLastingPhotoHostFailure(error: unknown): boolean {
  if (!(error instanceof PhotoHostError) || error.status === undefined) return false;
  return error.status >= 400 && error.status < 500 && !PASSING_CLIENT_STATUSES.has(error.status);
}

/**
 * Everything the API asks of the image host. The real one is Cloudinary (cloudinary.ts). A call
 * that fails rejects with a PhotoHostError.
 */
export interface PhotoStore {
  /** CLOUDINARY_FOLDER, e.g. ancestors-tree/dev. */
  readonly folder: string;
  signUpload(publicId: string, clanId: string): SignedUpload;
  /** Null when the asset does not exist. */
  inspect(publicId: string): Promise<PhotoAsset | null>;
  destroy(publicId: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

/** The parameters every upload is signed with (spec §12), besides api_key and signature. */
export function uploadParameters(publicId: string, clanId: string): Record<string, string> {
  return {
    public_id: publicId,
    asset_folder: publicId.slice(0, publicId.lastIndexOf('/')),
    allowed_formats: 'jpg,png,webp',
    tags: `clan_${clanId}`,
    transformation: 'c_limit,w_1600,h_1600',
  };
}

export interface MemoryPhotoStore extends PhotoStore {
  put(publicId: string, asset: PhotoAsset): void;
  has(publicId: string): boolean;
  readonly deletedPrefixes: string[];
}

/**
 * For tests and the e2e server: assets live in a Map. `assumeUploaded` answers every unknown id
 * as that asset, because the e2e browser's upload never reaches this process.
 */
export function createMemoryPhotoStore(
  options: { folder?: string; assumeUploaded?: PhotoAsset } = {},
): MemoryPhotoStore {
  const assets = new Map<string, PhotoAsset>();
  const deletedPrefixes: string[] = [];
  return {
    folder: options.folder ?? 'ancestors-tree/test',
    deletedPrefixes,
    signUpload(publicId, clanId) {
      return {
        url: 'https://api.cloudinary.com/v1_1/memory/image/upload',
        fields: {
          ...uploadParameters(publicId, clanId),
          timestamp: '0',
          api_key: 'memory',
          signature: 'memory',
        },
      };
    },
    inspect(publicId) {
      return Promise.resolve(assets.get(publicId) ?? options.assumeUploaded ?? null);
    },
    destroy(publicId) {
      assets.delete(publicId);
      return Promise.resolve();
    },
    deletePrefix(prefix) {
      deletedPrefixes.push(prefix);
      for (const id of [...assets.keys()]) if (id.startsWith(prefix)) assets.delete(id);
      return Promise.resolve();
    },
    put(publicId, asset) {
      assets.set(publicId, asset);
    },
    has(publicId) {
      return assets.has(publicId);
    },
  };
}
