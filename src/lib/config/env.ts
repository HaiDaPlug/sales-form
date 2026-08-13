import { z } from "zod";

/**
 * Boot-time environment validation.
 *
 * The custom-field keys are deliberately optional here: they are account-specific
 * and only needed by deal creation. They are checked at the point of use instead
 * (see `assertCustomFieldMappings`), so a missing key fails loudly on the deal
 * that needs it rather than silently dropping the value — and an unset key never
 * blocks unrelated features like login.
 */
/**
 * `.env` files carry unset keys as empty strings (`FOO=`), so an empty value
 * means "not configured" and must be treated as absent — otherwise an unset
 * Pipedrive key would fail validation for unrelated features like login.
 */
const optionalEnv = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  APP_ACCESS_PASSWORD: optionalEnv(z.string().trim().min(1)),
  APP_SESSION_SECRET: optionalEnv(
    z.string().trim().min(16, "APP_SESSION_SECRET must be at least 16 characters")
  ),
  PIPEDRIVE_API_TOKEN: optionalEnv(z.string().trim().min(1)),
  PIPEDRIVE_API_BASE_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url().default("https://api.pipedrive.com/v1")
  ),
  PIPEDRIVE_DEFAULT_PIPELINE_ID: optionalEnv(z.string().trim()),
  PIPEDRIVE_DEFAULT_STAGE_ID: optionalEnv(z.string().trim()),
  PIPEDRIVE_DEFAULT_CURRENCY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().default("SEK")
  ),
  HISTORY_FILE_PATH: optionalEnv(z.string().trim())
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test seam — lets a caller drop the memoized value after mutating process.env. */
export function resetEnvCache() {
  cached = undefined;
}
