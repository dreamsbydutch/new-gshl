import type {
  YahooFantasyResponse,
  YahooGame,
  YahooLeague,
  YahooMatchupsCollection,
  YahooPlayersCollection,
  YahooRoster,
  YahooTeam,
  YahooTransactionsCollection,
  YahooUserGamesCollection,
  YahooUsersCollection,
} from "@gshl-types";

import { env } from "@gshl-env";

import {
  resolveYahooAccessToken,
  type ResolveYahooAccessTokenOptions,
  type YahooAccessTokenResult,
} from "./auth";
import { parseYahooFantasyXml, YahooXmlParseError } from "./xml";

const YAHOO_FANTASY_API_BASE =
  "https://fantasysports.yahooapis.com/fantasy/v2/";

export interface YahooRequestOptions
  extends Omit<RequestInit, "headers" | "body">,
    ResolveYahooAccessTokenOptions {
  /** Optional Authorization header override when you want to fully control headers. */
  headers?: HeadersInit;
  /** Optional request body (for write endpoints). */
  body?: BodyInit | null;
  /** Query parameters appended to the resource URL. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Expose the raw XML response alongside the typed payload. */
  includeRawXml?: boolean;
}

export interface YahooFetchResult<TPayload = unknown>
  extends YahooFantasyResponse<TPayload> {
  /** Raw XML string returned by Yahoo (only populated when `includeRawXml` is true). */
  rawXml?: string;
  /** Access token used for the request (helpful when it was refreshed automatically). */
  token?: YahooAccessTokenResult;
  /** HTTP headers returned by Yahoo. */
  headers: Headers;
  /** HTTP status code for the underlying request. */
  status: number;
}

export class YahooApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: string;

  constructor(
    message: string,
    options: { status: number; statusText: string; url: string; body: string },
  ) {
    super(message);
    this.name = "YahooApiError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.url = options.url;
    this.body = options.body;
  }
}

export class YahooConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooConfigError";
  }
}

/**
 * Perform a Yahoo Fantasy API request and parse the XML response into a typed payload.
 */
export async function yahooFetch<TPayload = unknown>(
  resourcePath: string,
  options?: YahooRequestOptions,
): Promise<YahooFetchResult<TPayload>> {
  const url = buildYahooUrl(resourcePath, options?.query);

  const tokenResult = await resolveYahooAccessToken(options);
  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${tokenResult.accessToken}`);
  headers.set("Accept", "application/xml");

  const response = await fetch(url, {
    ...options,
    method: options?.method ?? "GET",
    headers,
    body: options?.body ?? null,
  });

  const rawXml = await response.text();

  if (!response.ok) {
    throw new YahooApiError(
      `Yahoo API request failed with status ${response.status}.`,
      {
        status: response.status,
        statusText: response.statusText,
        url,
        body: rawXml,
      },
    );
  }

  let parsed: YahooFantasyResponse<TPayload>;
  try {
    parsed = parseYahooFantasyXml<TPayload>(rawXml);
  } catch (error) {
    if (error instanceof YahooXmlParseError) {
      throw error;
    }

    throw new YahooXmlParseError(String(error));
  }

  return {
    ...parsed,
    rawXml: options?.includeRawXml ? rawXml : undefined,
    token: tokenResult,
    headers: response.headers,
    status: response.status,
  };
}

/**
 * Convenience wrapper around `yahooFetch` for the common Yahoo resources.
 */
export const yahooEndpoints = {
  game: (gameKey: string, options?: YahooRequestOptions) =>
    yahooFetch<{ game: YahooGame }>(`game/${gameKey}`, options),

  games: (
    qualifiers?: Record<string, string | number | readonly (string | number)[]>,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{ games: { game?: YahooGame | YahooGame[]; count?: string } }>(
      `games${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  league: (leagueKey?: string, options?: YahooRequestOptions) =>
    yahooFetch<{ league: YahooLeague }>(
      `league/${resolveLeagueKey(leagueKey)}`,
      options,
    ),

  leagueStandings: (leagueKey?: string, options?: YahooRequestOptions) =>
    yahooFetch<{ league: YahooLeague & { standings: { teams: unknown } } }>(
      `league/${resolveLeagueKey(leagueKey)}/standings`,
      options,
    ),

  leagueScoreboard: (
    leagueKey?: string,
    qualifiers?: Record<string, string | number | readonly (string | number)[]>,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{
      league: YahooLeague & {
        scoreboard: { week: string; matchups: YahooMatchupsCollection };
      };
    }>(
      `league/${resolveLeagueKey(leagueKey)}/scoreboard${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  team: (teamKey: string, options?: YahooRequestOptions) =>
    yahooFetch<{ team: YahooTeam }>(`team/${teamKey}`, options),

  teamRoster: (
    teamKey: string,
    qualifiers?: YahooRosterQualifiers,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{ team: YahooTeam & { roster: YahooRoster } }>(
      `team/${teamKey}/roster${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  teamMatchups: (
    teamKey: string,
    qualifiers?: YahooRosterQualifiers,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{ team: YahooTeam & { matchups: YahooMatchupsCollection } }>(
      `team/${teamKey}/matchups${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  leaguePlayers: (
    leagueKey?: string,
    qualifiers?: YahooPlayersQualifiers,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{ league: YahooLeague & { players: YahooPlayersCollection } }>(
      `league/${resolveLeagueKey(leagueKey)}/players${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  leagueTransactions: (
    leagueKey?: string,
    qualifiers?: YahooTransactionsQualifiers,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{
      league: YahooLeague & { transactions: YahooTransactionsCollection };
    }>(
      `league/${resolveLeagueKey(leagueKey)}/transactions${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  users: (qualifiers?: YahooUsersQualifiers, options?: YahooRequestOptions) =>
    yahooFetch<{ users: YahooUsersCollection }>(
      `users${buildQualifierSuffix(qualifiers)}`,
      options,
    ),

  userGames: (
    qualifiers?: YahooUsersQualifiers,
    options?: YahooRequestOptions,
  ) =>
    yahooFetch<{
      users: {
        user:
          | { games: YahooUserGamesCollection }
          | Array<{ games: YahooUserGamesCollection }>;
      };
    }>(`users${buildQualifierSuffix(qualifiers)}/games`, options),
};

export type YahooRosterQualifiers =
  | Record<string, string | number | readonly (string | number)[]>
  | undefined;

export type YahooPlayersQualifiers =
  | Record<string, string | number | readonly (string | number)[]>
  | undefined;

export type YahooTransactionsQualifiers =
  | Record<string, string | number | readonly (string | number)[]>
  | undefined;

export type YahooUsersQualifiers =
  | Record<string, string | number | readonly (string | number)[]>
  | undefined;

function resolveLeagueKey(leagueKey?: string): string {
  const candidate = (leagueKey ?? env.YAHOO_LEAGUE_ID)?.trim();

  if (!candidate) {
    throw new YahooConfigError(
      "Yahoo league key is required. Pass a leagueKey argument or set YAHOO_LEAGUE_ID.",
    );
  }

  if (/^\d+$/.test(candidate)) {
    const gameKey = env.YAHOO_GAME_KEY?.trim() ?? "nhl";
    return `${gameKey}.l.${candidate}`;
  }

  return candidate;
}

function buildYahooUrl(
  resourcePath: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const normalizedPath = resourcePath.startsWith("http")
    ? resourcePath
    : `${YAHOO_FANTASY_API_BASE}${resourcePath.replace(/^\/+/, "")}`;

  if (!query || Object.keys(query).length === 0) {
    return normalizedPath;
  }

  const url = new URL(normalizedPath);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function buildQualifierSuffix(
  qualifiers?: Record<string, string | number | readonly (string | number)[]>,
): string {
  if (!qualifiers) {
    return "";
  }

  const parts: string[] = [];

  for (const [key, rawValue] of Object.entries(qualifiers)) {
    if (rawValue === undefined) {
      continue;
    }

    const value = Array.isArray(rawValue)
      ? rawValue.join(",")
      : String(rawValue);

    if (value.length === 0) {
      continue;
    }

    parts.push(`${key}=${encodeQualifierValue(value)}`);
  }

  return parts.length ? `;${parts.join(";")}` : "";
}

function encodeQualifierValue(value: string): string {
  return value.replaceAll(" ", "%20");
}
