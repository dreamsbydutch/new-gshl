import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizationUrl,
  decryptTokens,
  encryptTokens,
  exchangeTokens,
  extractLeagues,
  parseTokens,
  readHockeyLeagues,
} from "./lib/yahooOAuth";

void test("tokens are authenticated ciphertext and reject tampering or a changed secret", () => {
  const tokens = {
    accessToken: "fixture-access",
    refreshToken: "fixture-refresh",
    expiresAt: 12345,
  };
  const first = encryptTokens(tokens, "fixture-secret");
  const second = encryptTokens(tokens, "fixture-secret");
  assert.notEqual(first, second);
  assert.ok(!first.includes(tokens.accessToken));
  assert.deepEqual(decryptTokens(first, "fixture-secret"), tokens);
  assert.throws(() => decryptTokens(first, "different-secret"), /Reconnect/);
  assert.throws(
    () => decryptTokens(first.slice(0, -10), "fixture-secret"),
    /Reconnect/,
  );
});

void test("token responses rotate refresh tokens and retain an omitted refresh token", () => {
  const value = {
    access_token: "fixture-access",
    refresh_token: "fixture-new",
    token_type: "bearer",
    expires_in: 3600,
  };
  assert.deepEqual(parseTokens(value, 1000, "fixture-old"), {
    accessToken: "fixture-access",
    refreshToken: "fixture-new",
    expiresAt: 3_601_000,
  });
  assert.equal(
    parseTokens({ ...value, refresh_token: undefined }, 1000, "fixture-old")
      .refreshToken,
    "fixture-old",
  );
  for (const expires_in of [0, -1, NaN, Infinity, "3600"])
    assert.throws(() => parseTokens({ ...value, expires_in }, 0));
  assert.throws(
    () => parseTokens({ ...value, refresh_token: undefined }, 0),
    /refresh token/,
  );
  assert.throws(() => parseTokens({ ...value, token_type: "basic" }, 0));
});

void test("authorization uses the registered callback and state without credentials in URLs", () => {
  const url = new URL(
    authorizationUrl(
      "fixture-client",
      "https://example.convex.site/yahoo/callback",
      "fixture-state",
    ),
  );
  assert.equal(url.origin, "https://api.login.yahoo.com");
  assert.equal(url.searchParams.get("state"), "fixture-state");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://example.convex.site/yahoo/callback",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.has("client_secret"), false);
});

void test("league projection handles Yahoo numeric collections and removes private fields", () => {
  const league = {
    league_key: "461.l.123",
    name: "GSHL",
    season: "2026",
    password: "private-fixture",
  };
  const input = {
    0: {
      user: [
        { guid: "private-guid" },
        {
          games: {
            0: {
              game: [
                { game_code: "nhl" },
                { leagues: { 0: { league: [league] }, count: 1 } },
              ],
            },
            count: 1,
          },
        },
      ],
    },
  };
  assert.deepEqual(extractLeagues(input), [
    { key: "461.l.123", name: "GSHL", season: "2026" },
  ]);
  assert.equal(extractLeagues([league, league]).length, 1);
  assert.deepEqual(extractLeagues({ count: 0 }), []);
});

void test("token exchange uses POST basic auth and never exposes provider error bodies", async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.login.yahoo.com/oauth2/get_token");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.ok(
      new Headers(options?.headers).get("Authorization")?.startsWith("Basic "),
    );
    return new Response(
      JSON.stringify({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
      }),
    );
  };
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: "fixture-code",
  });
  assert.equal(
    (
      await exchangeTokens(
        "fixture-id",
        "fixture-secret",
        params,
        undefined,
        request,
      )
    ).refreshToken,
    "fixture-refresh",
  );
  await assert.rejects(
    exchangeTokens(
      "fixture-id",
      "fixture-secret",
      params,
      undefined,
      async () => new Response("private-provider-body", { status: 401 }),
    ),
    (error: Error) =>
      error.message.includes("401") &&
      !error.message.includes("private-provider-body"),
  );
  await assert.rejects(
    exchangeTokens(
      "fixture-id",
      "fixture-secret",
      params,
      undefined,
      async () => {
        throw new Error("private-network-details");
      },
    ),
    /Yahoo token request failed/,
  );
});

void test("Fantasy check uses a fixed read endpoint and requires a valid response envelope", async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(
      url,
      "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_codes=nhl/leagues?format=json",
    );
    assert.equal(options?.method, "GET");
    assert.equal(options?.redirect, "error");
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer fixture-access",
    );
    return Response.json({ fantasy_content: { users: { count: 0 } } });
  };
  assert.deepEqual(await readHockeyLeagues("fixture-access", request), []);
  await assert.rejects(
    readHockeyLeagues("fixture-access", async () =>
      Response.json({ error: "private-error" }),
    ),
    /unexpected Fantasy response/,
  );
  await assert.rejects(
    readHockeyLeagues(
      "fixture-access",
      async () => new Response("private", { status: 403 }),
    ),
    /HTTP 403/,
  );
});
