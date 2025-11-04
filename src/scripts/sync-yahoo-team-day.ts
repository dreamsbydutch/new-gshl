/**
 * Sync Yahoo Team Day Script
 * ===========================
 * Fetches and normalizes Yahoo Fantasy Sports roster data for a specific team and date.
 *
 * @description
 * This script retrieves roster information from Yahoo Fantasy Hockey API for a given
 * team and date, then normalizes the data into a standardized format for storage.
 * Handles OAuth authentication, player metadata extraction, and position mapping.
 *
 * @features
 * - OAuth 2.0 authentication with automatic token refresh
 * - Flexible CLI argument parsing (flags or positional)
 * - Comprehensive player metadata extraction (positions, stats, headshots)
 * - Position normalization and eligibility mapping
 * - Injury status and keeper contract tracking
 * - Error handling with detailed logging
 *
 * @usage
 * ```sh
 * # Using flags
 * npm run sync:yahoo -- --team=1 --date=2025-11-01
 *
 * # Using positional arguments (team date)
 * npm run sync:yahoo -- 1 2025-11-01
 *
 * # With custom league/game
 * npm run sync:yahoo -- --team=1 --league=123456 --game=nhl
 *
 * # With manual token
 * npm run sync:yahoo -- --team=1 --token=your_access_token
 * ```
 *
 * @output
 * - Normalized roster data with player details
 * - Position assignments and eligibility
 * - Transaction history and ownership stats
 * - Injury and keeper status flags
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const [{ env }] = await Promise.all([import("@gshl-env")]);

// ============================================================================
// Type Definitions
// ============================================================================

interface CliOptions {
  teamId?: string;
  date?: string;
  leagueId?: string;
  gameKey?: string;
  token?: string;
}

/**
 * Player name fields exposed by the Yahoo roster payload.
 */
interface YahooRosterPlayerName {
  full: string;
  first?: string;
  last?: string;
  asciiFirst?: string;
  asciiLast?: string;
}

/**
 * Selected lineup slot metadata attached to a roster player.
 */
interface YahooRosterSelectedPosition {
  coverageType?: string;
  date?: string;
  position?: string;
  isFlex?: boolean;
}

/**
 * Keeper contract signals pulled from Yahoo for dynasty leagues.
 */
interface YahooRosterKeeperStatus {
  status?: boolean;
  cost?: boolean;
  kept?: boolean;
}

/**
 * Headshot asset returned for a Yahoo player.
 */
interface YahooRosterPlayerHeadshot {
  url: string;
  size?: string;
}

/**
 * Normalized Yahoo roster player entry.
 */
interface YahooRosterPlayer {
  slot: number;
  playerKey: string;
  playerId: string;
  name: YahooRosterPlayerName;
  url?: string;
  editorialPlayerKey?: string;
  editorialTeamKey?: string;
  editorialTeamFullName?: string;
  editorialTeamAbbr?: string;
  editorialTeamUrl?: string;
  isKeeper?: YahooRosterKeeperStatus;
  uniformNumber?: string;
  displayPosition?: string;
  headshot?: YahooRosterPlayerHeadshot;
  imageUrl?: string;
  isUndroppable?: boolean;
  positionType?: string;
  primaryPosition?: string;
  eligiblePositions: string[];
  eligiblePositionsToAdd: string[];
  hasPlayerNotes?: boolean;
  playerNotesLastTimestamp?: number;
  selectedPosition?: YahooRosterSelectedPosition;
  isEditableSlot?: boolean;
}

/**
 * Minimum games requirement tied to a roster payload.
 */
interface YahooRosterMinimumGames {
  coverageType?: string;
  coverageValue?: number;
  value?: string;
}

/**
 * Summary of the Yahoo roster response in a TypeScript-friendly shape.
 */
interface YahooRosterSummary {
  teamKey?: string;
  teamId?: string;
  teamName?: string;
  teamUrl?: string;
  coverageType?: string;
  date?: string;
  isEditable?: boolean;
  isPrescoring?: boolean;
  minimumGames?: YahooRosterMinimumGames;
  playerCount: number;
  players: YahooRosterPlayer[];
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * Parses command-line arguments for the Yahoo roster sync script.
 */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (const arg of argv) {
    if (arg.startsWith("--team=")) {
      options.teamId = arg.split("=", 2)[1]?.trim();
    } else if (arg.startsWith("--date=")) {
      options.date = arg.split("=", 2)[1]?.trim();
    } else if (arg.startsWith("--league=")) {
      options.leagueId = arg.split("=", 2)[1]?.trim();
    } else if (arg.startsWith("--game=")) {
      options.gameKey = arg.split("=", 2)[1]?.trim();
    } else if (arg.startsWith("--token=")) {
      options.token = arg.split("=", 2)[1]?.trim();
    } else if (!options.teamId && /^\d+$/.test(arg)) {
      options.teamId = arg.trim();
    } else if (!options.date && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      options.date = arg.trim();
    }
  }

  return options;
}

/**
 * Validates that a required value is present.
 *
 * @param value - The value to check
 * @param label - Human-readable label for error messages
 * @returns The validated value
 * @throws Error if value is undefined or empty
 */
function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required ${label}.`);
  }
  return value;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Main execution function for the Yahoo roster sync script.
 *
 * @description
 * Orchestrates the entire sync process:
 * 1. Parses CLI arguments
 * 2. Validates and resolves configuration
 * 3. Authenticates with Yahoo OAuth
 * 4. Fetches roster data from Yahoo API
 * 5. Displays formatted results
 */
async function run(): Promise<void> {
  try {
    const cli = parseArgs(process.argv.slice(2));

    // Validate and resolve configuration
    const teamId = requireValue(cli.teamId, "team id (--team)");
    const leagueId = requireValue(
      cli.leagueId ?? env.YAHOO_LEAGUE_ID,
      "league id (env YAHOO_LEAGUE_ID or --league)",
    );
    const gameKey = cli.gameKey ?? env.YAHOO_GAME_KEY ?? "nhl";
    const date = cli.date ?? new Date().toISOString().slice(0, 10);

    // Resolve access token
    const accessToken = await resolveAccessToken(cli.token);

    // Fetch roster data
    const roster = await fetchYahooRoster({
      teamId,
      leagueId,
      gameKey,
      date,
      accessToken,
    });

    // Output results
    displayRosterSummary(roster);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Yahoo roster sync failed: ${message}`);
    process.exitCode = 1;
  }
}

/**
 * Fetches roster data from Yahoo Fantasy Sports API.
 *
 * @param params - Configuration including team, league, game key, date, and access token
 * @returns Normalized roster summary with player details
 * @throws Error if API request fails or response cannot be normalized
 */
async function fetchYahooRoster(params: {
  teamId: string;
  leagueId: string;
  gameKey: string;
  date: string;
  accessToken: string;
}): Promise<YahooRosterSummary> {
  const { teamId, leagueId, gameKey, date, accessToken } = params;
  const teamKey = `${gameKey}.l.${leagueId}.t.${teamId}`;
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster;date=${date}?format=json`;

  console.log("Yahoo roster request:");
  console.log(`  Team: ${teamKey}`);
  console.log(`  Date: ${date}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  console.log(`HTTP ${response.status} ${response.statusText}`);

  if (!response.ok) {
    throw new Error(
      `Yahoo API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const json = JSON.parse(text);

  const normalized = parseYahooRoster(json);
  if (!normalized) {
    console.log("⚠️ Raw response (unable to normalize):");
    console.log(JSON.stringify(json, null, 2));
    throw new Error("Unable to normalize roster payload into expected shape");
  }

  return normalized;
}

/**
 * Displays a formatted summary of the roster data.
 *
 * @param roster - The normalized roster summary to display
 *
 * @description
 * Outputs a JSON-formatted summary including:
 * - Team identification and name
 * - Roster date
 * - Player count
 * - Player details (slot, name, positions)
 */
function displayRosterSummary(roster: YahooRosterSummary): void {
  console.log("\n✅ Roster sync successful!");
  console.log(
    JSON.stringify(
      {
        teamKey: roster.teamKey,
        teamName: roster.teamName,
        date: roster.date,
        playerCount: roster.playerCount,
        players: roster.players.map((player) => ({
          slot: player.slot,
          fullName: player.name.full,
          primaryPosition: player.primaryPosition ?? player.displayPosition,
          selectedPosition: player.selectedPosition?.position,
          eligiblePositions: player.eligiblePositions,
        })),
      },
      null,
      2,
    ),
  );
}

// ============================================================================
// Yahoo Response Parser
// ============================================================================

/**
 * Parses the raw Yahoo API response into a normalized roster summary.
 *
 * @param raw - The raw JSON response from Yahoo Fantasy Sports API
 * @returns Normalized roster summary or null if parsing fails
 *
 * @description
 * Transforms Yahoo's complex nested response structure into a clean,
 * type-safe format. Handles various response formats and extracts:
 * - Team metadata (key, name, URL)
 * - Roster configuration (date, coverage type, edit status)
 * - Player details (positions, stats, eligibility, transactions)
 */
function parseYahooRoster(raw: unknown): YahooRosterSummary | null {
  if (!isObjectRecord(raw)) {
    return null;
  }

  const fantasyContent = raw.fantasy_content;
  if (!isObjectRecord(fantasyContent)) {
    return null;
  }

  const teamEntries = fantasyContent.team;
  if (!Array.isArray(teamEntries) || teamEntries.length === 0) {
    return null;
  }

  const teamInfo: Record<string, unknown> = {};
  let rosterSection: unknown;

  for (const entry of teamEntries) {
    if (Array.isArray(entry)) {
      mergeKeyedObjects(entry, teamInfo);
      continue;
    }

    if (!isObjectRecord(entry)) {
      continue;
    }

    if ("roster" in entry) {
      rosterSection = entry.roster;
    }

    for (const [key, value] of Object.entries(entry)) {
      if (teamInfo[key] === undefined) {
        teamInfo[key] = value;
      }
    }
  }

  const teamKey = pickString(teamInfo.team_key);
  const teamId = pickString(teamInfo.team_id);

  let teamName: string | undefined;
  const rawName = teamInfo.name;
  if (typeof rawName === "string") {
    teamName = rawName;
  } else if (isObjectRecord(rawName) && typeof rawName.full === "string") {
    teamName = rawName.full;
  }

  const teamUrl = pickString(teamInfo.url);

  let rosterMeta: Record<string, unknown> | undefined;
  let rosterData: Record<string, unknown> | undefined;

  if (Array.isArray(rosterSection)) {
    for (const entry of rosterSection) {
      if (!isObjectRecord(entry)) {
        continue;
      }

      if ("players" in entry) {
        rosterData = entry;
      } else {
        rosterMeta = entry;
      }
    }
  } else if (isObjectRecord(rosterSection)) {
    const numericEntries: Record<string, unknown>[] = [];
    const metaEntries: [string, unknown][] = [];

    for (const [key, value] of Object.entries(rosterSection)) {
      if (/^\d+$/.test(key) && isObjectRecord(value)) {
        numericEntries.push(value);
      } else {
        metaEntries.push([key, value]);
      }
    }

    if (metaEntries.length > 0) {
      rosterMeta = Object.fromEntries(metaEntries);
    }

    rosterData =
      numericEntries.find((entry) => "players" in entry) ?? rosterData;
  }

  const coverageType = pickString(
    rosterData?.coverage_type ?? rosterMeta?.coverage_type,
  );
  const date = pickString(rosterData?.date ?? rosterMeta?.date);
  const isEditable = parseBooleanFlag(
    rosterData?.is_editable ?? rosterMeta?.is_editable,
  );
  const isPrescoring = parseBooleanFlag(
    rosterData?.is_prescoring ?? rosterMeta?.is_prescoring,
  );
  const minimumGames = parseMinimumGames(
    rosterData?.minimum_games ?? rosterMeta?.minimum_games,
  );

  const { players, playerCount } = parseYahooPlayers(rosterData?.players);

  return {
    teamKey,
    teamId,
    teamName,
    teamUrl,
    coverageType,
    date,
    isEditable,
    isPrescoring,
    minimumGames,
    playerCount,
    players,
  };
}

/**
 * Parses the players array from a Yahoo roster response.
 */
function parseYahooPlayers(raw: unknown): {
  players: YahooRosterPlayer[];
  playerCount: number;
} {
  const players: YahooRosterPlayer[] = [];
  let count = 0;

  if (!isObjectRecord(raw)) {
    return { players, playerCount: count };
  }

  const rawCount = parseNumber(raw.count);
  if (typeof rawCount === "number") {
    count = rawCount;
  }

  for (const [slotKey, slotValue] of Object.entries(raw)) {
    if (slotKey === "count" || !isObjectRecord(slotValue)) {
      continue;
    }

    const segments = slotValue.player;
    if (!Array.isArray(segments) || segments.length === 0) {
      continue;
    }

    const attributeSegment = segments[0];
    const attributes = flattenAttributeSegment(attributeSegment);

    const playerKey = pickString(attributes.player_key);
    const playerId = pickString(attributes.player_id);
    const name = parsePlayerName(attributes.name);

    if (!playerKey || !playerId || !name) {
      continue;
    }

    const eligiblePositions = extractPositions(
      attributes.eligible_positions,
    );
    const eligiblePositionsToAdd = extractPositions(
      attributes.eligible_positions_to_add,
    );

    const selectedPosition = parseSelectedPositionSegment(
      segments.find(
        (segment): segment is Record<string, unknown> =>
          isObjectRecord(segment) &&
          Array.isArray(
            (segment).selected_position,
          ),
      ),
    );

    const isEditableSlot = parseBooleanFlag(
      segments.find(
        (segment): segment is Record<string, unknown> =>
          isObjectRecord(segment) && "is_editable" in segment,
      )?.is_editable,
    );

    players.push({
      slot: parseSlot(slotKey),
      playerKey,
      playerId,
      name,
      url: pickString(attributes.url),
      editorialPlayerKey: pickString(attributes.editorial_player_key),
      editorialTeamKey: pickString(attributes.editorial_team_key),
      editorialTeamFullName: pickString(attributes.editorial_team_full_name),
      editorialTeamAbbr: pickString(attributes.editorial_team_abbr),
      editorialTeamUrl: pickString(attributes.editorial_team_url),
      isKeeper: parseKeeperStatus(attributes.is_keeper),
      uniformNumber: pickString(attributes.uniform_number),
      displayPosition: pickString(attributes.display_position),
      headshot: parseHeadshot(attributes.headshot),
      imageUrl: pickString(attributes.image_url),
      isUndroppable: parseBooleanFlag(attributes.is_undroppable),
      positionType: pickString(attributes.position_type),
      primaryPosition: pickString(attributes.primary_position),
      eligiblePositions,
      eligiblePositionsToAdd,
      hasPlayerNotes: parseBooleanFlag(attributes.has_player_notes),
      playerNotesLastTimestamp: parseNumber(
        attributes.player_notes_last_timestamp,
      ),
      selectedPosition,
      isEditableSlot,
    });
  }

  players.sort((a, b) => a.slot - b.slot);

  if (count === 0) {
    count = players.length;
  }

  return { players, playerCount: count };
}

/**
 * Flattens a Yahoo API attribute segment from array format to a flat object.
 */
function flattenAttributeSegment(segment: unknown): Record<string, unknown> {
  const aggregated: Record<string, unknown> = {};

  if (!Array.isArray(segment)) {
    return aggregated;
  }

  for (const entry of segment) {
    if (isObjectRecord(entry)) {
      Object.assign(aggregated, entry);
    }
  }

  return aggregated;
}

/**
 * Merges keyed objects from an array into a target record.
 */
function mergeKeyedObjects(
  source: unknown,
  target: Record<string, unknown>,
): void {
  if (!Array.isArray(source)) {
    return;
  }

  for (const item of source) {
    if (!isObjectRecord(item)) {
      continue;
    }

    for (const [key, value] of Object.entries(item)) {
      if (target[key] === undefined) {
        target[key] = value;
      }
    }
  }
}

// ============================================================================
// Field Parsers
// ============================================================================

/**
 * Parses a player's selected position data from a Yahoo segment.
 */
function parseSelectedPositionSegment(
  segment: Record<string, unknown> | undefined,
): YahooRosterSelectedPosition | undefined {
  if (!segment) {
    return undefined;
  }

  const collection = segment.selected_position;
  if (!Array.isArray(collection)) {
    return undefined;
  }

  const aggregated = flattenAttributeSegment(collection);

  const coverageType = pickString(aggregated.coverage_type);
  const date = pickString(aggregated.date);
  const position = pickString(aggregated.position);
  const isFlex = parseBooleanFlag(aggregated.is_flex);

  if (!coverageType && !date && !position && isFlex === undefined) {
    return undefined;
  }

  return {
    coverageType,
    date,
    position,
    isFlex,
  };
}

function parseKeeperStatus(
  value: unknown,
): YahooRosterKeeperStatus | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const status = parseBooleanFlag(value.status);
  const cost = parseBooleanFlag(value.cost);
  const kept = parseBooleanFlag(value.kept);

  if (status === undefined && cost === undefined && kept === undefined) {
    return undefined;
  }

  return {
    status,
    cost,
    kept,
  };
}

function parseHeadshot(value: unknown): YahooRosterPlayerHeadshot | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const url = pickString(value.url);
  if (!url) {
    return undefined;
  }

  return {
    url,
    size: pickString(value.size),
  };
}

function parsePlayerName(value: unknown): YahooRosterPlayerName | undefined {
  if (typeof value === "string") {
    return { full: value };
  }

  if (!isObjectRecord(value)) {
    return undefined;
  }

  const full = pickString(value.full);
  if (!full) {
    return undefined;
  }

  return {
    full,
    first: pickString(value.first),
    last: pickString(value.last),
    asciiFirst: pickString(value.ascii_first),
    asciiLast: pickString(value.ascii_last),
  };
}

function parseMinimumGames(
  value: unknown,
): YahooRosterMinimumGames | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const coverageType = pickString(value.coverage_type);
  const coverageValue = parseNumber(value.coverage_value);
  const total = pickString(value.value);

  if (!coverageType && coverageValue === undefined && !total) {
    return undefined;
  }

  return {
    coverageType,
    coverageValue,
    value: total,
  };
}

/**
 * Extracts position strings from a Yahoo API array.
 */
/**
 * Extracts position strings from Yahoo API position array.
 *
 * @param value - Raw position data from Yahoo API
 * @returns Array of position strings (e.g., ["C", "LW", "RW"])
 */
function extractPositions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (isObjectRecord(entry)) {
        return pickString(entry.position);
      }
      return undefined;
    })
    .filter((position): position is string => Boolean(position));
}

// ============================================================================
// Utility Type Guards & Converters
// ============================================================================

/**
 * Parses a boolean value from various Yahoo API formats.
 */
function parseBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

/**
 * Safely extracts a string value from various Yahoo API formats.
 *
 * @param value - Raw value from Yahoo API (may be string, number, or other)
 * @returns String representation or undefined if value cannot be converted
 */
function pickString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  return undefined;
}

/**
 * Parses a numeric value from various Yahoo API formats.
 */
function parseNumber(value: unknown): number | undefined {
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

/**
 * Parses a slot number from a string key.
 */
function parseSlot(slotKey: string): number {
  const parsed = Number.parseInt(slotKey, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Type guard for object records.
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ============================================================================
// OAuth Token Management
// ============================================================================

/**
 * Resolves an access token from CLI, environment variables, or by refreshing.
 *
 * @param cliToken - Optional token provided via command line
 * @returns Valid Yahoo OAuth access token
 * @throws Error if no token source is available
 *
 * @description
 * Priority order:
 * 1. CLI-provided token (--token flag)
 * 2. Environment variable YAHOO_ACCESS_TOKEN
 * 3. Refresh using YAHOO_REFRESH_TOKEN
 */
async function resolveAccessToken(cliToken?: string): Promise<string> {
  if (cliToken) {
    return cliToken;
  }

  if (env.YAHOO_ACCESS_TOKEN) {
    return env.YAHOO_ACCESS_TOKEN;
  }

  if (env.YAHOO_REFRESH_TOKEN) {
    console.log("Refreshing Yahoo OAuth access token...");
    const refreshed = await refreshYahooAccessToken();
    if (typeof refreshed.expiresIn === "number") {
      const minutes = Math.max(1, Math.round(refreshed.expiresIn / 60));
      console.log(
        `  Access token valid for approximately ${minutes} minute${
          minutes === 1 ? "" : "s"
        }.`,
      );
    }
    return refreshed.accessToken;
  }

  throw new Error(
    "No Yahoo access token available. Provide --token, set YAHOO_ACCESS_TOKEN, or configure YAHOO_REFRESH_TOKEN.",
  );
}

/**
 * Refreshes a Yahoo OAuth access token using a refresh token.
 *
 * @returns Object containing new access token and expiration time
 * @throws Error if OAuth credentials are missing or refresh fails
 *
 * @description
 * Uses the OAuth 2.0 refresh token flow to obtain a new access token.
 * Requires YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, and YAHOO_REFRESH_TOKEN
 * environment variables to be set.
 */
async function refreshYahooAccessToken(): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const clientId = env.YAHOO_CLIENT_ID;
  const clientSecret = env.YAHOO_CLIENT_SECRET;
  const refreshToken = env.YAHOO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
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

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail =
      payload.error_description || payload.error || response.statusText;
    throw new Error(`Yahoo token request failed: ${detail}`);
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
  };
}

// ============================================================================
// Script Execution
// ============================================================================

await run();
