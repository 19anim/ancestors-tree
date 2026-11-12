import { z } from 'zod';

/** An optional secret-bearing setting: empty means "not set", and errors never echo the value. */
function optionalSetting(pattern: RegExp, message: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || pattern.test(value), { message });
}

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_VERSION: z.string().min(1).default('0.0.0-dev'),
    // The web app's origin: links in emails, the Google redirect URI and the origin check.
    APP_ORIGIN: z
      .string()
      .refine(isOrigin, {
        message:
          'APP_ORIGIN must be an origin such as https://ancestorstree.netlify.app (no path, no trailing slash)',
      })
      .default('http://localhost:5173'),
    // Proxies in front of the API: 0 locally, 2 on Render behind the Netlify proxy.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Interactive docs at /api/docs; on by default outside production.
    API_DOCS: z.enum(['on', 'off']).optional(),
    MONGODB_URI: optionalSetting(
      /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/,
      'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string that names a database (…mongodb.net/ancestors-tree-dev?…)',
    ),
    JWT_SECRET: optionalSetting(
      /^\S{32,}$/,
      'JWT_SECRET must be at least 32 characters without spaces (generate one with: openssl rand -base64 48)',
    ),
    GOOGLE_CLIENT_ID: optionalSetting(
      /^[\w.-]+\.apps\.googleusercontent\.com$/,
      'GOOGLE_CLIENT_ID must end with .apps.googleusercontent.com (Google Cloud → APIs & Services → Credentials)',
    ),
    GOOGLE_CLIENT_SECRET: optionalSetting(
      /^\S{6,}$/,
      'GOOGLE_CLIENT_SECRET must be the client secret of the same OAuth client',
    ),
    RESEND_API_KEY: optionalSetting(
      /^re_\w+$/,
      'RESEND_API_KEY must start with re_ (Resend → API Keys)',
    ),
    MAIL_FROM: z.string().trim().min(3).default('AncestorsTree <onboarding@resend.dev>'),
    // Used from P6 (photo upload) on; optional until then.
    CLOUDINARY_URL: optionalSetting(
      /^cloudinary:\/\/[^:@/]+:[^@/]+@[\w-]+$/,
      'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name> (copy "API environment variable" from the Cloudinary dashboard)',
    ),
    CLOUDINARY_FOLDER: z
      .string()
      .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, {
        message:
          'CLOUDINARY_FOLDER must be lowercase path segments without leading or trailing slashes (ancestors-tree/dev)',
      })
      .default('ancestors-tree/dev'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'test') {
      for (const key of ['MONGODB_URI', 'JWT_SECRET'] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required (see apps/api/.env.example)`,
          });
        }
      }
    }
    if ((env.GOOGLE_CLIENT_ID === undefined) !== (env.GOOGLE_CLIENT_SECRET === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither',
      });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** For settings the schema guarantees outside tests (MONGODB_URI, JWT_SECRET). */
export function requireSetting<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
}

export function apiDocsEnabled(config: Config): boolean {
  return config.API_DOCS ? config.API_DOCS === 'on' : config.NODE_ENV !== 'production';
}
