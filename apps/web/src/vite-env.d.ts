/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The public Cloudinary cloud name (spec §12); photos are off without it. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  /** The React project's Sentry DSN (spec §13.1); production builds only, off without it. */
  readonly VITE_SENTRY_DSN?: string;
}

/** The commit this build came from (Netlify's COMMIT_REF), or "local"; set in vite.config.ts. */
declare const __SENTRY_RELEASE__: string;
/** Netlify's deploy context (production, deploy-preview…), or "local"; set in vite.config.ts. */
declare const __SENTRY_ENVIRONMENT__: string;
