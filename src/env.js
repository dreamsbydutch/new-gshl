import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    // DATABASE_URL: z.string().url(),
    // DIRECT_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    GSHL_DATA_BACKEND: z.enum(["sheets", "convex"]).default("sheets"),
    USE_GOOGLE_SHEETS: z.enum(["true", "false"]).default("true"),
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional(),
    GOOGLE_APPS_SCRIPT_ID: z.string().optional(),
    GOOGLE_APPS_SCRIPT_ACCESS_TOKEN: z.string().optional(),
    CONVEX_DEPLOYMENT: z.string().optional(),
    CONVEX_DEPLOY_KEY: z.string().optional(),
    UPLOADTHING_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    // DATABASE_URL: process.env.DATABASE_URL,
    // DIRECT_URL: process.env.DIRECT_URL,
    NODE_ENV: process.env.NODE_ENV,
    GSHL_DATA_BACKEND: process.env.GSHL_DATA_BACKEND ?? "sheets",
    USE_GOOGLE_SHEETS: process.env.USE_GOOGLE_SHEETS ?? "true",
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE:
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    GOOGLE_APPS_SCRIPT_ID: process.env.GOOGLE_APPS_SCRIPT_ID,
    GOOGLE_APPS_SCRIPT_ACCESS_TOKEN:
      process.env.GOOGLE_APPS_SCRIPT_ACCESS_TOKEN,
    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
