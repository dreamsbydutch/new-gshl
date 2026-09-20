"use node";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const CALLBACK_PATH = "/yahoo/callback";
export const LEAGUES_PATH = "users;use_login=1/games;game_codes=nhl/leagues";

export type YahooTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export type YahooLeague = { key: string; name: string; season: string | null };

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(`gshl:yahoo:tokens:v1:${secret}`).digest();
}

export function encryptTokens(tokens: YahooTokens, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTokens(value: string, secret: string): YahooTokens {
  try {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const parsed: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      !isRecord(parsed) ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    )
      throw new Error();
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    throw new Error(
      "Yahoo connection cannot be decrypted. Reconnect after changing the client secret.",
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTokens(
  value: unknown,
  now: number,
  previousRefreshToken?: string,
): YahooTokens {
  if (
    !isRecord(value) ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    typeof value.expires_in !== "number" ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0 ||
    typeof value.token_type !== "string" ||
    value.token_type.toLowerCase() !== "bearer"
  ) {
    throw new Error("Yahoo returned an invalid token response.");
  }
  const refreshToken =
    typeof value.refresh_token === "string" && value.refresh_token
      ? value.refresh_token
      : previousRefreshToken;
  if (!refreshToken)
    throw new Error(
      "Yahoo did not return a refresh token. Reconnect the account.",
    );
  return {
    accessToken: value.access_token,
    refreshToken,
    expiresAt: now + value.expires_in * 1000,
  };
}

export function authorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const url = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  }).toString();
  // Yahoo uses the Fantasy read permission approved on the developer app.
  return url.toString();
}

export async function exchangeTokens(
  clientId: string,
  secret: string,
  params: URLSearchParams,
  previousRefreshToken?: string,
  request: typeof fetch = fetch,
): Promise<YahooTokens> {
  let response: Response;
  try {
    response = await request("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch {
    throw new Error("Yahoo token request failed. Please retry the connection.");
  }
  if (!response.ok)
    throw new Error(
      `Yahoo token request failed (HTTP ${response.status}). Reconnect if access was revoked.`,
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Yahoo returned an invalid token response.");
  }
  return parseTokens(body, Date.now(), previousRefreshToken);
}

export async function readHockeyLeagues(
  accessToken: string,
  request: typeof fetch = fetch,
): Promise<YahooLeague[]> {
  let response: Response;
  try {
    response = await request(
      `https://fantasysports.yahooapis.com/fantasy/v2/${LEAGUES_PATH}?format=json`,
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
  } catch {
    throw new Error("Yahoo Fantasy API request failed. Please retry.");
  }
  if (!response.ok)
    throw new Error(
      `Yahoo Fantasy API check failed (HTTP ${response.status}). Confirm the app has Fantasy Sports read access and the account can access the league.`,
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Yahoo returned invalid Fantasy JSON.");
  }
  if (
    !isRecord(body) ||
    !isRecord(body.fantasy_content) ||
    !("users" in body.fantasy_content)
  )
    throw new Error("Yahoo returned an unexpected Fantasy response.");
  return extractLeagues(body.fantasy_content.users);
}

export function extractLeagues(value: unknown): YahooLeague[] {
  const leagues = new Map<string, YahooLeague>();
  function visit(node: unknown, depth: number) {
    if (depth > 30)
      throw new Error("Yahoo response nesting exceeded the supported limit.");
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    if (typeof node.league_key === "string" && typeof node.name === "string") {
      leagues.set(node.league_key, {
        key: node.league_key,
        name: node.name,
        season:
          typeof node.season === "string" || typeof node.season === "number"
            ? String(node.season)
            : null,
      });
    }
    for (const child of Object.values(node)) visit(child, depth + 1);
  }
  visit(value, 0);
  return [...leagues.values()].sort(
    (a, b) =>
      (b.season ?? "").localeCompare(a.season ?? "") ||
      a.key.localeCompare(b.key),
  );
}
