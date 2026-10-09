import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  GEMINI_API_KEY: z.string().default('mock-gemini-key'),

  MAX_GEMINI_CALLS_PER_RUN:
    z.coerce.number().default(15),

  MAX_GEMINI_CALLS_PER_DAY:
    z.coerce.number().default(1500),

  ENABLE_AI_FALLBACK: z
    .string()
    .transform(
      (val: string) =>
        val === 'true' || val === '1'
    )
    .default('true'),

  SUPABASE_URL: z
    .string()
    .url()
    .default(
      'https://mock-supabase.supabase.co'
    ),

  SUPABASE_ANON_KEY:
    z.string().default('mock-anon-key'),

  SUPABASE_SERVICE_ROLE_KEY:
    z.string().default(
      'mock-service-role-key'
    ),

  SUPABASE_PUBLISHABLE_KEY:
    z.string().optional(),

  SUPABASE_SECRET_KEY:
    z.string().optional(),

  SUPABASE_JWKS_URL:
    z.string().url().optional(),

  DATABASE_URL:
    z.string().optional(),

  TRIGGER_SECRET_KEY:
    z.string().default('tr_dev_mock_key'),

  TELEGRAM_BOT_TOKEN:
    z.string().default('mock-bot-token'),

  TELEGRAM_CHAT_ID:
    z.string().default('123456789'),

  USER_RESUME_PATH:
    z.string().default('./data/resume.pdf'),

  /*
   * PFE Scout is international by default.
   *
   * CountryFilterStage handles exclusion of
   * Tunisia-specific opportunities.
   */
  ALLOW_INTERNATIONAL: z
    .string()
    .transform(
      (val: string) =>
        val === 'true' || val === '1'
    )
    .default('true'),

  /*
   * Kept for backward compatibility with
   * existing preferences/configuration.
   *
   * This is no longer used as an India-only
   * filtering rule.
   */
  TARGET_COUNTRY:
    z.string().default('International'),

  MAX_CONCURRENT_PLUGINS:
    z.coerce.number().default(3),

  MAX_CONCURRENT_AI:
    z.coerce.number().default(2),

  RATE_LIMIT_DELAY:
    z.coerce.number().default(2000),

  LOG_LEVEL: z
    .enum([
      'DEBUG',
      'INFO',
      'WARN',
      'ERROR',
    ])
    .default('INFO'),

  SMTP_USER: z
    .string()
    .email()
    .default('seifeddinenefzi000@gmail.com'),

  SMTP_PASS: z
    .string()
    .default('byidxhbjuhcohddx'),

  SMTP_SENDER_NAME: z
    .string()
    .default('Seif Eddine Nefzi'),

  NODE_ENV: z
    .enum([
      'development',
      'production',
      'test',
    ])
    .default('development'),
});

export type EnvConfig =
  z.infer<typeof envSchema>;

function parseEnv(): EnvConfig {
  const result =
    envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      '❌ Environment Variable Validation Error:'
    );

    console.error(
      JSON.stringify(
        result.error.format(),
        null,
        2
      )
    );

    throw new Error(
      'Invalid environment variables'
    );
  }

  return result.data;
}

export const env = parseEnv();