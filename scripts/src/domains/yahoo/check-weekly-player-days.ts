import { randomUUID } from "node:crypto";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import {
  convertRowToModel,
  getCompositeKeyColumnsForModel,
  getPlayerDayWorkbookId,
  getWriteSpreadsheetIdForModel,
  SHEETS_CONFIG,
  type CompositeKeyModelName,
  type DatabaseRecord,
} from "@gshl-lib/sheets/config/config";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import { applyPlayerDayDerivedColumns } from "@gshl-lib/stats/player-day-flags";
import {
  getArgValue,
  hasFlag,
  parseCsvList,
  parsePositiveInteger,
  toBoolean,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import type {
  Matchup,
  Player,
  PlayerDayStatLine,
  Season,
  Team,
  TeamWeekStatLine,
  Week,
} from "@gshl-lib/types/database";
import { RosterPosition } from "@gshl-lib/types/enums";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import {
  applyYahooBrowserArgOverrides,
  buildPlayersByNormalizedName,
  buildYahooMatchupUrl,
  closeYahooBrowserSession,
  DEFAULT_REQUEST_DELAY_MS,
  fetchYahooMatchupPage,
  hasPlusMinusForSeason,
  LT_MATCHUP_TYPE,
  parseYahooMatchupTotals,
  parseYahooWeeklyMatchupPlayers,
  resolvePlayerFromYahooReference,
  type ParsedYahooMatchupTotals,
  type ParsedYahooWeeklyPlayers,
  type YahooWeeklyMatchupPlayerRow,
} from "@gshl-lib/yahoo/matchup-utils";

type PrimitiveCellValue = string | number | boolean | null;

type LoadedPlayerDayRow = {
  rowNumber: number;
  record: PlayerDayStatLine;
};

type YahooWeeklyPlayerDayCheckOptions = {
  seasonId: string;
  weekIds: string[];
  weekNums: string[];
  teamIds: string[];
  matchupIds: string[];
  requestDelayMs: number;
  requestStaggerMs: number;
  logToConsole: boolean;
  apply: boolean;
};

type DiscrepancyRecord = {
  type:
    | "missing-week"
    | "missing-team"
    | "missing-yahoo-team-id"
    | "missing-team-week-row"
    | "unsupported-yahoo-header"
    | "stat-mismatch"
    | "fetch-failure"
    | "parse-failure"
    | "unknown-yahoo-player"
    | "missing-player-day-rows"
    | "missing-yahoo-weekly-player"
    | "player-stat-mismatch"
    | "unsupported-player-field"
    | "player-apply-failure";
  seasonId: string;
  weekId?: string;
  weekNum?: string;
  matchupId?: string;
  gshlTeamId?: string;
  yahooTeamId?: string;
  side?: "home" | "away";
  playerId?: string;
  yahooId?: string;
  playerName?: string;
  field?: string;
  yahooHeader?: string;
  sheetValue?: string;
  yahooValue?: string;
  url?: string;
  details: string;
};

type GoalieDifferenceRecord = {
  scope:
    | "team-week"
    | "player-week"
    | "missing-player-day-rows"
    | "missing-yahoo-weekly-player";
  seasonId: string;
  weekId?: string;
  weekNum?: string;
  matchupId?: string;
  gshlTeamId?: string;
  yahooTeamId?: string;
  side?: "home" | "away";
  playerId?: string;
  yahooId?: string;
  playerName?: string;
  field?: string;
  yahooHeader?: string;
  sheetValue?: string;
  yahooValue?: string;
  url?: string;
  details: string;
};

type CheckSummary = {
  seasonId: string;
  apply: boolean;
  weeksChecked: number;
  matchupsChecked: number;
  teamRowsChecked: number;
  playerRowsChecked: number;
  statComparisons: number;
  discrepancies: number;
  fetchFailures: number;
  parseFailures: number;
  unsupportedHeaders: string[];
  appliedPlayerDayUpdates: number;
  appliedPlayerDayCreates: number;
  appliedTeamWeekUpdates: number;
  goaltendingDifferences: number;
  goaltendingDifferenceBreakdown: Array<{
    scope: GoalieDifferenceRecord["scope"];
    field: string;
    count: number;
  }>;
};

type CountBreakdownRow = {
  category: string;
  count: number;
};

type ResolvedYahooWeeklySide = {
  sourceSide: "home" | "away";
  yahooTeamId: string;
  totals: ParsedYahooMatchupTotals["home"];
  rows: YahooWeeklyMatchupPlayerRow[];
};

const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const PLAYER_DAY_SHEET = SHEETS_CONFIG.SHEETS.PlayerDayStatLine;
const PLAYER_DAY_COLUMNS = SHEETS_CONFIG.COLUMNS.PlayerDayStatLine;
const STARTING_DAILY_POSITIONS = new Set(["C", "LW", "RW", "D", "G", "UTIL"]);
const DEFAULT_WEEKLY_CHECK_REQUEST_STAGGER_MS = 2500;
const TEAM_WEEK_MODEL = "TeamWeekStatLine";
const TEAM_WEEK_ALLOWED_FIELDS = new Set([
  "G",
  "A",
  "P",
  "PPP",
  "PPG",
  "PPA",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "PM",
  "PIM",
]);
const GOALIE_TEAM_FIELDS = new Set(["W", "GA", "GAA", "SV", "SA", "SVP", "SO"]);
const WEEKLY_SKATER_FIELDS = ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"] as const;
const WEEKLY_GOALIE_FIELDS = ["W"] as const;
type MutablePlayerDayStatField =
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W";

const YAHOO_HEADER_TO_TEAM_WEEK_FIELD: Record<string, string> = {
  G: "G",
  A: "A",
  P: "P",
  PPP: "PPP",
  PPG: "PPG",
  PPA: "PPA",
  SOG: "SOG",
  HIT: "HIT",
  BLK: "BLK",
  W: "W",
  "GA*": "GA",
  GA: "GA",
  GAA: "GAA",
  "SV*": "SV",
  SV: "SV",
  "SA*": "SA",
  SA: "SA",
  "SV%": "SVP",
  SVP: "SVP",
  SHO: "SO",
  SO: "SO",
  "+/-": "PM",
  PIM: "PIM",
};

const HELP_TEXT = `
Usage:
  npm run yahoo:check-weekly-player-days
  npm run yahoo:check-weekly-player-days -- --season-id 12 --week-nums 1,2
  npm run yahoo:check-weekly-player-days -- --season-id 12 --matchup-ids 1871 --apply

Options:
  --season-id <id>            Optional season id. Defaults to the active season.
  --week-ids <list>           Optional comma-separated week ids.
  --week-nums <list>          Optional comma-separated week numbers.
  --team-ids <list>           Optional comma-separated team ids.
  --matchup-ids <list>        Optional comma-separated matchup ids.
  --request-delay-ms <ms>     Minimum delay between Yahoo requests. Default: 3500.
  --request-stagger-ms <ms>   Extra random pre-fetch stagger for this command. Default: 2500.
  --browser-fallback <true|false> Enable browser render fallback when Yahoo serves a JS/login shell. Default: true.
  --browser-headless <true|false> Use headless browser fallback. Default: false.
  --browser-path <path>       Optional Chrome/Edge executable path for browser fallback.
  --browser-user-data-dir <path> Persisted browser profile dir for Yahoo login/session reuse.
  --browser-wait-ms <ms>      Browser fallback wait timeout. Default: 180000.
  --browser-import-cookie <true|false> Best-effort import of YAHOO_COOKIE into the browser profile. Default: false.
  --log <true|false>          Enable or disable progress logging. Default: true.
  --apply                     Persist supported PlayerDayStatLine and TeamWeekStatLine fixes.
  --help                      Show this message and exit.
`.trim();

function log(
  options: Pick<YahooWeeklyPlayerDayCheckOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[yahoo:check-weekly-player-days] ${message}`);
  }
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyRandomRequestStagger(
  url: string,
  options: Pick<YahooWeeklyPlayerDayCheckOptions, "requestStaggerMs" | "logToConsole">,
): Promise<void> {
  if (options.requestStaggerMs <= 0) return;
  const waitMs = Math.floor(Math.random() * (options.requestStaggerMs + 1));
  if (waitMs <= 0) return;
  log(options, `Random Yahoo stagger ${waitMs}ms before fetching ${url}.`);
  await sleep(waitMs);
}

function printSection(title: string): void {
  console.log(`[yahoo:check-weekly-player-days] ${title}`);
}

function printSummary(summary: CheckSummary): void {
  printSection("Summary");
  console.log(
    `[yahoo:check-weekly-player-days] season=${summary.seasonId} apply=${summary.apply} weeks=${summary.weeksChecked} matchups=${summary.matchupsChecked} playerRows=${summary.playerRowsChecked} teamRows=${summary.teamRowsChecked} discrepancies=${summary.discrepancies} goalieDiffs=${summary.goaltendingDifferences} pdUpdates=${summary.appliedPlayerDayUpdates} pdCreates=${summary.appliedPlayerDayCreates} twUpdates=${summary.appliedTeamWeekUpdates} fetchFailures=${summary.fetchFailures} parseFailures=${summary.parseFailures}`,
  );

  if (summary.unsupportedHeaders.length > 0) {
    console.log(
      `[yahoo:check-weekly-player-days] unsupportedHeaders=${summary.unsupportedHeaders.join(", ")}`,
    );
  }
}

function buildChangePrefix(params: {
  weekNum?: string;
  matchupId?: string;
  teamId?: string;
  side?: "home" | "away";
  playerName?: string;
  playerId?: string;
}): string {
  const playerLabel =
    toTrimmedString(params.playerName) ||
    (toTrimmedString(params.playerId)
      ? `player ${toTrimmedString(params.playerId)}`
      : "(team total)");
  const parts = [
    params.weekNum ? `week ${params.weekNum}` : "",
    params.matchupId ? `matchup ${params.matchupId}` : "",
    params.teamId ? `team ${params.teamId}` : "",
    params.side ? params.side : "",
    playerLabel,
  ].filter(Boolean);
  return parts.join(" | ");
}

function formatDiscrepancyChangeLine(discrepancy: DiscrepancyRecord): string {
  const prefix = buildChangePrefix({
    weekNum: discrepancy.weekNum,
    matchupId: discrepancy.matchupId,
    teamId: discrepancy.gshlTeamId,
    side: discrepancy.side,
    playerName: discrepancy.playerName,
    playerId: discrepancy.playerId,
  });

  if (
    discrepancy.field &&
    (discrepancy.sheetValue !== undefined || discrepancy.yahooValue !== undefined)
  ) {
    const fromValue = toTrimmedString(discrepancy.sheetValue) || "(blank)";
    const toValue = toTrimmedString(discrepancy.yahooValue) || "(blank)";
    return `${prefix} | ${discrepancy.field}: ${fromValue} -> ${toValue}`;
  }

  return `${prefix} | ${discrepancy.details}`;
}

function formatGoalieChangeLine(difference: GoalieDifferenceRecord): string {
  const prefix = buildChangePrefix({
    weekNum: difference.weekNum,
    matchupId: difference.matchupId,
    teamId: difference.gshlTeamId,
    side: difference.side,
    playerName: difference.scope === "team-week" ? "(team total)" : difference.playerName,
    playerId: difference.scope === "team-week" ? "" : difference.playerId,
  });

  if (
    difference.field &&
    (difference.sheetValue !== undefined || difference.yahooValue !== undefined)
  ) {
    const fromValue = toTrimmedString(difference.sheetValue) || "(blank)";
    const toValue = toTrimmedString(difference.yahooValue) || "(blank)";
    return `${prefix} | ${difference.field}: ${fromValue} -> ${toValue}`;
  }

  return `${prefix} | ${difference.details}`;
}

function printRequiredChanges(
  discrepancies: DiscrepancyRecord[],
  goalieDifferences: GoalieDifferenceRecord[],
): void {
  const lines = [
    ...discrepancies.map(formatDiscrepancyChangeLine),
    ...goalieDifferences.map(formatGoalieChangeLine),
  ];
  if (lines.length === 0) return;

  printSection("Required Changes");
  for (const line of lines) {
    console.log(`[yahoo:check-weekly-player-days] ${line}`);
  }
}

function normalizeDateKey(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? toTrimmedString(value);
}

function alignRowsToConfiguredColumns(
  rawRows: PrimitiveCellValue[][],
  columns: readonly string[],
): PrimitiveCellValue[][] {
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  if (!header.length) {
    return dataRows.map((row) => columns.map((_, index) => row[index] ?? null));
  }

  const headerIndex = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = String(cell ?? "").trim();
    if (key) {
      headerIndex.set(key, index);
    }
  });

  return dataRows.map((row) =>
    columns.map((column) => {
      const index = headerIndex.get(column);
      return index === undefined ? null : (row[index] ?? null);
    }),
  );
}

async function loadPlayerDayRowsWithNumbers(
  seasonId: string,
): Promise<LoadedPlayerDayRow[]> {
  const spreadsheetId = getPlayerDayWorkbookId(seasonId);
  const rawRows = await optimizedSheetsClient.getValues(
    spreadsheetId,
    `${PLAYER_DAY_SHEET}!A1:ZZ`,
  );
  const alignedRows = alignRowsToConfiguredColumns(rawRows, PLAYER_DAY_COLUMNS);
  return alignedRows
    .map((row, index) => ({
      rowNumber: index + 2,
      record: (() => {
        const record = convertRowToModel<DatabaseRecord>(
          row,
          PLAYER_DAY_COLUMNS,
        ) as unknown as PlayerDayStatLine;
        return {
          ...record,
          date: normalizeDateKey(record.date),
        };
      })(),
    }))
    .filter(({ record }) => toTrimmedString(record.seasonId) === seasonId);
}

function parseOptions(args: string[]): YahooWeeklyPlayerDayCheckOptions {
  return {
    seasonId: toTrimmedString(getArgValue(args, "--season-id")),
    weekIds: parseCsvList(getArgValue(args, "--week-ids")),
    weekNums: parseCsvList(getArgValue(args, "--week-nums")),
    teamIds: parseCsvList(getArgValue(args, "--team-ids")),
    matchupIds: parseCsvList(getArgValue(args, "--matchup-ids")),
    requestDelayMs: parsePositiveInteger(
      getArgValue(args, "--request-delay-ms"),
      parsePositiveInteger(
        process.env.YAHOO_REQUEST_DELAY_MS,
        DEFAULT_REQUEST_DELAY_MS,
      ),
    ),
    requestStaggerMs: parseNonNegativeInteger(
      getArgValue(args, "--request-stagger-ms"),
      parseNonNegativeInteger(
        process.env.YAHOO_WEEKLY_CHECK_REQUEST_STAGGER_MS,
        DEFAULT_WEEKLY_CHECK_REQUEST_STAGGER_MS,
      ),
    ),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    apply: hasFlag(args, "--apply"),
  };
}

function resolveActiveSeasonId(seasons: Season[]): string {
  const activeSeason = seasons.find(
    (season) => String(season.isActive).toLowerCase() === "true",
  );
  if (activeSeason) {
    return toTrimmedString(activeSeason.id);
  }

  const sorted = seasons
    .slice()
    .sort((left, right) => Number(right.year) - Number(left.year));
  return toTrimmedString(sorted[0]?.id);
}

function buildTeamWeekKey(weekId: string, gshlTeamId: string): string {
  return `${weekId}|${gshlTeamId}`;
}

function buildPlayerWeekKey(
  weekId: string,
  gshlTeamId: string,
  playerId: string,
): string {
  return `${weekId}|${gshlTeamId}|${playerId}`;
}

function resolveTargetWeeks(
  seasonId: string,
  weeks: Week[],
  options: Pick<YahooWeeklyPlayerDayCheckOptions, "weekIds" | "weekNums">,
): Week[] {
  const seasonWeeks = weeks.filter(
    (week) => toTrimmedString(week.seasonId) === seasonId,
  );
  if (options.weekIds.length > 0) {
    const wanted = new Set(options.weekIds);
    return seasonWeeks.filter((week) => wanted.has(toTrimmedString(week.id)));
  }
  if (options.weekNums.length > 0) {
    const wanted = new Set(options.weekNums);
    return seasonWeeks.filter((week) => wanted.has(toTrimmedString(week.weekNum)));
  }
  return seasonWeeks;
}

function parseYahooNumeric(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const safe =
    normalized.startsWith(".") || normalized.startsWith("-.")
      ? normalized.replace(/^(-?)\./, "$10.")
      : normalized;
  const numeric = Number(safe);
  return Number.isFinite(numeric) ? numeric : null;
}

function getDecimalPlaces(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  const decimalIndex = normalized.indexOf(".");
  return decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
}

function formatNumberForDisplay(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/^(-?)0\./, "$1.");
}

function compareStatValues(
  fieldName: string,
  sheetValue: unknown,
  yahooValue: string,
): {
  matches: boolean;
  sheetDisplay: string;
  yahooDisplay: string;
} {
  const yahooDisplay = yahooValue.trim() === "-" ? "" : yahooValue.trim();
  const yahooNumeric = parseYahooNumeric(yahooDisplay);
  const sheetNumeric = Number(sheetValue);

  if (!yahooDisplay) {
    const sheetDisplay = toTrimmedString(sheetValue);
    return {
      matches:
        sheetDisplay === "" ||
        (Number.isFinite(sheetNumeric) && Math.abs(sheetNumeric) < 1e-9),
      sheetDisplay,
      yahooDisplay,
    };
  }

  if (yahooNumeric !== null && Number.isFinite(sheetNumeric)) {
    const decimals = getDecimalPlaces(yahooDisplay);
    const roundedSheet = Number(sheetNumeric.toFixed(decimals));
    const epsilon =
      fieldName === "GAA"
        ? 0.01
        : fieldName === "SVP"
          ? 0.001
          : 1 / 10 ** Math.max(decimals + 2, 6);
    return {
      matches: Math.abs(roundedSheet - yahooNumeric) <= epsilon,
      sheetDisplay: formatNumberForDisplay(roundedSheet, decimals),
      yahooDisplay,
    };
  }

  return {
    matches: toTrimmedString(sheetValue) === yahooDisplay,
    sheetDisplay: toTrimmedString(sheetValue),
    yahooDisplay,
  };
}

function resolveYahooWeeklySides(params: {
  expectedHomeYahooTeamId: string;
  expectedAwayYahooTeamId: string;
  teamTotals: ParsedYahooMatchupTotals;
  weeklyPlayers: ParsedYahooWeeklyPlayers;
}): {
  home: ResolvedYahooWeeklySide;
  away: ResolvedYahooWeeklySide;
  mode: "direct" | "swapped" | "fallback";
} {
  const {
    expectedHomeYahooTeamId,
    expectedAwayYahooTeamId,
    teamTotals,
    weeklyPlayers,
  } = params;

  const pageHomeId = toTrimmedString(teamTotals.home.yahooTeamId);
  const pageAwayId = toTrimmedString(teamTotals.away.yahooTeamId);
  const directEvidence =
    (pageHomeId && pageHomeId === expectedHomeYahooTeamId) ||
    (pageAwayId && pageAwayId === expectedAwayYahooTeamId);
  const swappedEvidence =
    (pageHomeId && pageHomeId === expectedAwayYahooTeamId) ||
    (pageAwayId && pageAwayId === expectedHomeYahooTeamId);

  const useSwapped =
    pageHomeId === expectedAwayYahooTeamId &&
    pageAwayId === expectedHomeYahooTeamId
      ? true
      : swappedEvidence && !directEvidence;
  const mode: "direct" | "swapped" | "fallback" = useSwapped
    ? "swapped"
    : directEvidence || (!swappedEvidence && !directEvidence)
      ? directEvidence
        ? "direct"
        : "fallback"
      : "fallback";

  if (useSwapped) {
    return {
      mode,
      home: {
        sourceSide: "away",
        yahooTeamId: pageAwayId,
        totals: teamTotals.away,
        rows: [...weeklyPlayers.away.skaters, ...weeklyPlayers.away.goalies],
      },
      away: {
        sourceSide: "home",
        yahooTeamId: pageHomeId,
        totals: teamTotals.home,
        rows: [...weeklyPlayers.home.skaters, ...weeklyPlayers.home.goalies],
      },
    };
  }

  return {
    mode,
    home: {
      sourceSide: "home",
      yahooTeamId: pageHomeId,
      totals: teamTotals.home,
      rows: [...weeklyPlayers.home.skaters, ...weeklyPlayers.home.goalies],
    },
    away: {
      sourceSide: "away",
      yahooTeamId: pageAwayId,
      totals: teamTotals.away,
      rows: [...weeklyPlayers.away.skaters, ...weeklyPlayers.away.goalies],
    },
  };
}

function getSupportedPlayerFields(
  row: YahooWeeklyMatchupPlayerRow,
  hasPM: boolean,
): string[] {
  if (row.posGroup === "goalie") {
    return WEEKLY_GOALIE_FIELDS.slice();
  }
  return hasPM ? [...WEEKLY_SKATER_FIELDS, "PM"] : WEEKLY_SKATER_FIELDS.slice();
}

function isGoalieTeamField(field: string): boolean {
  return GOALIE_TEAM_FIELDS.has(field);
}

function isGoaliePlayer(player: Player | undefined): boolean {
  return toTrimmedString(player?.posGroup) === "G";
}

function shouldCountPlayerDayRow(row: PlayerDayStatLine): boolean {
  return (
    toTrimmedString(row.GP) === "1" && toTrimmedString(row.GS) === "1"
  );
}

function getAdjustmentCandidateRows(
  rows: PlayerDayStatLine[],
): PlayerDayStatLine[] {
  return rows.filter((row) => shouldCountPlayerDayRow(row));
}

function sumPlayerDayField(rows: PlayerDayStatLine[], field: string): number {
  return rows.reduce((sum, row) => {
    if (!shouldCountPlayerDayRow(row)) {
      return sum;
    }

    if (field === "P") {
      return sum + (Number(row.G) || 0) + (Number(row.A) || 0);
    }

    return sum + (Number(row[field as keyof PlayerDayStatLine]) || 0);
  }, 0);
}

function getMutablePlayerDayRow(
  row: LoadedPlayerDayRow,
  updatesByRowNumber: Map<number, PlayerDayStatLine>,
): PlayerDayStatLine {
  const existing = updatesByRowNumber.get(row.rowNumber);
  if (existing) return existing;
  const clone = { ...row.record };
  updatesByRowNumber.set(row.rowNumber, clone);
  return clone;
}

function getCurrentPlayerDayRow(
  row: LoadedPlayerDayRow,
  updatesByRowNumber: Map<number, PlayerDayStatLine>,
): PlayerDayStatLine {
  return updatesByRowNumber.get(row.rowNumber) ?? row.record;
}

function getMutablePlayerDayStatValue(
  row: PlayerDayStatLine,
  field: MutablePlayerDayStatField,
): string {
  return row[field];
}

function setMutablePlayerDayStatValue(
  row: PlayerDayStatLine,
  field: MutablePlayerDayStatField,
  value: string,
): void {
  row[field] = value;
}

function distributePositiveDelta(
  rows: PlayerDayStatLine[],
  field: MutablePlayerDayStatField,
  delta: number,
) : boolean {
  const candidateRows = getAdjustmentCandidateRows(rows);
  if (!candidateRows.length) {
    return false;
  }
  const orderedRows = candidateRows
    .slice()
    .sort((left, right) => {
      const leftValue = Number(getMutablePlayerDayStatValue(left, field)) || 0;
      const rightValue = Number(getMutablePlayerDayStatValue(right, field)) || 0;
      const leftHasFieldValue = leftValue !== 0 ? 1 : 0;
      const rightHasFieldValue = rightValue !== 0 ? 1 : 0;
      if (rightHasFieldValue !== leftHasFieldValue) {
        return rightHasFieldValue - leftHasFieldValue;
      }
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }
      return normalizeDateKey(left.date).localeCompare(
        normalizeDateKey(right.date),
      );
    });
  let remaining = delta;
  let index = 0;
  while (remaining > 0 && orderedRows.length > 0) {
    const row = orderedRows[index % orderedRows.length]!;
    const current = Number(getMutablePlayerDayStatValue(row, field)) || 0;
    setMutablePlayerDayStatValue(row, field, String(current + 1));
    remaining -= 1;
    index += 1;
  }
  return true;
}

function distributeNegativeDelta(
  rows: PlayerDayStatLine[],
  field: MutablePlayerDayStatField,
  delta: number,
): boolean {
  const allowNegativeValues = field === "PM";
  const candidateRows = getAdjustmentCandidateRows(rows);
  if (!candidateRows.length) {
    return false;
  }
  let remaining = Math.abs(delta);
  while (remaining > 0) {
    const candidates = candidateRows
      .map((row) => ({
        row,
        value: Number(getMutablePlayerDayStatValue(row, field)) || 0,
      }))
      .filter((entry) => allowNegativeValues || entry.value > 0)
      .sort((left, right) => {
        if (right.value !== left.value) return right.value - left.value;
        return normalizeDateKey(right.row.date).localeCompare(normalizeDateKey(left.row.date));
      });
    if (!candidates.length) {
      return false;
    }
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      setMutablePlayerDayStatValue(candidate.row, field, String(candidate.value - 1));
      remaining -= 1;
    }
  }
  return true;
}

function resolveSyntheticDailyPos(player: Player): PlayerDayStatLine["dailyPos"] {
  if (toTrimmedString(player.posGroup) === "G") return RosterPosition.G;
  const positions = Array.isArray(player.nhlPos) ? player.nhlPos.map(String) : [];
  for (const candidate of [
    RosterPosition.C,
    RosterPosition.LW,
    RosterPosition.RW,
    RosterPosition.D,
  ]) {
    if (positions.includes(candidate)) {
      return candidate;
    }
  }
  return RosterPosition.Util;
}

function isStartingDailyPosition(
  dailyPos: PlayerDayStatLine["dailyPos"],
): boolean {
  return STARTING_DAILY_POSITIONS.has(toTrimmedString(dailyPos).toUpperCase());
}

function computeSyntheticGpAndGs(
  player: Player,
  row: YahooWeeklyMatchupPlayerRow,
  hasPM: boolean,
): Pick<PlayerDayStatLine, "GP" | "GS" | "dailyPos"> {
  const supportedFields = getSupportedPlayerFields(row, hasPM);
  const hasStats = supportedFields.some((field) => toTrimmedString(row[field as keyof YahooWeeklyMatchupPlayerRow]));
  const dailyPos = resolveSyntheticDailyPos(player);
  const gp = hasStats ? "1" : "";
  return {
    GP: gp,
    GS: gp === "1" && isStartingDailyPosition(dailyPos) ? "1" : "",
    dailyPos,
  };
}

function buildSyntheticPlayerDayRow(params: {
  seasonId: string;
  week: Week;
  teamId: string;
  player: Player;
  yahooRow: YahooWeeklyMatchupPlayerRow;
  hasPM: boolean;
}): PlayerDayStatLine {
  const { seasonId, week, teamId, player, yahooRow, hasPM } = params;
  const now = new Date();
  const synthetic = computeSyntheticGpAndGs(player, yahooRow, hasPM);
  return {
    id: randomUUID(),
    seasonId,
    gshlTeamId: teamId,
    playerId: toTrimmedString(player.id),
    weekId: toTrimmedString(week.id),
    date: normalizeDateKey(week.endDate),
    nhlPos: Array.isArray(player.nhlPos) ? player.nhlPos : [],
    posGroup: player.posGroup,
    nhlTeam: toTrimmedString(player.nhlTeam),
    dailyPos: synthetic.dailyPos,
    bestPos: "" as PlayerDayStatLine["bestPos"],
    fullPos: "" as PlayerDayStatLine["fullPos"],
    opp: "",
    score: "",
    GP: synthetic.GP,
    MG: "",
    IR: "",
    IRplus: "",
    GS: synthetic.GS,
    G: yahooRow.G,
    A: yahooRow.A,
    P: yahooRow.P,
    PM: yahooRow.PM,
    PIM: "",
    PPP: yahooRow.PPP,
    SOG: yahooRow.SOG,
    HIT: yahooRow.HIT,
    BLK: yahooRow.BLK,
    W: yahooRow.W,
    GA: "",
    GAA: "",
    SV: "",
    SA: "",
    SVP: "",
    SO: "",
    TOI: "",
    Rating: "",
    ADD: "",
    MS: "",
    BS: "",
    createdAt: now,
    updatedAt: now,
  };
}

async function applyPlayerDayWrites(params: {
  seasonId: string;
  existingRows: LoadedPlayerDayRow[];
  updatesByRowNumber: Map<number, PlayerDayStatLine>;
  creates: PlayerDayStatLine[];
}): Promise<{ updated: number; created: number }> {
  const spreadsheetId = getPlayerDayWorkbookId(params.seasonId);
  const rowsToWrite = [
    ...Array.from(params.updatesByRowNumber.values()),
    ...params.creates,
  ] as unknown as DatabaseRecord[];
  if (!rowsToWrite.length) {
    return { updated: 0, created: 0 };
  }

  applyPlayerDayDerivedColumns(
    rowsToWrite,
    params.existingRows.map((row) => row.record as unknown as DatabaseRecord),
  );
  await rankRowsWithAppsScriptEngine(rowsToWrite, {
    sheetName: PLAYER_DAY_MODEL,
    outputField: "Rating",
    mutate: true,
  });
  for (const row of rowsToWrite) {
    row.Rating =
      row.Rating === "" || row.Rating === null || row.Rating === undefined
        ? 0
        : row.Rating;
  }

  await minimalSheetsWriter.upsertByCompositeKey(
    PLAYER_DAY_MODEL,
    getCompositeKeyColumnsForModel(PLAYER_DAY_MODEL as CompositeKeyModelName),
    rowsToWrite,
    {
      merge: true,
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
      spreadsheetId,
    },
  );
  fastSheetsReader.clearCache(PLAYER_DAY_MODEL);
  return {
    updated: params.updatesByRowNumber.size,
    created: params.creates.length,
  };
}

async function applyTeamWeekWrites(
  updates: TeamWeekStatLine[],
): Promise<number> {
  if (!updates.length) return 0;
  await minimalSheetsWriter.upsertByCompositeKey(
    TEAM_WEEK_MODEL,
    getCompositeKeyColumnsForModel(TEAM_WEEK_MODEL as CompositeKeyModelName),
    updates as unknown as DatabaseRecord[],
    {
      merge: true,
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
      spreadsheetId: getWriteSpreadsheetIdForModel(TEAM_WEEK_MODEL),
    },
  );
  fastSheetsReader.clearCache(TEAM_WEEK_MODEL);
  return updates.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--help")) {
      console.log(HELP_TEXT);
      return;
    }

    process.env.USE_GOOGLE_SHEETS ??= "true";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??= "credentials.json";

    applyYahooBrowserArgOverrides(args);
    const optionsInput = parseOptions(args);
    const [seasons, weeks, teams, matchups, teamWeekRows, players] =
      (await Promise.all([
        fastSheetsReader.fetchModel("Season"),
        fastSheetsReader.fetchModel("Week"),
        fastSheetsReader.fetchModel("Team"),
        fastSheetsReader.fetchModel("Matchup"),
        fastSheetsReader.fetchModel("TeamWeekStatLine"),
        fastSheetsReader.fetchModel("Player"),
      ])) as unknown as [
        Season[],
      Week[],
      Team[],
      Matchup[],
      TeamWeekStatLine[],
      Player[],
      ];

  const seasonId = optionsInput.seasonId || resolveActiveSeasonId(seasons);
  const options: YahooWeeklyPlayerDayCheckOptions = {
    ...optionsInput,
    seasonId,
  };
  const season = seasons.find(
    (entry) => toTrimmedString(entry.id) === options.seasonId,
  );
  if (!season) {
    throw new Error(
      `[yahoo:check-weekly-player-days] Season ${options.seasonId} was not found.`,
    );
  }

  const targetWeeks = resolveTargetWeeks(options.seasonId, weeks, options);
  if (!targetWeeks.length) {
    throw new Error(
      `[yahoo:check-weekly-player-days] No weeks matched the requested filters for season ${options.seasonId}.`,
    );
  }

  const targetWeekIds = new Set(targetWeeks.map((week) => toTrimmedString(week.id)));
  const requestedTeamIds = new Set(options.teamIds);
  const requestedMatchupIds = new Set(options.matchupIds);
  const targetMatchups = matchups.filter((matchup) => {
    if (toTrimmedString(matchup.seasonId) !== options.seasonId) return false;
    if (!targetWeekIds.has(toTrimmedString(matchup.weekId))) return false;
    if (toTrimmedString(matchup.gameType) === LT_MATCHUP_TYPE) return false;
    if (
      requestedMatchupIds.size > 0 &&
      !requestedMatchupIds.has(toTrimmedString(matchup.id))
    ) {
      return false;
    }
    if (!requestedTeamIds.size) return true;
    return (
      requestedTeamIds.has(toTrimmedString(matchup.homeTeamId)) ||
      requestedTeamIds.has(toTrimmedString(matchup.awayTeamId))
    );
  });

  if (!targetMatchups.length) {
    throw new Error(
      `[yahoo:check-weekly-player-days] No matchups matched the requested filters for season ${options.seasonId}.`,
    );
  }

  const playerDayRows = await loadPlayerDayRowsWithNumbers(options.seasonId);
  const weekById = new Map(
    targetWeeks.map((week) => [toTrimmedString(week.id), week] as const),
  );
  const teamById = new Map(
    teams
      .filter((team) => toTrimmedString(team.seasonId) === options.seasonId)
      .map((team) => [toTrimmedString(team.id), team] as const),
  );
  const teamWeekByKey = new Map(
    teamWeekRows
      .filter((row) => toTrimmedString(row.seasonId) === options.seasonId)
      .map(
        (row) =>
          [
            buildTeamWeekKey(
              toTrimmedString(row.weekId),
              toTrimmedString(row.gshlTeamId),
            ),
            row,
          ] as const,
      ),
  );
  const playersById = new Map(
    players.map((player) => [toTrimmedString(player.id), player] as const),
  );
  const playersByYahooId = new Map<string, Player>();
  for (const player of players) {
    const yahooId = toTrimmedString(player.yahooId);
    if (yahooId) {
      playersByYahooId.set(yahooId, player);
    }
  }
  const playersByNormalizedName = buildPlayersByNormalizedName(players);
  const playerDaysByWeekTeamPlayer = new Map<string, LoadedPlayerDayRow[]>();
  for (const row of playerDayRows) {
    const weekId = toTrimmedString(row.record.weekId);
    if (!targetWeekIds.has(weekId)) continue;
    const key = buildPlayerWeekKey(
      weekId,
      toTrimmedString(row.record.gshlTeamId),
      toTrimmedString(row.record.playerId),
    );
    const list = playerDaysByWeekTeamPlayer.get(key) ?? [];
    list.push(row);
    playerDaysByWeekTeamPlayer.set(key, list);
  }

  const discrepancies: DiscrepancyRecord[] = [];
  const goalieDifferences: GoalieDifferenceRecord[] = [];
  const unsupportedHeaders = new Set<string>();
  const pendingPlayerDayUpdates = new Map<number, PlayerDayStatLine>();
  const pendingPlayerDayCreates = new Map<string, PlayerDayStatLine>();
  const pendingTeamWeekUpdates = new Map<string, TeamWeekStatLine>();
  let teamRowsChecked = 0;
  let playerRowsChecked = 0;
  let statComparisons = 0;
  let fetchFailures = 0;
  let parseFailures = 0;

  const recordDiscrepancy = (discrepancy: DiscrepancyRecord): void => {
    discrepancies.push(discrepancy);
    log(options, formatDiscrepancyChangeLine(discrepancy));
  };
  const recordGoalieDifference = (difference: GoalieDifferenceRecord): void => {
    goalieDifferences.push(difference);
    log(options, formatGoalieChangeLine(difference));
  };

  for (const matchup of targetMatchups) {
    const matchupId = toTrimmedString(matchup.id);
    const weekId = toTrimmedString(matchup.weekId);
    const week = weekById.get(weekId);
    if (!week) {
      recordDiscrepancy({
        type: "missing-week",
        seasonId: options.seasonId,
        weekId,
        matchupId,
        details: `Week ${weekId} was not found for matchup ${matchupId}.`,
      });
      continue;
    }

    const homeTeamId = toTrimmedString(matchup.homeTeamId);
    const awayTeamId = toTrimmedString(matchup.awayTeamId);
    const homeTeam = teamById.get(homeTeamId);
    const awayTeam = teamById.get(awayTeamId);
    if (!homeTeam || !awayTeam) {
      recordDiscrepancy({
        type: "missing-team",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        details: `Could not find both teams for matchup ${matchupId}. home=${homeTeamId} away=${awayTeamId}`,
      });
      continue;
    }

    const homeYahooTeamId = toTrimmedString(homeTeam.yahooId);
    const awayYahooTeamId = toTrimmedString(awayTeam.yahooId);
    if (!homeYahooTeamId || !awayYahooTeamId) {
      recordDiscrepancy({
        type: "missing-yahoo-team-id",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        details: `Could not resolve Yahoo team ids for matchup ${matchupId}. home=${homeYahooTeamId || "(missing)"} away=${awayYahooTeamId || "(missing)"}`,
      });
      continue;
    }

    const url = buildYahooMatchupUrl({
      season,
      seasonId: options.seasonId,
      yahooWeekNum: toTrimmedString(week.weekNum),
      homeYahooTeamId: homeYahooTeamId,
      awayYahooTeamId: awayYahooTeamId,
    });
    const hasPM = hasPlusMinusForSeason(options.seasonId);

    let html: string;
    try {
      await applyRandomRequestStagger(url, options);
      html = await fetchYahooMatchupPage(url, options.requestDelayMs);
    } catch (error) {
      fetchFailures += 1;
      recordDiscrepancy({
        type: "fetch-failure",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        url,
        details: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    let teamTotals;
    let weeklyPlayers;
    try {
      teamTotals = parseYahooMatchupTotals(html);
      weeklyPlayers = parseYahooWeeklyMatchupPlayers(html, hasPM);
    } catch (error) {
      parseFailures += 1;
      recordDiscrepancy({
        type: "parse-failure",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        url,
        details: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const resolvedSides = resolveYahooWeeklySides({
      expectedHomeYahooTeamId: homeYahooTeamId,
      expectedAwayYahooTeamId: awayYahooTeamId,
      teamTotals,
      weeklyPlayers,
    });
    if (resolvedSides.mode === "swapped") {
      log(
        options,
        `Resolved Yahoo matchup ${matchupId} with swapped page sides. Expected home=${homeYahooTeamId} away=${awayYahooTeamId}; page home=${toTrimmedString(teamTotals.home.yahooTeamId) || "(missing)"} away=${toTrimmedString(teamTotals.away.yahooTeamId) || "(missing)"}.`,
      );
    } else if (resolvedSides.mode === "fallback") {
      log(
        options,
        `Could not confidently map Yahoo page sides by team id for matchup ${matchupId}. Falling back to page home/away order. Expected home=${homeYahooTeamId} away=${awayYahooTeamId}; page home=${toTrimmedString(teamTotals.home.yahooTeamId) || "(missing)"} away=${toTrimmedString(teamTotals.away.yahooTeamId) || "(missing)"}.`,
      );
    }

    for (const [side, teamId, yahooTeamId, yahooStats] of [
      [
        "home",
        homeTeamId,
        resolvedSides.home.yahooTeamId || homeYahooTeamId,
        resolvedSides.home.totals,
      ] as const,
      [
        "away",
        awayTeamId,
        resolvedSides.away.yahooTeamId || awayYahooTeamId,
        resolvedSides.away.totals,
      ] as const,
    ]) {
      const teamWeekKey = buildTeamWeekKey(weekId, teamId);
      const teamWeek = pendingTeamWeekUpdates.get(teamWeekKey) ??
        teamWeekByKey.get(teamWeekKey);
      if (!teamWeek) {
        recordDiscrepancy({
          type: "missing-team-week-row",
          seasonId: options.seasonId,
          weekId,
          weekNum: toTrimmedString(week.weekNum),
          matchupId,
          gshlTeamId: teamId,
          yahooTeamId,
          side,
          url,
          details: `No TeamWeekStatLine row found for team ${teamId} week ${weekId}.`,
        });
        continue;
      }

      teamRowsChecked += 1;
      let mutableTeamWeek = teamWeek;
      for (const [yahooHeader, yahooValue] of Object.entries(yahooStats.stats)) {
        const sheetField = YAHOO_HEADER_TO_TEAM_WEEK_FIELD[yahooHeader];
        if (!sheetField || !TEAM_WEEK_ALLOWED_FIELDS.has(sheetField)) {
          if (!unsupportedHeaders.has(yahooHeader)) {
            unsupportedHeaders.add(yahooHeader);
            recordDiscrepancy({
              type: "unsupported-yahoo-header",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              yahooHeader,
              url,
              details: `Yahoo header ${yahooHeader} is not mapped to a supported TeamWeekStatLine field and was skipped.`,
            });
          }
          continue;
        }
        if (!(sheetField in mutableTeamWeek)) {
          if (!unsupportedHeaders.has(yahooHeader)) {
            unsupportedHeaders.add(yahooHeader);
            recordDiscrepancy({
              type: "unsupported-yahoo-header",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              yahooHeader,
              field: sheetField,
              url,
              details: `Mapped field ${sheetField} does not exist on TeamWeekStatLine and was skipped.`,
            });
          }
          continue;
        }

        statComparisons += 1;
        const comparison = compareStatValues(
          sheetField,
          mutableTeamWeek[sheetField as keyof TeamWeekStatLine],
          yahooValue,
        );
        if (!comparison.matches) {
          if (isGoalieTeamField(sheetField)) {
            recordGoalieDifference({
              scope: "team-week",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              field: sheetField,
              yahooHeader,
              sheetValue: comparison.sheetDisplay,
              yahooValue: comparison.yahooDisplay,
              url,
              details: `${side} team ${teamId} goalie field ${sheetField} differs. TeamWeekStatLine=${comparison.sheetDisplay} Yahoo=${comparison.yahooDisplay}`,
            });
            continue;
          }

          recordDiscrepancy({
            type: "stat-mismatch",
            seasonId: options.seasonId,
            weekId,
            weekNum: toTrimmedString(week.weekNum),
            matchupId,
            gshlTeamId: teamId,
            yahooTeamId,
            side,
            field: sheetField,
            yahooHeader,
            sheetValue: comparison.sheetDisplay,
            yahooValue: comparison.yahooDisplay,
            url,
            details: `${side} team ${teamId} field ${sheetField} differs. TeamWeekStatLine=${comparison.sheetDisplay} Yahoo=${comparison.yahooDisplay}`,
          });

          if (options.apply) {
            mutableTeamWeek = {
              ...mutableTeamWeek,
              [sheetField]: yahooValue,
              updatedAt: new Date(),
            };
            pendingTeamWeekUpdates.set(teamWeekKey, mutableTeamWeek);
          }
        }
      }
    }

    for (const [side, teamId, yahooTeamId, yahooRows] of [
      [
        "home",
        homeTeamId,
        resolvedSides.home.yahooTeamId || homeYahooTeamId,
        resolvedSides.home.rows,
      ] as const,
      [
        "away",
        awayTeamId,
        resolvedSides.away.yahooTeamId || awayYahooTeamId,
        resolvedSides.away.rows,
      ] as const,
    ]) {
      const matchedPlayerWeekKeys = new Set<string>();
      for (const yahooRow of yahooRows) {
        const player = resolvePlayerFromYahooReference({
          yahooId: yahooRow.yahooId,
          playerName: yahooRow.playerName,
          playersByYahooId,
          playersByNormalizedName,
          players,
        });
        if (!player) {
          recordDiscrepancy({
            type: "unknown-yahoo-player",
            seasonId: options.seasonId,
            weekId,
            weekNum: toTrimmedString(week.weekNum),
            matchupId,
            gshlTeamId: teamId,
            yahooTeamId,
            side,
            yahooId: toTrimmedString(yahooRow.yahooId),
            playerName: yahooRow.playerName,
            url,
            details: `Could not resolve Yahoo weekly player ${yahooRow.playerName}.`,
          });
          continue;
        }

        playerRowsChecked += 1;
        const playerId = toTrimmedString(player.id);
        const playerWeekKey = buildPlayerWeekKey(weekId, teamId, playerId);
        matchedPlayerWeekKeys.add(playerWeekKey);
        let existingGroup = playerDaysByWeekTeamPlayer.get(playerWeekKey) ?? [];

        if (!existingGroup.length && options.apply && yahooRow.posGroup !== "goalie") {
          const syntheticKey = playerWeekKey;
          if (!pendingPlayerDayCreates.has(syntheticKey)) {
            const synthetic = buildSyntheticPlayerDayRow({
              seasonId: options.seasonId,
              week,
              teamId,
              player,
              yahooRow,
              hasPM,
            });
            pendingPlayerDayCreates.set(syntheticKey, synthetic);
            existingGroup = [{ rowNumber: Number.MAX_SAFE_INTEGER, record: synthetic }];
          }
        }

        if (!existingGroup.length) {
          if (yahooRow.posGroup === "goalie") {
            recordGoalieDifference({
              scope: "missing-player-day-rows",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              playerId,
              yahooId: toTrimmedString(yahooRow.yahooId),
              playerName: yahooRow.playerName,
              url,
              details: `No PlayerDayStatLine rows were found for goalie ${playerId} on team ${teamId} for week ${weekId}.`,
            });
            continue;
          }

          recordDiscrepancy({
            type: "missing-player-day-rows",
            seasonId: options.seasonId,
            weekId,
            weekNum: toTrimmedString(week.weekNum),
            matchupId,
            gshlTeamId: teamId,
            yahooTeamId,
            side,
            playerId,
            yahooId: toTrimmedString(yahooRow.yahooId),
            playerName: yahooRow.playerName,
            url,
            details: `No PlayerDayStatLine rows were found for team ${teamId}, player ${playerId}, week ${weekId}.`,
          });
          continue;
        }

        const currentRows = existingGroup.map((row) =>
          row.rowNumber === Number.MAX_SAFE_INTEGER
            ? row.record
            : getCurrentPlayerDayRow(row, pendingPlayerDayUpdates),
        );

        const supportedFields = getSupportedPlayerFields(yahooRow, hasPM);
        for (const field of supportedFields) {
          statComparisons += 1;
          const sheetTotal = sumPlayerDayField(currentRows, field);
          const yahooValue = toTrimmedString(
            yahooRow[field as keyof YahooWeeklyMatchupPlayerRow],
          );
          const comparison = compareStatValues(field, sheetTotal, yahooValue);
          if (!comparison.matches) {
            if (yahooRow.posGroup === "goalie") {
              recordGoalieDifference({
                scope: "player-week",
                seasonId: options.seasonId,
                weekId,
                weekNum: toTrimmedString(week.weekNum),
                matchupId,
                gshlTeamId: teamId,
                yahooTeamId,
                side,
                playerId,
                yahooId: toTrimmedString(yahooRow.yahooId),
                playerName: yahooRow.playerName,
                field,
                sheetValue: comparison.sheetDisplay,
                yahooValue: comparison.yahooDisplay,
                url,
                details: `Goalie ${playerId} weekly ${field} differs. PlayerDayStatLine sum=${comparison.sheetDisplay} Yahoo=${comparison.yahooDisplay}`,
              });
              continue;
            }

            recordDiscrepancy({
              type: "player-stat-mismatch",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              playerId,
              yahooId: toTrimmedString(yahooRow.yahooId),
              playerName: yahooRow.playerName,
              field,
              sheetValue: comparison.sheetDisplay,
              yahooValue: comparison.yahooDisplay,
              url,
              details: `Player ${playerId} weekly ${field} differs. PlayerDayStatLine sum=${comparison.sheetDisplay} Yahoo=${comparison.yahooDisplay}`,
            });

            if (options.apply) {
              const target = parseYahooNumeric(yahooValue);
              if (target === null || !Number.isFinite(target)) {
                recordDiscrepancy({
                  type: "player-apply-failure",
                  seasonId: options.seasonId,
                  weekId,
                  weekNum: toTrimmedString(week.weekNum),
                  matchupId,
                  gshlTeamId: teamId,
                  yahooTeamId,
                  side,
                  playerId,
                  yahooId: toTrimmedString(yahooRow.yahooId),
                  playerName: yahooRow.playerName,
                  field,
                  url,
                  details: `Could not apply field ${field} because Yahoo value ${yahooValue} is not numeric.`,
                });
                continue;
              }
              const delta = Math.round(target - sheetTotal);
              if (delta > 0) {
                const mutableRows = existingGroup.map((row) =>
                  row.rowNumber === Number.MAX_SAFE_INTEGER
                    ? row.record
                    : getMutablePlayerDayRow(row, pendingPlayerDayUpdates),
                );
                const success = distributePositiveDelta(
                  mutableRows,
                  field as MutablePlayerDayStatField,
                  delta,
                );
                if (!success) {
                  recordDiscrepancy({
                    type: "player-apply-failure",
                    seasonId: options.seasonId,
                    weekId,
                    weekNum: toTrimmedString(week.weekNum),
                    matchupId,
                    gshlTeamId: teamId,
                    yahooTeamId,
                    side,
                    playerId,
                    yahooId: toTrimmedString(yahooRow.yahooId),
                    playerName: yahooRow.playerName,
                    field,
                    url,
                    details: `Could not increase PlayerDayStatLine ${field} totals for player ${playerId} by ${delta} because no countable player-day row was available.`,
                  });
                }
              } else if (delta < 0) {
                const mutableRows = existingGroup.map((row) =>
                  row.rowNumber === Number.MAX_SAFE_INTEGER
                    ? row.record
                    : getMutablePlayerDayRow(row, pendingPlayerDayUpdates),
                );
                const success = distributeNegativeDelta(
                  mutableRows,
                  field as MutablePlayerDayStatField,
                  delta,
                );
                if (!success) {
                  recordDiscrepancy({
                    type: "player-apply-failure",
                    seasonId: options.seasonId,
                    weekId,
                    weekNum: toTrimmedString(week.weekNum),
                    matchupId,
                    gshlTeamId: teamId,
                    yahooTeamId,
                    side,
                    playerId,
                    yahooId: toTrimmedString(yahooRow.yahooId),
                    playerName: yahooRow.playerName,
                    field,
                    url,
                    details: `Could not reduce PlayerDayStatLine ${field} totals for player ${playerId} by ${Math.abs(delta)} without producing negative day values.`,
                  });
                }
              }
            }
          }
        }

        if (yahooRow.posGroup === "goalie") {
          for (const unsupportedField of ["GAA", "SVP"]) {
            if (
              toTrimmedString(
                yahooRow[unsupportedField as keyof YahooWeeklyMatchupPlayerRow],
              )
            ) {
              continue;
            }
          }
        }
      }

      for (const [playerWeekKey, existingGroup] of playerDaysByWeekTeamPlayer.entries()) {
        const [groupWeekId, groupTeamId, playerId] = playerWeekKey.split("|");
        if (groupWeekId !== weekId || groupTeamId !== teamId) continue;
        if (matchedPlayerWeekKeys.has(playerWeekKey)) continue;

        const player = playersById.get(playerId);
        if (!player) continue;
        const supportedFields = hasPlusMinusForSeason(options.seasonId)
          ? [...WEEKLY_SKATER_FIELDS, "PM"]
          : WEEKLY_SKATER_FIELDS.slice();
        const goalieFields = WEEKLY_GOALIE_FIELDS.slice();
        const fields = isGoaliePlayer(player) ? goalieFields : supportedFields;
        const currentRows = existingGroup.map((row) => row.record);
        const currentTotals = Object.fromEntries(
          fields.map((field) => [
            field,
            sumPlayerDayField(
              currentRows,
              field,
            ),
          ]),
        );
        const hasAnyTotal = Object.values(currentTotals).some((value) => Number(value) > 0);
        if (!hasAnyTotal) continue;

        if (isGoaliePlayer(player)) {
          recordGoalieDifference({
            scope: "missing-yahoo-weekly-player",
            seasonId: options.seasonId,
            weekId,
            weekNum: toTrimmedString(week.weekNum),
            matchupId,
            gshlTeamId: teamId,
            yahooTeamId,
            side,
            playerId,
            playerName: player.fullName,
            url,
            details: `Goalie ${playerId} has PlayerDayStatLine totals for week ${weekId} but was not present in Yahoo's weekly matchup player tables.`,
          });
          continue;
        }

        recordDiscrepancy({
          type: "missing-yahoo-weekly-player",
          seasonId: options.seasonId,
          weekId,
          weekNum: toTrimmedString(week.weekNum),
          matchupId,
          gshlTeamId: teamId,
          yahooTeamId,
          side,
          playerId,
          playerName: player.fullName,
          url,
          details: `Player ${playerId} has PlayerDayStatLine totals for week ${weekId} but was not present in Yahoo's weekly matchup player tables.`,
        });

        if (options.apply) {
          const mutableRows = existingGroup.map((row) =>
            getMutablePlayerDayRow(row, pendingPlayerDayUpdates),
          );
          const candidateRows = getAdjustmentCandidateRows(mutableRows);
          if (!candidateRows.length) {
            recordDiscrepancy({
              type: "player-apply-failure",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              playerId,
              playerName: player.fullName,
              url,
              details: `Could not clear PlayerDayStatLine stats for player ${playerId} because no row with GP=1 and GS=1 was available.`,
            });
            continue;
          }

          for (const mutable of candidateRows) {
            for (const field of fields) {
              setMutablePlayerDayStatValue(
                mutable,
                field as MutablePlayerDayStatField,
                "",
              );
            }
            mutable.updatedAt = new Date();
          }
        }
      }
    }
  }

  let appliedPlayerDayUpdates = 0;
  let appliedPlayerDayCreates = 0;
  let appliedTeamWeekUpdates = 0;
  if (options.apply) {
    const playerDayWriteSummary = await applyPlayerDayWrites({
      seasonId: options.seasonId,
      existingRows: playerDayRows,
      updatesByRowNumber: pendingPlayerDayUpdates,
      creates: Array.from(pendingPlayerDayCreates.values()),
    });
    appliedPlayerDayUpdates = playerDayWriteSummary.updated;
    appliedPlayerDayCreates = playerDayWriteSummary.created;
    appliedTeamWeekUpdates = await applyTeamWeekWrites(
      Array.from(pendingTeamWeekUpdates.values()),
    );
  }

  const goalieDifferenceBreakdown = Array.from(
    goalieDifferences.reduce(
      (map, difference) => {
        const field = difference.field || "(none)";
        const key = `${difference.scope}::${field}`;
        map.set(key, {
          scope: difference.scope,
          field,
          count: (map.get(key)?.count ?? 0) + 1,
        });
        return map;
      },
      new Map<
        string,
        {
          scope: GoalieDifferenceRecord["scope"];
          field: string;
          count: number;
        }
      >(),
    ).values(),
  ).sort(
    (left, right) =>
      left.scope.localeCompare(right.scope) ||
      left.field.localeCompare(right.field),
  );

  const summary: CheckSummary = {
    seasonId: options.seasonId,
    apply: options.apply,
    weeksChecked: targetWeeks.length,
    matchupsChecked: targetMatchups.length,
    teamRowsChecked,
    playerRowsChecked,
    statComparisons,
    discrepancies: discrepancies.length,
    fetchFailures,
    parseFailures,
    unsupportedHeaders: Array.from(unsupportedHeaders).sort(),
    appliedPlayerDayUpdates,
    appliedPlayerDayCreates,
    appliedTeamWeekUpdates,
    goaltendingDifferences: goalieDifferences.length,
    goaltendingDifferenceBreakdown: goalieDifferenceBreakdown,
  };

    printSummary(summary);
    printRequiredChanges(discrepancies, goalieDifferences);

    const hardFailureTypes = new Set<DiscrepancyRecord["type"]>([
      "missing-week",
      "missing-team",
      "missing-yahoo-team-id",
      "fetch-failure",
      "parse-failure",
      "unknown-yahoo-player",
      "player-apply-failure",
    ]);
    if (
      (!options.apply && discrepancies.length > 0) ||
      discrepancies.some((discrepancy) => hardFailureTypes.has(discrepancy.type))
    ) {
      process.exitCode = 1;
    }
  } finally {
    await closeYahooBrowserSession();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
