import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import { getAppsScriptLineupBuilder } from "../lineup/apps-script-lineup-builder";
import {
  fetchLatestPlayerDayDate,
  fetchLatestPlayerDayPositions,
  fetchModel,
  fetchPlayerDayDate,
  fetchPlayerNhlSeason,
  updateRowsById,
  upsertByCompositeKey,
} from "../../integrations/data/convex-store";
import {
  canonicalName,
  mapPuckPediaPlayer,
  reconcilePlayerDirectory,
  type DirectoryPlayer,
  type PuckPediaRow,
  type StoredPlayer,
} from "./player-directory";
import {
  candidatesFromPuckPedia,
  parseSalaryCapOverrides,
  reconcileSalaryCandidates,
  seasonLabel,
  seasonStartYear,
  type PlayerNhlSalaryWrite,
  type StoredSalaryPlayer,
} from "./nhl-salaries";
import {
  buildPlayerActivityContext,
  type ActivitySeason,
  type ActivityStatLine,
} from "./player-activity";
import {
  normalizeEligiblePositions,
  reconcilePlayerPositions,
  resolveMostRecentPositionSeason,
  type LatestPlayerDayPosition,
  type PlayerPositionReconciliation,
  type PositionSeason,
} from "./player-position";
import {
  reconcileRosterLineups,
  type LineupReconciliation,
} from "./player-lineup";
import {
  reconcileCurrentRoster,
  resolveRosterCalendar,
  type RosterCalendar,
  type RosterContract,
  type RosterDraftPick,
  type RosterFranchise,
  type RosterPlayerDay,
  type RosterReconciliation,
  type RosterSeason,
  type RosterSource,
  type RosterTeam,
} from "./player-roster";
import {
  fetchYahooPlayerDirectory,
  type ScrapedYahooPlayer,
  type YahooPlayerDirectoryResult,
} from "../yahoo/player-yahoo-id-backfill";
import {
  closeYahooBrowserSession,
  resolveLeagueId,
} from "../yahoo/matchup-utils";

type PlayerBioSyncOptions = {
  apply: boolean;
  logToConsole: boolean;
  focusSeason: string;
  statSeason: string;
  pageSize: number;
  maxPagesPerRole: number;
  currentDate: Date;
  headless: boolean;
  browserExecutablePath: string;
  userDataDir: string;
  waitForManualClearanceMs: number;
  yahooPositions: boolean;
  yahooSeasonYear: string;
  yahooLeagueId: string;
  yahooRequestDelayMs: number;
  yahooMaxPages: number;
  yahooBrowserFallback: boolean;
  salarySeasonSpecs?: string[];
  focusSeasonStartYear?: number | null;
  salaryCapOverrides?: Record<number, number>;
};

type PuckPediaPage = {
  rows: PuckPediaRow[];
  totalRows: number;
};

type PuckPediaQuery = {
  sortBy: string;
  sortDirection: string;
  curPage: number;
  pageSize: number;
  focus_season: string;
  player_role: (typeof PLAYER_ROLES)[number]["value"];
  stat_season: string;
  bio_pos: string[];
  bio_shot: string[];
};

type SourceFetchSummary = {
  pagesFetched: number;
  skatersFetched: number;
  goaliesFetched: number;
  expectedSkaters: number;
  expectedGoalies: number;
  invalidRows: number;
  players: DirectoryPlayer[];
};

type SalarySeasonSource = {
  seasonToken: string;
  seasonStartYear: number;
  players: DirectoryPlayer[];
};

export type PlayerBioSyncSummary = {
  dryRun: boolean;
  focusSeason: string;
  statSeason: string;
  pagesFetched: number;
  sourceRows: number;
  skatersFetched: number;
  goaliesFetched: number;
  expectedSkaters: number;
  expectedGoalies: number;
  existingPlayers: number;
  matchedUpdates: number;
  clearedMissingPlayers: number;
  insertedPlayers: number;
  insertedPlayerDetails: ReturnType<
    typeof reconcilePlayerDirectory
  >["insertReviews"];
  deactivatedPlayers: number;
  deactivationPolicy: string;
  deactivationSeasonContext: {
    currentSeasonId: string;
    currentSeasonYear: number | null;
    previousSeasonId: string;
    previousSeasonYear: number | null;
  };
  deactivationBreakdown: {
    deactivate: number;
    keptByCurrentSeasonGames: number;
    keptByPreviousSeasonGames: number;
    keptByIncompleteEvidence: number;
  };
  deactivatedPlayerDetails: ReturnType<
    typeof reconcilePlayerDirectory
  >["deactivationReviews"];
  protectedUnmatchedPlayerSamples: ReturnType<
    typeof reconcilePlayerDirectory
  >["deactivationReviews"];
  unmatchedActivePlayers: number;
  unmatchedActiveBreakdown: {
    withNhlApiId: number;
    withoutNhlApiId: number;
    withNhlTeam: number;
    withoutNhlTeam: number;
    assignedToOwner: number;
    signable: number;
    resignable: number;
  };
  unmatchedActivePlayerSamples: ReturnType<
    typeof reconcilePlayerDirectory
  >["unmatchedActivePlayers"];
  unchangedPlayers: number;
  duplicateSourceRows: number;
  invalidSourceRows: number;
  identityIssues: number;
  issueSamples: ReturnType<typeof reconcilePlayerDirectory>["issues"];
  roster: {
    source: RosterReconciliation["source"];
    sourceDate: string;
    rosterSeasonId: string;
    targetTeamSeasonId: string;
    rosteredPlayers: number;
    playerDayAssignments: number;
    contractAssignments: number;
    draftPickAssignments: number;
    updatedPlayers: number;
    assignedPlayers: number;
    clearedPlayers: number;
    changedOwners: number;
    legacyTeamIdsCleared: number;
    unchangedPlayers: number;
    updateDetails: RosterReconciliation["updateReviews"];
  };
  lineup: {
    ratingField: "seasonRating";
    rosteredPlayers: number;
    starters: number;
    benchPlayers: number;
    clearedUnrosteredPlayers: number;
    updatedPlayers: number;
    unchangedPlayers: number;
    teams: LineupReconciliation["teams"];
    updateDetails: LineupReconciliation["updateReviews"];
  };
  positionEligibility: {
    seasonId: string;
    seasonYear: string;
    yahooLeagueId: string;
    yahooAttempted: boolean;
    yahooError: string;
    yahooPagesFetched: YahooPlayerDirectoryResult["pagesFetched"];
    yahooRows: number;
    yahooWarnings: string[];
    playerDayError: string;
    yahooMatches: number;
    yahooIdMatches: number;
    yahooNameMatches: number;
    playerDayFallbacks: number;
    puckPediaFallbacks: number;
    preservedExisting: number;
    missingEligibility: number;
    ambiguousYahooRows: number;
    updatedPlayers: number;
    insertedPlayersFromYahoo: number;
    updateDetails: PlayerPositionReconciliation["reviews"];
  };
  nhlSalaries: {
    seasons: string[];
    sourceRows: number;
    readyRows: number;
    unmatchedRows: number;
    ambiguousRows: number;
    duplicateRows: number;
    missingCapRows: number;
    appliedInserted?: number;
    appliedUpdated?: number;
    appliedUnchanged?: number;
  };
  appliedUpdates?: number;
  appliedInserts?: number;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES_PER_ROLE = 20;
const DEFAULT_WAIT_FOR_MANUAL_CLEARANCE_MS = 5 * 60 * 1000;
const DEFAULT_YAHOO_REQUEST_DELAY_MS = 3_500;
const DEFAULT_YAHOO_MAX_PAGES = 80;
const DEFAULT_USER_DATA_DIR = path.join(
  os.homedir(),
  ".gshl-puckpedia-browser",
);
const PLAYER_ROLES = [
  { label: "skaters", value: "1" },
  { label: "goalies", value: "0" },
] as const;

const HELP_TEXT = `
Usage:
  npm run player-bios:sync
  npm run player-bios:sync -- --apply

What it does:
  Fetches every NHL-contracted skater and goalie from PuckPedia, safely
  reconciles them against the Player table, and prepares inserts and updates.
  Presence in PuckPedia is treated as proof of an NHL contract. An unmatched
  active player is only deactivated when they have zero NHL games in both the
  current and previous seasons. Managed fields are cleared when PuckPedia has
  no current value, and only changed fields are written.
  The current GSHL roster is also reconciled from today's PlayerDay rows, the
  previous day, or the applicable signing/contract/draft offseason rules.
  Each resolved team roster is then optimized using seasonRating, with the
  resulting position written to lineupPos and every unrostered position cleared.
  The command is a dry run unless --apply is passed.

Options:
  --apply                 Persist changes to the Convex Player table.
  --headless              Run Chrome or Edge without a visible window.
  --focus-season <value>  Override PuckPedia's current focus-season token.
  --stat-season <value>   Override PuckPedia's current stat-season token.
  --focus-season-year Y   NHL start year represented by --focus-season.
                          Otherwise it is inferred from the current date.
  --salary-seasons <csv>  Future NHL start years (for example 2027,2028), or
                          YEAR=PUCKPEDIA_TOKEN when tokens are not sequential.
  --salary-cap Y=VALUE    Override/add an NHL season cap; repeat as needed.
  --page-size <value>     Requested rows per page. Default: 100; maximum: 100.
  --max-pages <value>     Pagination safety cap per role. Default: 20.
  --current-date <value>  Override the date used to calculate age.
  --browser-path <path>   Explicit Chrome or Edge executable path.
  --user-data-dir <path>  Persistent browser profile directory.
  --wait-ms <value>       Max wait for manual Cloudflare clearance.
  --skip-yahoo-positions  Skip Yahoo and use recent PlayerDay eligibility.
  --yahoo-season-year     Override the Yahoo fantasy season year.
  --yahoo-league-id       Override the Yahoo fantasy league id.
  --yahoo-request-delay-ms
                          Delay between Yahoo page requests. Default: 3500.
  --yahoo-max-pages       Yahoo pagination safety cap. Default: 80.
  --yahoo-browser-fallback
                          Allow an interactive Yahoo browser login fallback.
  --log <true|false>      Enable progress logging. Default: true.
  --help                  Show this help text.
`.trim();

function toText(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  return String(value).trim();
}

function getArgValue(args: string[], name: string): string | undefined {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1];
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function getArgValues(args: readonly string[], name: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === name && args[index + 1]) output.push(args[index + 1]!);
    if (argument.startsWith(`${name}=`)) {
      output.push(argument.slice(name.length + 1));
    }
  }
  return output;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum?: number,
): number {
  const parsed = Number(value);
  const integer =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return maximum === undefined ? integer : Math.min(integer, maximum);
}

function resolveBrowserExecutablePath(explicitPath?: string): string {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;

  const candidates = [
    process.env.PUCKPEDIA_BROWSER_PATH,
    process.env.BROWSER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      "[player-bio-sync] Could not find Chrome or Edge. Pass --browser-path.",
    );
  }
  return match;
}

export function parsePlayerBioSyncOptions(
  argv: string[],
): PlayerBioSyncOptions {
  const currentDateValue = getArgValue(argv, "--current-date");
  const currentDate = currentDateValue
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(currentDateValue)
          ? `${currentDateValue}T12:00:00.000Z`
          : currentDateValue,
      )
    : new Date();
  if (Number.isNaN(currentDate.getTime())) {
    throw new Error("[player-bio-sync] --current-date must be a valid date.");
  }

  return {
    apply: hasFlag(argv, "--apply"),
    logToConsole: parseBoolean(getArgValue(argv, "--log"), true),
    focusSeason: toText(getArgValue(argv, "--focus-season")),
    statSeason: toText(getArgValue(argv, "--stat-season")),
    pageSize: positiveInteger(
      getArgValue(argv, "--page-size"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
    maxPagesPerRole: positiveInteger(
      getArgValue(argv, "--max-pages"),
      DEFAULT_MAX_PAGES_PER_ROLE,
    ),
    currentDate,
    headless: hasFlag(argv, "--headless"),
    browserExecutablePath: resolveBrowserExecutablePath(
      getArgValue(argv, "--browser-path"),
    ),
    userDataDir:
      toText(getArgValue(argv, "--user-data-dir")) || DEFAULT_USER_DATA_DIR,
    waitForManualClearanceMs: positiveInteger(
      getArgValue(argv, "--wait-ms"),
      DEFAULT_WAIT_FOR_MANUAL_CLEARANCE_MS,
    ),
    yahooPositions: !hasFlag(argv, "--skip-yahoo-positions"),
    yahooSeasonYear: toText(getArgValue(argv, "--yahoo-season-year")),
    yahooLeagueId: toText(getArgValue(argv, "--yahoo-league-id")),
    yahooRequestDelayMs: positiveInteger(
      getArgValue(argv, "--yahoo-request-delay-ms"),
      DEFAULT_YAHOO_REQUEST_DELAY_MS,
    ),
    yahooMaxPages: positiveInteger(
      getArgValue(argv, "--yahoo-max-pages"),
      DEFAULT_YAHOO_MAX_PAGES,
    ),
    yahooBrowserFallback:
      hasFlag(argv, "--yahoo-browser-fallback") ||
      parseBoolean(process.env.YAHOO_BROWSER_FALLBACK, false),
    salarySeasonSpecs: (getArgValue(argv, "--salary-seasons") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    focusSeasonStartYear:
      seasonStartYear(getArgValue(argv, "--focus-season-year")) ?? null,
    salaryCapOverrides: parseSalaryCapOverrides(
      getArgValues(argv, "--salary-cap"),
    ),
  };
}

function log(options: PlayerBioSyncOptions, message: string): void {
  if (options.logToConsole) console.log(`[player-bio-sync] ${message}`);
}

function isChallengePage(title: string, html: string): boolean {
  return (
    /just a moment|attention required|cloudflare/i.test(title) ||
    /cf-chl-|enable javascript and cookies|challenge-platform/i.test(html)
  );
}

async function waitForSearchPage(
  page: Page,
  options: PlayerBioSyncOptions,
): Promise<string> {
  await page.goto("https://puckpedia.com/players/search", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  let title = await page.title();
  let html = await page.content();
  if (!isChallengePage(title, html)) return html;

  if (options.headless) {
    throw new Error(
      "[player-bio-sync] PuckPedia presented a Cloudflare challenge. Run once without --headless and complete it in the opened browser.",
    );
  }

  log(
    options,
    "Complete the PuckPedia browser challenge, then press Enter here.",
  );
  const prompt = readline.createInterface({ input, output });
  try {
    await Promise.race([
      prompt.question(""),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                "[player-bio-sync] Timed out waiting for browser clearance.",
              ),
            ),
          options.waitForManualClearanceMs,
        );
      }),
    ]);
  } finally {
    prompt.close();
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  title = await page.title();
  html = await page.content();
  if (isChallengePage(title, html)) {
    throw new Error(
      "[player-bio-sync] PuckPedia's browser challenge is still active.",
    );
  }
  return html;
}

function extractSeasonDefault(html: string, elementId: string): string {
  const elementIndex = html.indexOf(`id="${elementId}"`);
  if (elementIndex < 0) return "";
  const excerpt = html.slice(elementIndex, elementIndex + 3_000);
  const match = /defaultValue\s*:\s*['"](\d+)['"]/.exec(excerpt);
  return match?.[1] ?? "";
}

function resolveSeasonTokens(
  searchHtml: string,
  options: PlayerBioSyncOptions,
): { focusSeason: string; statSeason: string } {
  const focusSeason =
    options.focusSeason ||
    extractSeasonDefault(searchHtml, "focus_season") ||
    extractSeasonDefault(searchHtml, "stat_season");
  if (!focusSeason) {
    throw new Error(
      "[player-bio-sync] Could not detect PuckPedia's current season. Pass --focus-season.",
    );
  }
  const statSeason =
    options.statSeason ||
    extractSeasonDefault(searchHtml, "stat_season") ||
    focusSeason;
  return { focusSeason, statSeason };
}

export function buildPuckPediaQuery(
  role: (typeof PLAYER_ROLES)[number]["value"],
  pageNumber: number,
  options: PlayerBioSyncOptions,
): PuckPediaQuery {
  const query: PuckPediaQuery = {
    // PuckPedia's default cap-hit sort contains many ties, which can move a
    // player across page boundaries. Its internal player id is unique and
    // keeps the directory stable while we walk every page.
    sortBy: "p_id",
    sortDirection: "ASC",
    curPage: pageNumber,
    pageSize: options.pageSize,
    focus_season: options.focusSeason,
    player_role: role,
    stat_season: options.statSeason,
    bio_pos: role === "0" ? ["g"] : ["lw", "c", "rw", "d"],
    bio_shot: role === "0" ? [] : ["left", "right"],
  };

  return query;
}

async function waitForPuckPediaStore(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const alpine = (
        globalThis as unknown as {
          Alpine?: {
            store?: (name: string) => { search?: unknown } | undefined;
          };
        }
      ).Alpine;
      return Boolean(alpine?.store?.("puck")?.search);
    },
    { timeout: 30_000 },
  );
}

async function readPuckPediaFocusSeason(
  page: Page,
): Promise<{ label: string; value: string } | null> {
  return page.evaluate(() => {
    const alpine = (
      globalThis as unknown as {
        Alpine?: {
          store?: (
            name: string,
          ) =>
            | { focus_season?: { label?: unknown; value?: unknown } }
            | undefined;
        };
      }
    ).Alpine;
    const focusSeason = alpine?.store?.("puck")?.focus_season;
    if (!focusSeason) return null;
    return {
      label: String(focusSeason.label ?? ""),
      value: String(focusSeason.value ?? ""),
    };
  });
}

async function fetchPuckPediaPage(
  page: Page,
  role: (typeof PLAYER_ROLES)[number],
  pageNumber: number,
  options: PlayerBioSyncOptions,
): Promise<PuckPediaPage> {
  const query = buildPuckPediaQuery(role.value, pageNumber, options);
  const result = await page.evaluate(async (request) => {
    type PuckStore = {
      loading: boolean;
      fetchError: boolean;
      players: unknown;
      count: number;
      hasSearched: boolean;
      sortBy: string;
      sortDirection: string;
      curPage: number;
      pageSize: number;
      focus_season: { label: string; value: string };
      player_role: { label: string; value: string };
      stat_season: { label: string; value: string };
      filters_g1: Record<string, unknown>;
      filters_g2: Record<string, unknown>;
      filters_g3: Record<string, unknown>;
      filters_g4: Record<string, unknown>;
      filters_g5: Record<string, unknown>;
      filters_g6: Record<string, unknown>;
      getData: () => Promise<void>;
    };
    const alpine = (
      globalThis as unknown as {
        Alpine?: {
          store?: (name: string) => PuckStore | undefined;
        };
      }
    ).Alpine;
    const store = alpine?.store?.("puck");
    if (!store) {
      throw new Error("PuckPedia player search state is unavailable.");
    }

    store.filters_g1 = {};
    store.filters_g2 = {
      bio_pos: { value: request.bio_pos },
      bio_shot: { value: request.bio_shot },
    };
    store.filters_g3 = {};
    store.filters_g4 = {};
    store.filters_g5 = {};
    store.filters_g6 = {};
    store.sortBy = request.sortBy;
    store.sortDirection = request.sortDirection;
    store.curPage = request.curPage;
    store.pageSize = request.pageSize;
    store.focus_season = {
      label: request.focus_season,
      value: request.focus_season,
    };
    store.player_role = {
      label: request.player_role === "0" ? "Goalies" : "Skaters",
      value: request.player_role,
    };
    store.stat_season = {
      label: request.stat_season,
      value: request.stat_season,
    };
    store.hasSearched = true;
    await store.getData();

    return {
      fetchError: store.fetchError,
      rows: JSON.parse(JSON.stringify(store.players)) as unknown,
      totalRows: Number(store.count),
    };
  }, query);

  if (result.fetchError) {
    throw new Error(
      `[player-bio-sync] PuckPedia's own page loader failed for ${role.label} page ${pageNumber}.`,
    );
  }
  const rowsCandidate = Array.isArray(result.rows)
    ? result.rows
    : result.rows && typeof result.rows === "object"
      ? Object.values(result.rows)
      : [];
  const rows = rowsCandidate.filter(
    (row): row is PuckPediaRow =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
  if (!Number.isInteger(result.totalRows) || result.totalRows < 0) {
    throw new Error(
      `[player-bio-sync] PuckPedia omitted the result count for ${role.label}.`,
    );
  }
  return { rows, totalRows: result.totalRows };
}

async function fetchCompleteDirectory(
  page: Page,
  options: PlayerBioSyncOptions,
): Promise<SourceFetchSummary> {
  const summary: SourceFetchSummary = {
    pagesFetched: 0,
    skatersFetched: 0,
    goaliesFetched: 0,
    expectedSkaters: 0,
    expectedGoalies: 0,
    invalidRows: 0,
    players: [],
  };

  for (const role of PLAYER_ROLES) {
    const uniqueRows = new Map<string, PuckPediaRow>();
    let expectedRows: number | null = null;

    for (
      let pageNumber = 1;
      pageNumber <= options.maxPagesPerRole;
      pageNumber++
    ) {
      const result = await fetchPuckPediaPage(page, role, pageNumber, options);
      summary.pagesFetched += 1;
      expectedRows ??= result.totalRows;
      if (result.totalRows !== expectedRows) {
        throw new Error(
          `[player-bio-sync] PuckPedia's ${role.label} count changed during pagination (${expectedRows} to ${result.totalRows}). Retry the sync.`,
        );
      }
      let newRows = 0;
      for (const row of result.rows) {
        const sourceId = toText(row.p_id) || toText(row.nhl_id);
        if (!sourceId || uniqueRows.has(sourceId)) continue;
        uniqueRows.set(sourceId, row);
        newRows += 1;
      }
      log(
        options,
        `${role.label} page ${pageNumber}: ${result.rows.length} rows, ${newRows} new (${uniqueRows.size}/${expectedRows}).`,
      );

      if (uniqueRows.size >= expectedRows) break;
      if (result.rows.length === 0) {
        throw new Error(
          `[player-bio-sync] PuckPedia ended ${role.label} pagination at ${uniqueRows.size}/${expectedRows}.`,
        );
      }
      if (newRows === 0) {
        throw new Error(
          `[player-bio-sync] PuckPedia repeated a ${role.label} page at ${uniqueRows.size}/${expectedRows}. No database changes were made.`,
        );
      }
    }

    if (expectedRows === null || uniqueRows.size < expectedRows) {
      throw new Error(
        `[player-bio-sync] --max-pages was reached before all ${role.label} were fetched (${uniqueRows.size}/${expectedRows ?? "unknown"}). No database changes were made.`,
      );
    }

    const mapped = [...uniqueRows.values()]
      .map(mapPuckPediaPlayer)
      .filter((player): player is DirectoryPlayer => {
        if (player) return true;
        summary.invalidRows += 1;
        return false;
      });
    if (summary.invalidRows > 0) {
      throw new Error(
        `[player-bio-sync] ${summary.invalidRows} PuckPedia row(s) were missing a stable NHL id, name, or position. No database changes were made.`,
      );
    }
    const missingTeamPlayers = mapped.filter((player) => !player.teamAbbr);
    if (missingTeamPlayers.length > 0) {
      throw new Error(
        `[player-bio-sync] Could not map the NHL team for ${missingTeamPlayers
          .slice(0, 5)
          .map((player) => player.fullName)
          .join(", ")}. No database changes were made.`,
      );
    }
    summary.players.push(...mapped);
    if (role.value === "1") {
      summary.skatersFetched = mapped.length;
      summary.expectedSkaters = expectedRows;
    } else {
      summary.goaliesFetched = mapped.length;
      summary.expectedGoalies = expectedRows;
    }
  }

  return summary;
}

function salaryCandidatesForSources(
  sources: readonly SalarySeasonSource[],
  capOverrides: Readonly<Record<number, number>>,
) {
  return sources.flatMap((source) =>
    candidatesFromPuckPedia(
      source.players,
      source.seasonStartYear,
      source.seasonToken,
      capOverrides,
    ),
  );
}

function inferredNhlSeasonStartYear(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? year : year - 1;
}

export function resolveSalarySeasonRequests(
  options: PlayerBioSyncOptions,
): Array<{ seasonToken: string; seasonStartYear: number }> {
  const focusStartYear =
    options.focusSeasonStartYear ??
    inferredNhlSeasonStartYear(options.currentDate);
  const requests = new Map<
    string,
    { seasonToken: string; seasonStartYear: number }
  >();
  requests.set(options.focusSeason, {
    seasonToken: options.focusSeason,
    seasonStartYear: focusStartYear,
  });

  for (const spec of options.salarySeasonSpecs ?? []) {
    const [left, right] = spec.split("=", 2);
    let seasonToken = spec;
    let startYear: number | null = null;
    if (right) {
      startYear = seasonStartYear(left);
      seasonToken = right.trim();
    } else {
      const tokenNumber = Number(spec);
      const focusTokenNumber = Number(options.focusSeason);
      const requestedYear = seasonStartYear(spec);
      if (
        requestedYear !== null &&
        Number.isInteger(focusTokenNumber) &&
        Number(spec) >= 1900
      ) {
        startYear = requestedYear;
        seasonToken = String(focusTokenNumber + requestedYear - focusStartYear);
      } else if (
        Number.isInteger(tokenNumber) &&
        Number.isInteger(focusTokenNumber)
      ) {
        startYear = focusStartYear + tokenNumber - focusTokenNumber;
      }
    }
    if (startYear === null || !seasonToken) {
      throw new Error(
        `[player-bio-sync] Invalid salary season "${spec}". Use a start year or YEAR=PUCKPEDIA_TOKEN.`,
      );
    }
    requests.set(seasonToken, { seasonToken, seasonStartYear: startYear });
  }

  return [...requests.values()].sort(
    (left, right) => left.seasonStartYear - right.seasonStartYear,
  );
}

async function upsertPuckPediaSalaryRows(
  rows: readonly PlayerNhlSalaryWrite[],
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const years = Array.from(
    new Set(rows.map((row) => row.seasonStartYear)),
  ).sort((left, right) => left - right);
  for (const year of years) {
    const seasonRows = rows
      .filter((row) => row.seasonStartYear === year)
      .map((row) => ({ ...row }));
    const result = await upsertByCompositeKey(
      "PlayerNHLSalary",
      ["playerId", "seasonStartYear"],
      seasonRows,
      { merge: true },
    );
    inserted += result.inserted;
    updated += result.updated;
    unchanged += result.unchanged;
  }
  return { inserted, updated, unchanged };
}

async function launchBrowser(options: PlayerBioSyncOptions): Promise<Browser> {
  fs.mkdirSync(options.userDataDir, { recursive: true });
  return puppeteer.launch({
    executablePath: options.browserExecutablePath,
    headless: options.headless,
    userDataDir: options.userDataDir,
    defaultViewport: { width: 1440, height: 1024 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

async function resolveRosterSource(
  calendar: RosterCalendar,
): Promise<RosterSource> {
  if (calendar.phase === "offseasonContracts") {
    return {
      kind: "offseasonContracts",
      date: calendar.referenceDate,
      playerDays: [],
    };
  }
  if (calendar.phase === "postDraft") {
    return {
      kind: "postDraftContractsAndPicks",
      date: calendar.referenceDate,
      playerDays: [],
    };
  }

  if (calendar.phase === "signingPeriod") {
    const finalDate = await fetchLatestPlayerDayDate(
      calendar.playerDaySeasonId,
      calendar.seasonEndDate,
    );
    if (!finalDate) {
      throw new Error(
        `[player-bio-sync] No PlayerDay roster exists for completed season ${calendar.playerDaySeasonId}; GSHL roster assignments were not changed.`,
      );
    }
    const playerDays = await fetchPlayerDayDate<RosterPlayerDay>(
      calendar.playerDaySeasonId,
      finalDate,
    );
    return {
      kind: "signingPeriodFinalRoster",
      date: finalDate,
      playerDays,
    };
  }

  const todayRows = await fetchPlayerDayDate<RosterPlayerDay>(
    calendar.playerDaySeasonId,
    calendar.referenceDate,
  );
  if (todayRows.length > 0) {
    return {
      kind: "playerDayCurrent",
      date: calendar.referenceDate,
      playerDays: todayRows,
    };
  }

  const previousRows = await fetchPlayerDayDate<RosterPlayerDay>(
    calendar.playerDaySeasonId,
    calendar.previousDate,
  );
  if (previousRows.length > 0) {
    return {
      kind: "playerDayPrevious",
      date: calendar.previousDate,
      playerDays: previousRows,
    };
  }

  const latestDate = await fetchLatestPlayerDayDate(
    calendar.playerDaySeasonId,
    calendar.referenceDate,
  );
  if (!latestDate) {
    throw new Error(
      `[player-bio-sync] No PlayerDay roster exists for active season ${calendar.playerDaySeasonId}; GSHL roster assignments were not changed.`,
    );
  }
  const latestRows = await fetchPlayerDayDate<RosterPlayerDay>(
    calendar.playerDaySeasonId,
    latestDate,
  );
  return {
    kind: "playerDayLatestInSeason",
    date: latestDate,
    playerDays: latestRows,
  };
}

type YahooPositionFetch = {
  attempted: boolean;
  error: string;
  leagueId: string;
  players: ScrapedYahooPlayer[];
  result: YahooPlayerDirectoryResult;
  seasonYear: string;
};

function emptyYahooDirectoryResult(): YahooPlayerDirectoryResult {
  return {
    pagesFetched: { skater: 0, goalie: 0 },
    players: [],
    scrapedPlayers: { skater: 0, goalie: 0 },
    warnings: [],
  };
}

function resolveYahooSeasonYear(
  season: PositionSeason,
  override: string,
): string {
  if (override) return override;
  const legacyId = toText(season.legacyId);
  const numericLegacyId = Number(legacyId);
  if (Number.isInteger(numericLegacyId) && numericLegacyId > 0) {
    return String(2013 + numericLegacyId);
  }
  const nameMatch = /(\d{4})\s*-\s*(?:\d{2}|\d{4})/.exec(toText(season.name));
  if (nameMatch?.[1]) return nameMatch[1];
  const startDateMatch = /^(\d{4})-\d{2}-\d{2}/.exec(toText(season.startDate));
  return startDateMatch?.[1] ?? "";
}

async function fetchYahooPositions(
  season: PositionSeason | null,
  options: PlayerBioSyncOptions,
): Promise<YahooPositionFetch> {
  const emptyResult = emptyYahooDirectoryResult();
  if (!options.yahooPositions) {
    return {
      attempted: false,
      error: "Skipped by --skip-yahoo-positions.",
      leagueId: "",
      players: [],
      result: emptyResult,
      seasonYear: "",
    };
  }
  if (!season) {
    return {
      attempted: false,
      error: "No started GSHL season is available for Yahoo eligibility.",
      leagueId: "",
      players: [],
      result: emptyResult,
      seasonYear: "",
    };
  }

  const seasonKey = toText(season.legacyId) || season.id;
  const seasonYear = resolveYahooSeasonYear(season, options.yahooSeasonYear);
  const leagueId =
    options.yahooLeagueId ||
    resolveLeagueId(seasonKey) ||
    resolveLeagueId(season.id);
  if (!seasonYear || !leagueId) {
    return {
      attempted: false,
      error:
        "Yahoo season/league could not be resolved. Set YAHOO_LEAGUE_ID or pass --yahoo-league-id.",
      leagueId,
      players: [],
      result: emptyResult,
      seasonYear,
    };
  }

  process.env.YAHOO_BROWSER_FALLBACK = options.yahooBrowserFallback
    ? "true"
    : "false";
  process.env.YAHOO_BROWSER_PATH ??= options.browserExecutablePath;
  log(
    options,
    `fetching Yahoo positional eligibility for season ${seasonYear}, league ${leagueId}`,
  );
  try {
    const result = await fetchYahooPlayerDirectory({
      seasonYear,
      leagueId,
      maxPages: options.yahooMaxPages,
      pageSize: 25,
      requestDelayMs: options.yahooRequestDelayMs,
      logToConsole: options.logToConsole,
    });
    return {
      attempted: true,
      error: "",
      leagueId,
      players: result.players,
      result,
      seasonYear,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      options,
      `Yahoo eligibility unavailable; using PlayerDay fallback. ${message}`,
    );
    return {
      attempted: true,
      error: message,
      leagueId,
      players: [],
      result: emptyResult,
      seasonYear,
    };
  }
}

async function fetchRecentPlayerDayPositions(
  season: PositionSeason | null,
  players: readonly StoredPlayer[],
): Promise<{ error: string; rows: LatestPlayerDayPosition[] }> {
  if (!season) {
    throw new Error(
      "[player-bio-sync] No started GSHL season is available for PlayerDay positional eligibility.",
    );
  }
  const rows = await fetchLatestPlayerDayPositions<LatestPlayerDayPosition>(
    season.id,
    players.map((player) => player.id),
  );
  return { error: "", rows };
}

export async function runPlayerBioSync(
  initialOptions: PlayerBioSyncOptions,
): Promise<PlayerBioSyncSummary> {
  const browser = await launchBrowser(initialOptions);
  const page = await browser.newPage();

  try {
    const searchHtml = await waitForSearchPage(page, initialOptions);
    const seasons = resolveSeasonTokens(searchHtml, initialOptions);
    let options = { ...initialOptions, ...seasons };
    await waitForPuckPediaStore(page);
    const detectedFocusSeason = await readPuckPediaFocusSeason(page);
    const detectedFocusStartYear =
      detectedFocusSeason?.value === options.focusSeason
        ? seasonStartYear(detectedFocusSeason.label)
        : null;
    options = {
      ...options,
      focusSeasonStartYear:
        options.focusSeasonStartYear ?? detectedFocusStartYear,
    };
    log(
      options,
      `fetching NHL-contracted players for PuckPedia season ${options.focusSeason}`,
    );

    const source = await fetchCompleteDirectory(page, options);
    const salarySeasonRequests = resolveSalarySeasonRequests(options);
    const focusSalarySeason = salarySeasonRequests.find(
      (request) => request.seasonToken === options.focusSeason,
    )!;
    const salarySources: SalarySeasonSource[] = [
      {
        ...focusSalarySeason,
        players: source.players,
      },
    ];
    for (const request of salarySeasonRequests.filter(
      (candidate) => candidate.seasonToken !== options.focusSeason,
    )) {
      const { seasonToken } = request;
      log(options, `fetching PuckPedia salaries for season ${seasonToken}`);
      const salarySource = await fetchCompleteDirectory(page, {
        ...options,
        focusSeason: seasonToken,
      });
      salarySources.push({
        ...request,
        players: salarySource.players,
      });
    }
    const salaryCandidates = salaryCandidatesForSources(
      salarySources,
      options.salaryCapOverrides ?? {},
    );
    const [existingPlayers, seasonRows] = await Promise.all([
      fetchModel<StoredPlayer>("Player"),
      fetchModel<ActivitySeason & RosterSeason>("Season"),
    ]);
    const rosterCalendar = resolveRosterCalendar(
      seasonRows,
      options.currentDate,
    );
    const positionSeason = resolveMostRecentPositionSeason(
      seasonRows,
      options.currentDate,
    );
    const seasonContext = buildPlayerActivityContext({
      players: [],
      seasons: seasonRows,
      statLines: [],
      referenceDate: options.currentDate,
    });
    const activitySeasonIds = Array.from(
      new Set(
        [seasonContext.currentSeasonId, seasonContext.previousSeasonId].filter(
          Boolean,
        ),
      ),
    );
    const [
      playerNhlSeasonRows,
      contracts,
      teams,
      franchises,
      draftPicks,
      rosterSource,
      playerDayPositionFetch,
      yahooPositionFetch,
    ] = await Promise.all([
      Promise.all(
        activitySeasonIds.map((seasonId) =>
          fetchPlayerNhlSeason<ActivityStatLine>(seasonId),
        ),
      ),
      fetchModel<RosterContract>("Contract"),
      fetchModel<RosterTeam>("Team"),
      fetchModel<RosterFranchise>("Franchise"),
      fetchModel<RosterDraftPick>("DraftPick"),
      resolveRosterSource(rosterCalendar),
      fetchRecentPlayerDayPositions(positionSeason, existingPlayers),
      fetchYahooPositions(positionSeason, options),
    ]);
    const playerNhlStatLines = playerNhlSeasonRows.flat();
    const activityContext = buildPlayerActivityContext({
      players: existingPlayers,
      seasons: seasonRows,
      statLines: playerNhlStatLines,
      referenceDate: options.currentDate,
    });
    const reconciliation = reconcilePlayerDirectory(
      existingPlayers,
      source.players,
      {
        currentDate: options.currentDate,
        deactivateMissing: true,
        activityEvidenceByPlayerId: activityContext.evidenceByPlayerId,
      },
    );
    const positionReconciliation = reconcilePlayerPositions({
      players: existingPlayers,
      playerDays: playerDayPositionFetch.rows,
      yahooPlayers: yahooPositionFetch.players,
    });
    const puckPediaFallbacks = [...reconciliation.matchedPlayerIds].filter(
      (playerId) => !positionReconciliation.eligibilityByPlayerId.has(playerId),
    ).length;
    const playersOutsideCurrentSources = existingPlayers.filter(
      (player) =>
        !positionReconciliation.eligibilityByPlayerId.has(player.id) &&
        !reconciliation.matchedPlayerIds.has(player.id),
    );
    const preservedExistingPositions = playersOutsideCurrentSources.filter(
      (player) => normalizeEligiblePositions(player.nhlPos).length > 0,
    ).length;
    const missingEligibility =
      playersOutsideCurrentSources.length - preservedExistingPositions;
    for (const update of reconciliation.updates) {
      if (update.reason === "missingFromPuckPedia") continue;
      const eligibility = positionReconciliation.eligibilityByPlayerId.get(
        update.id,
      );
      if (eligibility) {
        update.data.nhlPos = eligibility.positions;
        update.data.posGroup = eligibility.posGroup;
      }
    }
    const rosterReconciliation = reconcileCurrentRoster({
      calendar: rosterCalendar,
      source: rosterSource,
      players: existingPlayers,
      seasons: seasonRows,
      contracts,
      teams,
      franchises,
      draftPicks,
    });
    if (rosterReconciliation.issues.length > 0) {
      throw new Error(
        `[player-bio-sync] ${rosterReconciliation.issues.length} GSHL roster identity issue(s) were found. No database changes were made. Samples: ${JSON.stringify(
          rosterReconciliation.issues.slice(0, 10),
        )}`,
      );
    }
    const targetRosterSeason = seasonRows.find(
      (season) => season.id === rosterCalendar.targetTeamSeasonId,
    );
    if (!targetRosterSeason) {
      throw new Error(
        `[player-bio-sync] Could not load lineup configuration for season ${rosterCalendar.targetTeamSeasonId}.`,
      );
    }
    const lineupBuilder = await getAppsScriptLineupBuilder();
    const rosterSpots = Array.isArray(targetRosterSeason.rosterSpots)
      ? targetRosterSeason.rosterSpots
      : [];
    const lineupSlots =
      lineupBuilder.buildLineupStructureFromRosterSpots?.(rosterSpots) ??
      lineupBuilder.internals?.buildLineupStructureFromRosterSpots?.(
        rosterSpots,
      );
    const playersForLineup = existingPlayers.map((player) => {
      const eligibility = positionReconciliation.eligibilityByPlayerId.get(
        player.id,
      );
      return eligibility
        ? {
            ...player,
            nhlPos: eligibility.positions,
            posGroup: eligibility.posGroup,
          }
        : player;
    });
    const lineupReconciliation = reconcileRosterLineups({
      players: playersForLineup,
      rosterAssignments: rosterReconciliation.assignments,
      findBestLineup: (players) =>
        lineupBuilder.findBestLineup(players as never, false, lineupSlots),
    });
    const now = new Date().toISOString();
    const matchedUpdates = reconciliation.updates.filter(
      (update) => update.reason !== "missingFromPuckPedia",
    );
    const missingPlayerUpdates = reconciliation.updates.filter(
      (update) => update.reason === "missingFromPuckPedia",
    );
    const updatePatches = new Map(
      reconciliation.updates.map((update) => [update.id, { ...update.data }]),
    );
    for (const update of positionReconciliation.updates) {
      updatePatches.set(update.id, {
        ...(updatePatches.get(update.id) ?? {}),
        ...update.data,
      });
    }
    for (const update of rosterReconciliation.updates) {
      updatePatches.set(update.id, {
        ...(updatePatches.get(update.id) ?? {}),
        ...update.data,
      });
    }
    for (const update of lineupReconciliation.updates) {
      updatePatches.set(update.id, {
        ...(updatePatches.get(update.id) ?? {}),
        ...update.data,
      });
    }
    const updates = [...updatePatches.entries()].map(([id, data]) => ({
      id,
      data: { ...data, updatedAt: now },
    }));
    let insertedPlayersFromYahoo = 0;
    const inserts = reconciliation.inserts.map((insert) => {
      const eligibility =
        positionReconciliation.uniqueYahooEligibilityByName.get(
          canonicalName(insert.fullName),
        );
      if (eligibility) insertedPlayersFromYahoo += 1;
      return {
        ...insert,
        ...(eligibility
          ? {
              yahooId: eligibility.yahooId,
              nhlPos: eligibility.positions,
              posGroup: eligibility.posGroup,
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      };
    });
    const unmatchedActive = reconciliation.unmatchedActivePlayers;
    const deactivationReviews = reconciliation.deactivationReviews;
    const deactivatedPlayerDetails = deactivationReviews.filter(
      (review) => review.decision === "deactivate",
    );

    const summary: PlayerBioSyncSummary = {
      dryRun: !options.apply,
      focusSeason: options.focusSeason,
      statSeason: options.statSeason,
      pagesFetched: source.pagesFetched,
      sourceRows: source.players.length,
      skatersFetched: source.skatersFetched,
      goaliesFetched: source.goaliesFetched,
      expectedSkaters: source.expectedSkaters,
      expectedGoalies: source.expectedGoalies,
      existingPlayers: existingPlayers.length,
      matchedUpdates: matchedUpdates.length,
      clearedMissingPlayers: missingPlayerUpdates.length,
      insertedPlayers: inserts.length,
      insertedPlayerDetails: reconciliation.insertReviews,
      deactivatedPlayers: reconciliation.deactivations.length,
      deactivationPolicy:
        "PuckPedia listing is NHL-contract evidence; unmatched players are deactivated only with complete current/previous season evidence and zero GP in both seasons",
      deactivationSeasonContext: {
        currentSeasonId: activityContext.currentSeasonId,
        currentSeasonYear: activityContext.currentSeasonYear,
        previousSeasonId: activityContext.previousSeasonId,
        previousSeasonYear: activityContext.previousSeasonYear,
      },
      deactivationBreakdown: {
        deactivate: deactivatedPlayerDetails.length,
        keptByCurrentSeasonGames: deactivationReviews.filter(
          (review) => review.decision === "keepCurrentSeasonGames",
        ).length,
        keptByPreviousSeasonGames: deactivationReviews.filter(
          (review) => review.decision === "keepPreviousSeasonGames",
        ).length,
        keptByIncompleteEvidence: deactivationReviews.filter(
          (review) => review.decision === "keepIncompleteEvidence",
        ).length,
      },
      deactivatedPlayerDetails,
      protectedUnmatchedPlayerSamples: deactivationReviews
        .filter((review) => review.decision !== "deactivate")
        .slice(0, 50),
      unmatchedActivePlayers: unmatchedActive.length,
      unmatchedActiveBreakdown: {
        withNhlApiId: unmatchedActive.filter((player) => player.nhlApiId)
          .length,
        withoutNhlApiId: unmatchedActive.filter((player) => !player.nhlApiId)
          .length,
        withNhlTeam: unmatchedActive.filter((player) => player.teams.length > 0)
          .length,
        withoutNhlTeam: unmatchedActive.filter(
          (player) => player.teams.length === 0,
        ).length,
        assignedToOwner: unmatchedActive.filter((player) => player.ownerId)
          .length,
        signable: unmatchedActive.filter((player) => player.isSignable).length,
        resignable: unmatchedActive.filter((player) => player.isResignable)
          .length,
      },
      unmatchedActivePlayerSamples: unmatchedActive.slice(0, 50),
      unchangedPlayers: reconciliation.unchanged,
      duplicateSourceRows: reconciliation.duplicateSourceRows,
      invalidSourceRows: source.invalidRows,
      identityIssues: reconciliation.issues.length,
      issueSamples: reconciliation.issues.slice(0, 25),
      roster: {
        source: rosterReconciliation.source,
        sourceDate: rosterReconciliation.sourceDate,
        rosterSeasonId: rosterReconciliation.rosterSeasonId,
        targetTeamSeasonId: rosterReconciliation.targetTeamSeasonId,
        rosteredPlayers: rosterReconciliation.rosteredPlayers,
        playerDayAssignments: rosterReconciliation.playerDayAssignments,
        contractAssignments: rosterReconciliation.contractAssignments,
        draftPickAssignments: rosterReconciliation.draftPickAssignments,
        updatedPlayers: rosterReconciliation.updates.length,
        assignedPlayers: rosterReconciliation.assignedPlayers,
        clearedPlayers: rosterReconciliation.clearedPlayers,
        changedOwners: rosterReconciliation.changedOwners,
        legacyTeamIdsCleared: rosterReconciliation.legacyTeamIdsCleared,
        unchangedPlayers: rosterReconciliation.unchangedPlayers,
        updateDetails: rosterReconciliation.updateReviews,
      },
      lineup: {
        ratingField: "seasonRating",
        rosteredPlayers: lineupReconciliation.rosteredPlayers,
        starters: lineupReconciliation.starters,
        benchPlayers: lineupReconciliation.benchPlayers,
        clearedUnrosteredPlayers: lineupReconciliation.clearedUnrosteredPlayers,
        updatedPlayers: lineupReconciliation.updatedPlayers,
        unchangedPlayers: lineupReconciliation.unchangedPlayers,
        teams: lineupReconciliation.teams,
        updateDetails: lineupReconciliation.updateReviews,
      },
      positionEligibility: {
        seasonId: positionSeason?.id ?? "",
        seasonYear: yahooPositionFetch.seasonYear,
        yahooLeagueId: yahooPositionFetch.leagueId,
        yahooAttempted: yahooPositionFetch.attempted,
        yahooError: yahooPositionFetch.error,
        yahooPagesFetched: yahooPositionFetch.result.pagesFetched,
        yahooRows: yahooPositionFetch.players.length,
        yahooWarnings: yahooPositionFetch.result.warnings.slice(0, 25),
        playerDayError: playerDayPositionFetch.error,
        yahooMatches: positionReconciliation.yahooMatches,
        yahooIdMatches: positionReconciliation.yahooIdMatches,
        yahooNameMatches: positionReconciliation.yahooNameMatches,
        playerDayFallbacks: positionReconciliation.playerDayFallbacks,
        puckPediaFallbacks,
        preservedExisting: preservedExistingPositions,
        missingEligibility,
        ambiguousYahooRows: positionReconciliation.ambiguousYahooRows,
        updatedPlayers: positionReconciliation.updates.length,
        insertedPlayersFromYahoo,
        updateDetails: positionReconciliation.reviews.filter(
          (review) => review.changed,
        ),
      },
      nhlSalaries: (() => {
        const salaryReconciliation = reconcileSalaryCandidates(
          salaryCandidates,
          existingPlayers,
          options.salaryCapOverrides ?? {},
        );
        return {
          seasons: salarySeasonRequests.map((request) =>
            seasonLabel(request.seasonStartYear),
          ),
          sourceRows: salaryCandidates.length,
          readyRows: salaryReconciliation.rows.length,
          unmatchedRows: salaryReconciliation.unmatched.length,
          ambiguousRows: salaryReconciliation.ambiguous.length,
          duplicateRows: salaryReconciliation.duplicateRows,
          missingCapRows: salaryReconciliation.rows.filter(
            (row) => row.salaryCap === null,
          ).length,
        };
      })(),
    };

    if (!options.apply) return summary;

    summary.appliedUpdates = await updateRowsById("Player", updates);
    const insertResult = inserts.length
      ? await upsertByCompositeKey("Player", ["legacyId"], inserts, {
          merge: true,
        })
      : { inserted: 0 };
    summary.appliedInserts = insertResult.inserted;
    const persistedPlayers = await fetchModel<
      StoredPlayer & StoredSalaryPlayer
    >("Player");
    const salaryReconciliation = reconcileSalaryCandidates(
      salaryCandidates,
      persistedPlayers,
      options.salaryCapOverrides ?? {},
    );
    const salaryResult = await upsertPuckPediaSalaryRows(
      salaryReconciliation.rows,
    );
    summary.nhlSalaries = {
      ...summary.nhlSalaries,
      readyRows: salaryReconciliation.rows.length,
      unmatchedRows: salaryReconciliation.unmatched.length,
      ambiguousRows: salaryReconciliation.ambiguous.length,
      duplicateRows: salaryReconciliation.duplicateRows,
      missingCapRows: salaryReconciliation.rows.filter(
        (row) => row.salaryCap === null,
      ).length,
      appliedInserted: salaryResult.inserted,
      appliedUpdated: salaryResult.updated,
      appliedUnchanged: salaryResult.unchanged,
    };
    return summary;
  } finally {
    await closeYahooBrowserSession().catch(() => undefined);
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function runPlayerBioSyncCli(argv: string[]): Promise<void> {
  if (hasFlag(argv, "--help")) {
    console.log(HELP_TEXT);
    return;
  }
  const summary = await runPlayerBioSync(parsePlayerBioSyncOptions(argv));
  console.log(JSON.stringify(summary, null, 2));
}
