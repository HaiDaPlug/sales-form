import { z } from "zod";

/**
 * Boot-time environment validation.
 *
 * The Pipedrive custom-field keys are deliberately absent here: they are
 * account-specific and only needed by prospect creation, so they are checked at
 * the point of use instead (see `assertCustomFieldMappings`). A missing key then
 * fails loudly on the prospect that needs it rather than silently dropping the
 * value — and never blocks unrelated features like login.
 *
 * `.env` files carry unset keys as empty strings (`FOO=`), so an empty value
 * means "not configured" and must be treated as absent.
 */
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const optionalEnv = (schema: z.ZodType<string>) => z.preprocess(blankToUndefined, schema.optional());

const defaultedText = (schema: z.ZodType<string>, fallback: string) =>
  z.preprocess(blankToUndefined, schema.default(fallback));

/** A positive whole number with a default, e.g. `MEETING_SLOT_STEP_MINUTES=30`. */
const defaultedMinutes = (fallback: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(fallback));

/** `HH:MM` on a 24-hour clock, for the meeting working-hours window. */
const clockTime = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM");

const envSchema = z.object({
  APP_SESSION_SECRET: optionalEnv(
    z.string().trim().min(16, "APP_SESSION_SECRET must be at least 16 characters")
  ),
  /**
   * The seller accounts, as a JSON array. Each entry binds a login to the
   * "Affärens säljare" option the seller is in Pipedrive — see `auth/users.ts`.
   */
  APP_USERS: optionalEnv(z.string().trim().min(1)),

  /** Neon Postgres. Unset means the file-backed stores are used (local dev only). */
  DATABASE_URL: optionalEnv(z.string().trim().min(1)),
  /** Vercel Blob, the staging area for audio uploads. Read by `@vercel/blob` itself. */
  BLOB_READ_WRITE_TOKEN: optionalEnv(z.string().trim().min(1)),

  PIPEDRIVE_API_TOKEN: optionalEnv(z.string().trim().min(1)),
  PIPEDRIVE_API_BASE_URL: defaultedText(z.string().trim().url(), "https://api.pipedrive.com/v1"),
  /** Lead search and the converted-deal lookup only exist on the v2 API. */
  PIPEDRIVE_API_V2_BASE_URL: defaultedText(z.string().trim().url(), "https://api.pipedrive.com/api/v2"),
  PIPEDRIVE_DEFAULT_CURRENCY: defaultedText(z.string().trim(), "SEK"),
  PIPEDRIVE_SCHEDULER_URL: optionalEnv(z.string().trim().url()),
  PIPEDRIVE_DEFAULT_PIPELINE_ID: optionalEnv(z.string().trim()),
  PIPEDRIVE_DEFAULT_STAGE_ID: optionalEnv(z.string().trim()),
  /** The Pipedrive user new prospects are owned by — the back-office/QC inbox. */
  PIPEDRIVE_LEAD_OWNER_USER_ID: optionalEnv(z.string().trim()),
  /**
   * Comma-separated Pipedrive user ids of the technicians who take meetings.
   * Free slots are computed against their calendars, and a booking is assigned
   * to one of them. Unset means every user's activities block a slot and the
   * activity is owned by the API token's user.
   */
  PIPEDRIVE_TECHNICIAN_USER_IDS: optionalEnv(z.string().trim()),

  MEETING_WORKING_HOURS_START: defaultedText(clockTime, "08:00"),
  MEETING_WORKING_HOURS_END: defaultedText(clockTime, "17:00"),
  MEETING_SLOT_STEP_MINUTES: defaultedMinutes(30),
  MEETING_DURATION_MINUTES: defaultedMinutes(60),
  /** Earliest bookable slot, counted from now. */
  MEETING_MIN_LEAD_MINUTES: defaultedMinutes(60),

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
