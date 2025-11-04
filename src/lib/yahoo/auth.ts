import { Buffer } from "node:buffer";

import { env } from "@gshl-env";

/**
 * Details returned when resolving or refreshing a Yahoo OAuth access token.
 */
export interface YahooAccessTokenResult {
  accessToken: string;
  expiresIn?: number;
}

export interface ResolveYahooAccessTokenOptions {
  /**
   * Explicit access token to use instead of env-configured credentials.
   */
  accessToken?: string;
  /**
   * Forces a refresh token flow even when an access token has been provided via env.
   */
  forceRefresh?: boolean;
}

/**
 * Error thrown when Yahoo OAuth credentials are missing or a refresh attempt fails.
 */
export class YahooAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooAuthError";
  }
}

/**
 * Resolve a Yahoo OAuth access token.
 *
 * Order of precedence:
 * 1. `options.accessToken`
 * 2. Cached env access token (`YAHOO_ACCESS_TOKEN`) when `forceRefresh` is false
 * 3. Refresh token flow using `YAHOO_REFRESH_TOKEN` (+ client credentials)
 */
export async function resolveYahooAccessToken(
  options?: ResolveYahooAccessTokenOptions,
): Promise<YahooAccessTokenResult> {
  if (options?.accessToken) {
    return { accessToken: options.accessToken };
  }

  if (!options?.forceRefresh && env.YAHOO_ACCESS_TOKEN) {
    return { accessToken: env.YAHOO_ACCESS_TOKEN };
  }

  if (env.YAHOO_REFRESH_TOKEN) {
    return refreshYahooAccessToken();
  }

  throw new YahooAuthError(
    "Yahoo access token unavailable. Provide an access token directly, set YAHOO_ACCESS_TOKEN, or configure YAHOO_REFRESH_TOKEN + client credentials.",
  );
}

/**
 * Exchange a refresh token for a new Yahoo OAuth access token.
 */
export async function refreshYahooAccessToken(): Promise<YahooAccessTokenResult> {
  const clientId = env.YAHOO_CLIENT_ID;
  const clientSecret = env.YAHOO_CLIENT_SECRET;
  const refreshToken = env.YAHOO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new YahooAuthError(
      "Missing Yahoo OAuth credentials. Set YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, and YAHOO_REFRESH_TOKEN.",
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: "oob",
  });

  const authHeader = Buffer.from(
    `${clientId}:${clientSecret}`,
    "utf8",
  ).toString("base64");

  const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new YahooAuthError(
      `Yahoo token response was not valid JSON: ${String(error)}`,
    );
  }

  if (!isObjectRecord(payload)) {
    throw new YahooAuthError("Yahoo token response is not an object.");
  }

  const accessToken = pickString(payload.access_token);
  const expiresIn = pickNumber(payload.expires_in);
  const errorMessage =
    pickString(payload.error_description) ?? pickString(payload.error);

  if (!response.ok || !accessToken) {
    throw new YahooAuthError(
      `Yahoo token request failed: ${errorMessage ?? response.statusText}`,
    );
  }

  return { accessToken, expiresIn };
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  return undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
