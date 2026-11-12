import { z } from 'zod';

/** An optional secret-bearing setting: empty means "not set", and errors never echo the value. */
function optionalSetting(pattern: RegExp, message: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || pattern.test(value), { message });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().min(1).default('0.0.0-dev'),
  // Used from P3 (accounts and clans) on; optional until then.
  MONGODB_URI: optionalSetting(
    /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/,
    'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string that names a database (…mongodb.net/ancestors-tree-dev?…)',
  ),
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
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
