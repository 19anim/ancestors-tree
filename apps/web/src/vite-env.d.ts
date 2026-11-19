/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The public Cloudinary cloud name (spec §12); photos are off without it. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
}
