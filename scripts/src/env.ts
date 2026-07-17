import { config } from "dotenv";
import { resolve } from "node:path";

// Commands are normally run from scripts/, but loading both locations keeps
// direct command execution and root-level npm invocations consistent.
for (const envFile of ["../.env", "../.env.local", ".env", ".env.local"]) {
  config({ path: resolve(process.cwd(), envFile), override: false });
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  GSHL_DATA_BACKEND: process.env.GSHL_DATA_BACKEND ?? "convex",
  GSHL_CONVEX_TARGET: process.env.GSHL_CONVEX_TARGET ?? "production",
  USE_GOOGLE_SHEETS: process.env.USE_GOOGLE_SHEETS ?? "true",
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  GOOGLE_APPS_SCRIPT_ID: process.env.GOOGLE_APPS_SCRIPT_ID,
  GOOGLE_APPS_SCRIPT_ACCESS_TOKEN: process.env.GOOGLE_APPS_SCRIPT_ACCESS_TOKEN,
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  CONVEX_URL: process.env.CONVEX_URL,
  CONVEX_PROD_URL: process.env.CONVEX_PROD_URL,
  CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
  CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
  CONVEX_SERVER_SECRET: process.env.CONVEX_SERVER_SECRET,
};
