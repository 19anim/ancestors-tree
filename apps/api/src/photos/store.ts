/** A signed upload: the browser posts `fields` and the file to `url` (spec §12). */
export interface SignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface PhotoAsset {
  bytes: number;
  version: number;
}

/** Everything the API asks of the image host. The real one is Cloudinary (cloudinary.ts). */
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
