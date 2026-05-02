import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import type { OptimizedSheetsClient } from "../lib/sheets/client/optimized-client";
import {
  getPlayerDayWorkbookId,
  PLAYERDAY_WORKBOOK_KEYS,
  SHEETS_CONFIG,
  WORKBOOKS,
} from "../lib/sheets/config/config";
import { safeParseSheetDate } from "../lib/utils/core/date";

type PrimitiveCellValue = string | number | boolean | null;

type PlayerSheetRow = {
  rowNumber: number;
  values: PrimitiveCellValue[];
  data: Record<string, PrimitiveCellValue>;
};

type PendingExistingUpdate = {
  row: PlayerSheetRow;
  playerId: string;
  source: Record<string, PrimitiveCellValue>;
};

type PendingInsert = {
  playerId: string;
  payload: Record<string, PrimitiveCellValue>;
};

type PlayerBioSyncOptions = {
  apply: boolean;
  logToConsole: boolean;
  gshlSeasonId: string;
  focusSeason: string;
  statSeason: string;
  pageSize: number;
  maxPages: number;
  currentDate: Date;
  headless: boolean;
  browserExecutablePath: string;
  userDataDir: string;
  waitForManualClearanceMs: number;
};

type PlayerBioSyncSummary = {
  dryRun: boolean;
  pagesFetched: number;
  apiRowsSeen: number;
  matchedUpdates: number;
  insertedPlayers: number;
  ambiguousSheetKeys: number;
  duplicateApiKeys: number;
  invalidBirthdays: number;
  invalidHeights: number;
  skippedRows: number;
  updated?: number;
  inserted?: number;
  total?: number;
};

type BrowserFetchResult = {
  status: number;
  text: string;
  url: string;
};


type SheetRecord = Record<string, PrimitiveCellValue>;

type LatestPlayerDaySnapshot = {
  dateKey: string;
  row: SheetRecord;
};

type RosterSnapshotContext = {
  targetDateKey: string;
  snapshotDateKey: string;
  playerRowsByPlayerId: Map<string, SheetRecord>;
};

type PlayerNhlContext = {
  currentSeasonId: string;
  previousSeasonId: string;
  seasonRatingsByPlayerId: Map<string, number>;
  overallRatingsByPlayerId: Map<string, number>;
  salaryByPlayerId: Map<string, number>;
  seasonRanksByPlayerId: Map<string, number>;
  overallRanksByPlayerId: Map<string, number>;
  preDraftRanksByPlayerId: Map<string, number>;
};

type PlayerSeasonStatusContext = {
  minimumSignableDays: number;
  futureContractsByPlayerId: Map<string, SheetRecord[]>;
  regularSeasonDaysByPlayerId: Map<string, number>;
  currentContractsByPlayerId: Map<string, SheetRecord[]>;
  offseasonUfaExpiryByPlayerId: Map<string, SheetRecord[]>;
  offseasonExpiredContractsByPlayerId: Map<string, SheetRecord[]>;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_FOCUS_SEASON = "162";
const DEFAULT_STAT_SEASON = "162";
const DEFAULT_USER_DATA_DIR = path.join(
  os.homedir(),
  ".gshl-puckpedia-browser",
);
const DEFAULT_WAIT_FOR_MANUAL_CLEARANCE_MS = 5 * 60 * 1000;
const MIN_SALARY = 1_000_000;
const MAX_SALARY = 10_000_000;
const SALARY_RANK_POINTS = [
  { rank: 3.5, salary: 10_000_000 },
  { rank: 18, salary: 9_000_000 },
  { rank: 35, salary: 8_000_000 },
  { rank: 140, salary: 5_000_000 },
  { rank: 225, salary: 2_000_000 },
  { rank: 270, salary: 1_000_000 },
] as const;
const RESIGNABLE_STATUS = {
  DRAFT: "DRAFT",
  RFA: "RFA",
  UFA: "UFA",
} as const;
const REGULAR_SEASON = "RS";
const MAX_LOOKBACK_SEASONS = 4;
const RECENCY_WEIGHTS = [1.0, 0.78, 0.59, 0.43] as const;
const RECENT_SEASON_INFLUENCE_BASE = 0.11;
const SKATER_SAMPLE_TARGET = 82;
const GOALIE_SAMPLE_TARGET = 50;
const SKATER_TALENT_STABILITY_TARGET = 180;
const GOALIE_TALENT_STABILITY_TARGET = 90;
const LINEUP_SLOTS = [
  { position: "LW", eligible: ["LW"] },
  { position: "LW", eligible: ["LW"] },
  { position: "C", eligible: ["C"] },
  { position: "C", eligible: ["C"] },
  { position: "RW", eligible: ["RW"] },
  { position: "RW", eligible: ["RW"] },
  { position: "D", eligible: ["D"] },
  { position: "D", eligible: ["D"] },
  { position: "D", eligible: ["D"] },
  { position: "Util", eligible: ["LW", "C", "RW", "D"] },
  { position: "G", eligible: ["G"] },
] as const;

const API_POSITION_MAP: Record<string, string> = {
  lw: "LW",
  l: "LW",
  c: "C",
  rw: "RW",
  r: "RW",
  d: "D",
  g: "G",
};

const FIRST_NAME_ALIAS_FAMILIES = [
  ["alexei", "alexey"],
  ["ben", "benjamin"],
  ["cam", "cameron"],
  ["dan", "daniel"],
  ["egor", "yegor"],
  ["fedor", "fyodor"],
  ["jake", "jacob"],
  ["janisjerome", "jj"],
  ["joe", "joseph"],
  ["johnjason", "jj"],
  ["josh", "joshua"],
  ["matt", "mathew", "matthew", "matty"],
  ["sam", "samuel"],
  ["will", "william"],
  ["zach", "zachary", "zack"],
] as const;

const DEFAULT_QUERY = {
  player_active: ["1"],
  bio_pos: ["lw", "c", "rw", "d", "g"],
  bio_shot: ["left", "right"],
  curPage: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  focus_season: DEFAULT_FOCUS_SEASON,
  player_role: "1",
  stat_season: DEFAULT_STAT_SEASON,
};

const HELP_TEXT = `
Usage:
  npm run player-bios:sync
  npm run player-bios:sync -- --apply

Options:
  --apply                 Write updates to the Player sheet. Omit for dry-run.
  --headless              Run Chrome headless. First pass is usually easier without this.
  --gshl-season-id <id>   Target GSHL season id. Defaults to the active Season row.
  --focus-season <value>  Override PuckPedia focus_season token. Default: 162
  --stat-season <value>   Override PuckPedia stat_season token. Default: 162
  --page-size <value>     Requested API page size, capped at 100. Default: 100
  --max-pages <value>     Pagination safety cap. Default: 25
  --current-date <value>  Override current date for age calculation.
  --browser-path <path>   Explicit Chrome/Edge executable path.
  --user-data-dir <path>  Persistent browser profile directory.
  --wait-ms <value>       Max wait for manual Cloudflare clearance. Default: 300000
  --log <true|false>      Reserved verbosity flag. Default: true
  --help                  Show this message and exit.
`.trim();

const DEBUG_PLAYER_ID = toTrimmedString(process.env.PLAYER_BIO_DEBUG_PLAYER_ID);

function parseBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let optimizedSheetsClientPromise: Promise<OptimizedSheetsClient> | null = null;

async function getOptimizedSheetsClient(): Promise<OptimizedSheetsClient> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  optimizedSheetsClientPromise ??= import(
    "../lib/sheets/client/optimized-client"
  ).then((module) => module.optimizedSheetsClient);

  return optimizedSheetsClientPromise;
}

async function readSheetRecords(
  spreadsheetId: string,
  sheetName: string,
  rangeSuffix = "A1:ZZ",
): Promise<SheetRecord[]> {
  const optimizedSheetsClient = await getOptimizedSheetsClient();
  const rawRows = await optimizedSheetsClient.getValues(
    spreadsheetId,
    `${sheetName}!${rangeSuffix}`,
  );

  if (!rawRows.length) {
    return [];
  }

  const headers = (rawRows[0] ?? []).map((value) => String(value ?? "").trim());
  if (!headers.length) {
    return [];
  }

  const records: SheetRecord[] = [];
  for (let index = 1; index < rawRows.length; index++) {
    const values = rawRows[index] ?? [];
    if (!values.length) continue;

    const record: SheetRecord = {};
    let hasAnyValue = false;
    headers.forEach((header, columnIndex) => {
      const cellValue = values[columnIndex] ?? "";
      record[header] = cellValue;
      if (cellValue !== "") hasAnyValue = true;
    });

    if (hasAnyValue) {
      records.push(record);
    }
  }

  return records;
}

async function readSheetRecordsForNames(
  spreadsheetId: string,
  sheetNames: string[],
  rangeSuffix = "A1:ZZ",
): Promise<{ sheetName: string; records: SheetRecord[] }> {
  let lastError: unknown = null;

  for (const sheetName of sheetNames) {
    try {
      return {
        sheetName,
        records: await readSheetRecords(spreadsheetId, sheetName, rangeSuffix),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("[player-bio-sync] Could not read any candidate sheet.");
}

function getArgValue(args: string[], flagName: string): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === flagName);
  if (exactIndex >= 0) {
    return args[exactIndex + 1];
  }

  const prefix = `${flagName}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasFlag(args: string[], flagName: string): boolean {
  return args.includes(flagName);
}

function toPositiveInteger(
  value: string | number | undefined,
  fallback: number,
  maxValue?: number,
): number {
  const numeric = Number(value);
  const safe =
    Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
  return maxValue !== undefined ? Math.min(safe, maxValue) : safe;
}

function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" || typeof value === "symbol") return "";
  return (value as string | number | boolean | bigint).toString().trim();
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = toTrimmedString(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function formatDateOnlyValue(value: unknown): string {
  const text = toTrimmedString(value);
  if (text) {
    const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(text);
    if (isoMatch?.[1]) return isoMatch[1];

    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(text);
    if (slashMatch) {
      const month = Number(slashMatch[1]);
      const day = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      const parsedSlashDate = new Date(
        Date.UTC(year, Math.max(month - 1, 0), day),
      );
      if (
        !Number.isNaN(parsedSlashDate.getTime()) &&
        parsedSlashDate.getUTCFullYear() === year &&
        parsedSlashDate.getUTCMonth() === month - 1 &&
        parsedSlashDate.getUTCDate() === day
      ) {
        return parsedSlashDate.toISOString().slice(0, 10);
      }
    }
  }

  const parsed = safeParseSheetDate(value);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  if (!text) return "";

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime())
    ? ""
    : fallback.toISOString().slice(0, 10);
}

function removeAccentsSafe(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  )
    return "";
  const raw = (value as string | number | boolean | bigint).toString();
  if (!raw) return "";
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildFirstNameAliasMap(
  families: readonly (readonly string[])[],
): Readonly<Record<string, string[]>> {
  const aliasMap: Record<string, string[]> = {};

  for (const family of families) {
    const normalizedFamily = [
      ...new Set(
        family.map((value) => normalizeNameKeyPart(value)).filter(Boolean),
      ),
    ];
    for (const familyMember of normalizedFamily) {
      const existingAliases = aliasMap[familyMember] ?? [];
      aliasMap[familyMember] = [
        ...new Set(
          existingAliases.concat(
            normalizedFamily.filter((candidate) => candidate !== familyMember),
          ),
        ),
      ];
    }
  }

  return aliasMap;
}

function normalizeNameKeyPart(value: unknown): string {
  return removeAccentsSafe(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

const FIRST_NAME_ALIAS_MAP = buildFirstNameAliasMap(FIRST_NAME_ALIAS_FAMILIES);

function sanitizeDisplayNamePart(value: unknown): string {
  return removeAccentsSafe(value)
    .replace(/[^A-Za-z]/g, "")
    .trim();
}

function extractInitialsNameKeyPart(value: unknown): string {
  const raw = removeAccentsSafe(value);
  if (!raw) return "";

  const delimitedParts = raw.split(/[^A-Za-z]+/).filter(Boolean);
  if (delimitedParts.length >= 2) {
    return normalizeNameKeyPart(
      delimitedParts.map((part) => part.charAt(0)).join(""),
    );
  }

  const uppercaseLetters = raw.match(/[A-Z]/g) ?? [];
  if (uppercaseLetters.length >= 2 && uppercaseLetters.length <= 4) {
    return normalizeNameKeyPart(uppercaseLetters.join(""));
  }

  return "";
}

function getNormalizedFirstNameKeys(value: unknown): string[] {
  const normalized = normalizeNameKeyPart(value);
  if (!normalized) return [];

  const seen = new Set<string>();
  const output: string[] = [];

  const add = (candidate: string) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    output.push(candidate);
  };

  add(normalized);
  for (const alias of FIRST_NAME_ALIAS_MAP[normalized] ?? []) {
    add(alias);
  }

  const initials = extractInitialsNameKeyPart(value);
  if (initials) {
    add(initials);
    for (const alias of FIRST_NAME_ALIAS_MAP[initials] ?? []) {
      add(alias);
    }
  }

  return output;
}

function normalizeApiPosition(value: unknown): string {
  const raw = toTrimmedString(value).toLowerCase();
  return API_POSITION_MAP[raw] ?? "";
}

function normalizePositionGroupToken(value: unknown): string {
  const raw = toTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!raw) return "";
  if (raw === "F" || raw === "FWD" || raw === "FORWARD") return "F";
  if (raw === "D" || raw === "DEFENSE" || raw === "DEFENCE") return "D";
  if (raw === "G" || raw === "GOALIE" || raw === "GOALTENDER") return "G";

  const normalizedPosition =
    normalizeSheetPositionToken(value) || normalizeApiPosition(value);
  return normalizedPosition ? getPosGroup(normalizedPosition) : "";
}

function normalizeSheetPositionToken(value: unknown): string {
  const raw = toTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!raw) return "";
  if (raw === "L" || raw === "LW" || raw === "LEFTWING") return "LW";
  if (raw === "R" || raw === "RW" || raw === "RIGHTWING") return "RW";
  if (raw === "C" || raw === "CTR" || raw === "CENTER") return "C";
  if (
    raw === "D" ||
    raw === "LD" ||
    raw === "RD" ||
    raw === "DEFENSE" ||
    raw === "DEFENCE"
  ) {
    return "D";
  }
  if (raw === "G" || raw === "GOALIE" || raw === "GOALTENDER") return "G";
  return "";
}

function splitSheetPositionTokens(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value
    : toTrimmedString(value).split(/[,\//|]/);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const part of parts) {
    const normalized = normalizeSheetPositionToken(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function splitPositionGroupTokens(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value
    : toTrimmedString(value).split(/[,\//|]/);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const part of parts) {
    const normalized = normalizePositionGroupToken(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function splitNhlPosTokens(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value
    : toTrimmedString(value).split(/[,/|;]/);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const part of parts) {
    const normalized = normalizeSheetPositionToken(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function choosePreferredPlayerDayRow(
  existing: SheetRecord | null,
  candidate: SheetRecord,
): SheetRecord {
  if (!existing) return candidate;

  const existingTeam = toTrimmedString(existing.gshlTeamId);
  const candidateTeam = toTrimmedString(candidate.gshlTeamId);
  if (candidateTeam && !existingTeam) return candidate;
  if (existingTeam && !candidateTeam) return existing;

  const existingPosCount = splitNhlPosTokens(existing.nhlPos).length;
  const candidatePosCount = splitNhlPosTokens(candidate.nhlPos).length;
  if (candidatePosCount !== existingPosCount) {
    return candidatePosCount > existingPosCount ? candidate : existing;
  }

  return candidate;
}

function buildMatchKeyFromParts(
  normalizedFirstName: string,
  normalizedLastName: string,
  normalizedPosGroup: string,
): string {
  if (!normalizedFirstName || !normalizedLastName || !normalizedPosGroup)
    return "";
  return `${normalizedFirstName}|${normalizedLastName}|${normalizedPosGroup}`;
}

function buildExactMatchKey(
  firstName: unknown,
  lastName: unknown,
  pos: unknown,
): string {
  return buildMatchKeyFromParts(
    normalizeNameKeyPart(firstName),
    normalizeNameKeyPart(lastName),
    normalizePositionGroupToken(pos),
  );
}

function buildCandidateMatchKeys(
  firstName: unknown,
  lastName: unknown,
  pos: unknown,
): string[] {
  const normalizedLastName = normalizeNameKeyPart(lastName);
  const normalizedPosGroup = normalizePositionGroupToken(pos);
  if (!normalizedLastName || !normalizedPosGroup) return [];

  const seen = new Set<string>();
  const output: string[] = [];

  for (const firstNameKey of getNormalizedFirstNameKeys(firstName)) {
    const matchKey = buildMatchKeyFromParts(
      firstNameKey,
      normalizedLastName,
      normalizedPosGroup,
    );
    if (!matchKey || seen.has(matchKey)) continue;
    seen.add(matchKey);
    output.push(matchKey);
  }

  return output;
}

function getPosGroup(pos: string): string {
  if (pos === "D") return "D";
  if (pos === "G") return "G";
  return "F";
}

function resolveFirstPresentValue(
  obj: Record<string, unknown>,
  fieldNames: string[],
): unknown {
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(obj, fieldName)) continue;
    const value = obj[fieldName];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function isValidDateOnlyString(value: unknown): value is string {
  const text = toTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === text
  );
}

function toFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = toTrimmedString(value).replace(/,/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function clip(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeHandedness(value: unknown): string {
  const raw = toTrimmedString(value).toLowerCase();
  if (raw === "l" || raw === "left") return "L";
  if (raw === "r" || raw === "right") return "R";
  return "";
}

function convertHeightToDisplay(value: unknown): string | null {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  const inches = Math.round(numeric);
  if (!Number.isFinite(inches) || inches <= 0) return null;
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}' ${remainder}`;
}

function calculateAge(birthday: string, currentDate: Date): number | null {
  const birthDate = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const diffMs = currentDate.getTime() - birthDate.getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return Math.round((diffMs / msPerYear) * 10) / 10;
}

function buildManagedFieldPatch(
  apiRow: Record<string, unknown>,
  currentDate: Date,
  summary: PlayerBioSyncSummary,
): Record<string, PrimitiveCellValue> {
  const fields: Record<string, PrimitiveCellValue> = {};

  const birthdayValue = resolveFirstPresentValue(apiRow, [
    "birthday",
    "birthdate",
    "dob",
    "birth_date",
  ]);

  if (birthdayValue !== null) {
    const birthdayText = toTrimmedString(birthdayValue);
    if (isValidDateOnlyString(birthdayText)) {
      fields.birthday = birthdayText;
      const age = calculateAge(birthdayText, currentDate);
      if (age !== null) {
        fields.age = age;
      } else {
        summary.invalidBirthdays++;
      }
    } else {
      summary.invalidBirthdays++;
    }
  }

  const country = toTrimmedString(apiRow.country);
  if (country) {
    fields.country = String(apiRow.country);
  }

  const handedness = normalizeHandedness(apiRow.shot);
  if (handedness) {
    fields.handedness = handedness;
  }

  const jerseyNum = toFiniteNumber(apiRow.jersey);
  if (jerseyNum !== null) {
    fields.jerseyNum = jerseyNum;
  }

  const weight = toFiniteNumber(apiRow.wt);
  if (weight !== null) {
    fields.weight = weight;
  }

  const heightValue = resolveFirstPresentValue(apiRow, ["ht"]);
  if (heightValue !== null) {
    const heightDisplay = convertHeightToDisplay(heightValue);
    if (heightDisplay) {
      fields.height = heightDisplay;
    } else {
      summary.invalidHeights++;
    }
  }

  return fields;
}

function hasManagedFields(fields: Record<string, PrimitiveCellValue>): boolean {
  return Object.keys(fields).length > 0;
}

function isHtmlLikeResponse(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("<") ||
    /<!doctype html/i.test(trimmed) ||
    /<html\b/i.test(trimmed) ||
    /Just a moment/i.test(trimmed) ||
    /Enable JavaScript and cookies to continue/i.test(trimmed)
  );
}

function getResponseExcerpt(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function createDefaultQuery(pageNumber: number, options: PlayerBioSyncOptions) {
  return {
    ...DEFAULT_QUERY,
    player_active: [...DEFAULT_QUERY.player_active],
    bio_pos: [...DEFAULT_QUERY.bio_pos],
    bio_shot: [...DEFAULT_QUERY.bio_shot],
    curPage: pageNumber,
    pageSize: options.pageSize,
    focus_season: options.focusSeason,
    stat_season: options.statSeason,
  };
}

function buildPuckPediaUrl(
  pageNumber: number,
  options: PlayerBioSyncOptions,
): string {
  return `https://puckpedia.com/players/api?q=${encodeURIComponent(JSON.stringify(createDefaultQuery(pageNumber, options)))}`;
}

function getRowsFromCandidate(
  candidate: unknown,
): Record<string, unknown>[] | null {
  if (!candidate) return null;
  if (Array.isArray(candidate)) {
    return candidate.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  if (typeof candidate !== "object") return null;
  const maybeObject = candidate as Record<string, unknown>;
  if (Array.isArray(maybeObject.p)) {
    return maybeObject.p.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  if (maybeObject.p && typeof maybeObject.p === "object") {
    return Object.keys(maybeObject.p)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => (maybeObject.p as Record<string, unknown>)[key])
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      );
  }
  if (Array.isArray(maybeObject.data)) {
    return maybeObject.data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  if (Array.isArray(maybeObject.results)) {
    return maybeObject.results.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  if (Array.isArray(maybeObject.rows)) {
    return maybeObject.rows.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  return null;
}

function extractRowsFromResponse(
  parsed: unknown,
  pageNumber: number,
): Record<string, unknown>[] {
  const candidates = [
    typeof parsed === "object" && parsed
      ? (parsed as Record<string, unknown>).data
      : undefined,
    typeof parsed === "object" && parsed
      ? (parsed as Record<string, unknown>).results
      : undefined,
    typeof parsed === "object" && parsed
      ? (parsed as Record<string, unknown>).rows
      : undefined,
    parsed,
  ];

  for (const candidate of candidates) {
    const rows = getRowsFromCandidate(candidate);
    if (rows) return rows;
  }

  throw new Error(
    `[player-bio-sync] Unsupported PuckPedia response shape for page ${pageNumber}. Expected rows under data.p/data/results/rows or as a root array.`,
  );
}

function normalizeWriteValue(
  value: PrimitiveCellValue | undefined,
): PrimitiveCellValue {
  if (value === undefined || value === null) return "";
  return value;
}

function buildRowArray(
  headers: string[],
  source: Record<string, PrimitiveCellValue | undefined>,
  existing?: PrimitiveCellValue[],
): PrimitiveCellValue[] {
  return headers.map((header, index) => {
    if (Object.prototype.hasOwnProperty.call(source, header)) {
      return normalizeWriteValue(source[header]);
    }
    return existing?.[index] ?? "";
  });
}

function buildExistingPlayerIndex(rows: PlayerSheetRow[]) {
  const playersByKey = new Map<string, PlayerSheetRow[]>();

  for (const row of rows) {
    const matchGroups = splitPositionGroupTokens(row.data.posGroup);
    const effectiveMatchGroups = matchGroups.length
      ? matchGroups
      : splitSheetPositionTokens(row.data.nhlPos).map((token) =>
          normalizePositionGroupToken(token),
        );

    const uniqueMatchGroups = [
      ...new Set(effectiveMatchGroups.filter(Boolean)),
    ];
    const firstNameKeys = getNormalizedFirstNameKeys(row.data.firstName);
    const normalizedLastName = normalizeNameKeyPart(row.data.lastName);
    if (!firstNameKeys.length || !normalizedLastName) continue;

    const rowKeys = new Set<string>();
    for (const matchGroup of uniqueMatchGroups) {
      for (const firstNameKey of firstNameKeys) {
        const key = buildMatchKeyFromParts(
          firstNameKey,
          normalizedLastName,
          matchGroup,
        );
        if (!key || rowKeys.has(key)) continue;
        rowKeys.add(key);
        const entries = playersByKey.get(key) ?? [];
        entries.push(row);
        playersByKey.set(key, entries);
      }
    }
  }

  const uniquePlayersByKey = new Map<string, PlayerSheetRow>();
  const ambiguousKeys = new Map<string, PlayerSheetRow[]>();

  for (const [key, entries] of playersByKey.entries()) {
    const uniqueEntries = [
      ...new Map(entries.map((entry) => [entry.rowNumber, entry])).values(),
    ];
    if (uniqueEntries.length === 1) {
      const [onlyEntry] = uniqueEntries;
      if (onlyEntry) uniquePlayersByKey.set(key, onlyEntry);
      continue;
    }
    ambiguousKeys.set(key, uniqueEntries);
  }

  return { uniquePlayersByKey, ambiguousKeys };
}

function resolveExistingPlayerMatches(
  existingIndex: ReturnType<typeof buildExistingPlayerIndex>,
  firstName: unknown,
  lastName: unknown,
  pos: unknown,
): PlayerSheetRow[] {
  const candidateKeys = buildCandidateMatchKeys(firstName, lastName, pos);
  const matchedRows = new Map<number, PlayerSheetRow>();

  for (const candidateKey of candidateKeys) {
    const uniquePlayer = existingIndex.uniquePlayersByKey.get(candidateKey);
    if (uniquePlayer) {
      matchedRows.set(uniquePlayer.rowNumber, uniquePlayer);
    }

    const ambiguousPlayers =
      existingIndex.ambiguousKeys.get(candidateKey) ?? [];
    for (const ambiguousPlayer of ambiguousPlayers) {
      matchedRows.set(ambiguousPlayer.rowNumber, ambiguousPlayer);
    }
  }

  return [...matchedRows.values()];
}

function resolveBrowserExecutablePath(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    process.env.PUCKPEDIA_BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "[player-bio-sync] Could not find a local Chrome/Edge executable. Pass --browser-path.",
  );
}

async function waitForSearchPageReady(
  page: Page,
  options: PlayerBioSyncOptions,
): Promise<void> {
  const targetUrl = "https://puckpedia.com/players/search";
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  const deadline = Date.now() + options.waitForManualClearanceMs;
  let promptedForManualClearance = false;

  while (Date.now() < deadline) {
    const title = await page.title();
    const content = await page.content();
    const onChallengePage =
      /Just a moment/i.test(title) ||
      /Enable JavaScript and cookies to continue/i.test(content);

    if (!onChallengePage) {
      return;
    }

    if (!options.headless && !promptedForManualClearance) {
      promptedForManualClearance = true;
      console.log(
        "[player-bio-sync] Cloudflare challenge detected. Complete it in the opened browser window, then press Enter here.",
      );
      const rl = readline.createInterface({ input, output });
      await rl.question("");
      rl.close();
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      continue;
    }

    await sleep(3000);
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    } catch {
      // Continue polling until timeout.
    }
  }

  throw new Error(
    options.headless
      ? "[player-bio-sync] Browser session did not clear the PuckPedia Cloudflare challenge in time. Rerun without --headless for the first pass so you can complete the challenge manually."
      : "[player-bio-sync] Browser session did not clear the PuckPedia Cloudflare challenge in time.",
  );
}

async function fetchApiPageThroughBrowser(
  page: Page,
  apiUrl: string,
): Promise<BrowserFetchResult> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      url: response.url,
    };
  }, apiUrl);
}

async function fetchPuckPediaRows(
  page: Page,
  pageNumber: number,
  options: PlayerBioSyncOptions,
): Promise<Record<string, unknown>[]> {
  const apiUrl = buildPuckPediaUrl(pageNumber, options);
  const response = await fetchApiPageThroughBrowser(page, apiUrl);

  if (isHtmlLikeResponse(response.text)) {
    throw new Error(
      `[player-bio-sync] Browser fetch still received HTML/Cloudflare challenge for page ${pageNumber} HTTP ${response.status} url=${response.url} excerpt=${getResponseExcerpt(response.text)}`,
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `[player-bio-sync] Browser fetch failed for page ${pageNumber} HTTP ${response.status} url=${response.url} excerpt=${getResponseExcerpt(response.text)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error(
      `[player-bio-sync] Browser fetch returned non-JSON for page ${pageNumber} HTTP ${response.status} url=${response.url} excerpt=${getResponseExcerpt(response.text)}`,
    );
  }

  return extractRowsFromResponse(parsed, pageNumber);
}

function buildDenseRankMap<T extends Record<string, unknown>>(
  entries: T[],
  valueField: keyof T,
  keyField: keyof T,
): Map<string, number> {
  const sorted = entries
    .filter((entry) => {
      const score = Number(entry?.[valueField]);
      return Number.isFinite(score);
    })
    .slice()
    .sort((left, right) => {
      const scoreDiff =
        (Number(right?.[valueField]) || 0) - (Number(left?.[valueField]) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left?.[keyField] ?? "").localeCompare(
        String(right?.[keyField] ?? ""),
      );
    });

  const rankMap = new Map<string, number>();
  let denseRank = 0;
  let previousScore: number | null = null;

  for (const entry of sorted) {
    const score = Number(entry[valueField]);
    if (previousScore === null || score !== previousScore) {
      denseRank++;
      previousScore = score;
    }
    rankMap.set(String(entry[keyField] ?? ""), denseRank);
  }

  return rankMap;
}

function resolveSeasonRatingValue(row: SheetRecord | null): number | null {
  if (!row) return null;
  for (const fieldName of [
    "seasonRating",
    "seasonrating",
    "season_rating",
    "Rating",
    "rating",
  ]) {
    const numeric = toFiniteNumber(row[fieldName]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function getRecordPosGroup(
  row: SheetRecord | null,
  fallback?: unknown,
): string {
  const directPosGroup = normalizePositionGroupToken(row?.posGroup);
  if (directPosGroup) return directPosGroup;

  const nhlPosTokens = splitNhlPosTokens(row?.nhlPos);
  if (nhlPosTokens[0]) {
    return getPosGroup(nhlPosTokens[0]);
  }

  const fallbackPosGroup = normalizePositionGroupToken(fallback);
  if (fallbackPosGroup) return fallbackPosGroup;

  const fallbackTokens = splitNhlPosTokens(fallback);
  if (fallbackTokens[0]) {
    return getPosGroup(fallbackTokens[0]);
  }

  return "F";
}

function getUsageValue(row: SheetRecord | null): number {
  if (!row) return 0;
  const posGroup = getRecordPosGroup(row);
  if (posGroup === "G") {
    const starts = toFiniteNumber(row.GS) ?? 0;
    if (starts > 0) return starts;
    return toFiniteNumber(row.GP) ?? 0;
  }
  return toFiniteNumber(row.GP) ?? 0;
}

function buildSeasonOrder(rows: SheetRecord[]): string[] {
  return [
    ...new Set(
      rows.map((row) => toTrimmedString(row.seasonId)).filter(Boolean),
    ),
  ].sort(compareSeasonIdAsc);
}

function buildSeasonIndexMap(
  rows: SheetRecord[],
  extraSeasonIds: string[] = [],
): Map<string, number> {
  const seasonOrder = [
    ...new Set(buildSeasonOrder(rows).concat(extraSeasonIds.filter(Boolean))),
  ].sort(compareSeasonIdAsc);
  const seasonIndexMap = new Map<string, number>();
  seasonOrder.forEach((seasonId, index) => {
    seasonIndexMap.set(seasonId, index);
  });
  return seasonIndexMap;
}

function buildRowsByPlayerId(rows: SheetRecord[]): Map<string, SheetRecord[]> {
  const rowsByPlayerId = new Map<string, SheetRecord[]>();

  for (const row of rows) {
    const playerId = toTrimmedString(row.playerId);
    if (!playerId) continue;
    const bucket = rowsByPlayerId.get(playerId) ?? [];
    bucket.push(row);
    rowsByPlayerId.set(playerId, bucket);
  }

  for (const bucket of rowsByPlayerId.values()) {
    bucket.sort((left, right) =>
      compareSeasonIdAsc(
        toTrimmedString(right.seasonId),
        toTrimmedString(left.seasonId),
      ),
    );
  }

  return rowsByPlayerId;
}

function getLeagueAnchor(
  rowsForSeason: SheetRecord[],
  posGroup: string,
): number {
  const scores = rowsForSeason
    .filter((row) => getRecordPosGroup(row) === posGroup)
    .map((row) => resolveSeasonRatingValue(row))
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  if (!scores.length) return 62.5;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function buildSeasonLeagueAnchors(
  rowsForSeason: SheetRecord[],
): Record<string, number> {
  return {
    F: getLeagueAnchor(rowsForSeason, "F"),
    D: getLeagueAnchor(rowsForSeason, "D"),
    G: getLeagueAnchor(rowsForSeason, "G"),
  };
}

function getSampleReliability(row: SheetRecord): number {
  const posGroup = getRecordPosGroup(row);
  const usage = getUsageValue(row);
  if (usage <= 0) return 0;
  const target = posGroup === "G" ? GOALIE_SAMPLE_TARGET : SKATER_SAMPLE_TARGET;
  const ratio = clip(usage / target, 0, 1);
  return 0.35 + 0.65 * Math.sqrt(ratio);
}

function getCareerStabilityFactor(
  posGroup: string,
  seasonCount: number,
  totalUsage: number,
): number {
  const usageTarget =
    posGroup === "G"
      ? GOALIE_TALENT_STABILITY_TARGET
      : SKATER_TALENT_STABILITY_TARGET;
  const usageTrust = clip(
    Math.sqrt(clip(totalUsage / usageTarget, 0, 1)),
    0,
    1,
  );
  const seasonTrust =
    seasonCount >= 4
      ? 1
      : seasonCount === 3
        ? 0.92
        : seasonCount === 2
          ? 0.84
          : 0.76;
  return seasonTrust * (0.8 + 0.2 * usageTrust);
}

function dampDeviation(
  score: number,
  mean: number,
  reliability: number,
): number {
  const deviation = score - mean;
  const absDeviation = Math.abs(deviation);
  let factor = 1;
  if (absDeviation <= 8) {
    factor = 1;
  } else if (absDeviation <= 18) {
    factor = 0.78 + 0.12 * reliability;
  } else {
    factor = 0.55 + 0.2 * reliability;
  }
  return mean + deviation * factor;
}

function computeOverallRatingForHistory(
  historyRows: SheetRecord[],
  leagueAnchor: number,
): number | null {
  if (!historyRows.length) return null;

  const scoredHistory = historyRows
    .map((row, index) => {
      const score = resolveSeasonRatingValue(row);
      if (score === null || !Number.isFinite(score)) return null;
      return {
        row,
        score,
        usage: getUsageValue(row),
        reliability: getSampleReliability(row),
        recencyWeight:
          RECENCY_WEIGHTS[index] ??
          RECENCY_WEIGHTS[RECENCY_WEIGHTS.length - 1] ??
          0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!scoredHistory.length) return null;

  const prelimEntries = scoredHistory.map((entry) => ({
    value: entry.score,
    weight: entry.recencyWeight * entry.reliability,
  }));
  const prelimWeight = prelimEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const prelimMean =
    prelimWeight > 0
      ? prelimEntries.reduce(
          (sum, entry) => sum + entry.value * entry.weight,
          0,
        ) / prelimWeight
      : 0;

  const dampedEntries = scoredHistory.map((entry) => ({
    value: dampDeviation(entry.score, prelimMean, entry.reliability),
    weight: entry.recencyWeight * entry.reliability,
  }));
  const dampedWeight = dampedEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const dampedMean =
    dampedWeight > 0
      ? dampedEntries.reduce(
          (sum, entry) => sum + entry.value * entry.weight,
          0,
        ) / dampedWeight
      : 0;

  const posGroup = getRecordPosGroup(scoredHistory[0]?.row ?? null);
  const totalUsage = scoredHistory.reduce((sum, entry) => sum + entry.usage, 0);
  const stability = getCareerStabilityFactor(
    posGroup,
    scoredHistory.length,
    totalUsage,
  );
  const anchored = leagueAnchor + (dampedMean - leagueAnchor) * stability;
  const recentScore = scoredHistory[0]?.score ?? anchored;
  const recentInfluence =
    RECENT_SEASON_INFLUENCE_BASE * (scoredHistory[0]?.reliability ?? 0);
  let overall = anchored + (recentScore - anchored) * recentInfluence;

  if (posGroup === "G") {
    overall *= 1.03;
  } else if (posGroup === "D") {
    overall *= 1.0025;
  }

  return roundScore(clip(overall, 0, 125));
}

function getHistoryRowsForSeason(
  playerId: string,
  rowsByPlayerId: Map<string, SheetRecord[]>,
  seasonIndexMap: Map<string, number>,
  targetSeasonIndex: number,
  maxLookbackSeasons: number,
): SheetRecord[] {
  const playerHistory = rowsByPlayerId.get(playerId) ?? [];
  if (!playerHistory.length || !Number.isFinite(targetSeasonIndex)) return [];

  return playerHistory
    .filter((row) => {
      const historyIndex = seasonIndexMap.get(toTrimmedString(row.seasonId));
      return historyIndex !== undefined && historyIndex <= targetSeasonIndex;
    })
    .slice(0, maxLookbackSeasons);
}

function buildSalaryByPlayerId(
  overallEntries: Array<{
    playerId: string;
    overallRating: number;
    seasonRating: number | null;
  }>,
): Map<string, number> {
  const rated = overallEntries
    .filter((entry) => Number.isFinite(entry.overallRating))
    .slice()
    .sort((left, right) => {
      const overallDiff = right.overallRating - left.overallRating;
      if (overallDiff !== 0) return overallDiff;

      const seasonDiff = (right.seasonRating ?? 0) - (left.seasonRating ?? 0);
      if (seasonDiff !== 0) return seasonDiff;

      return left.playerId.localeCompare(right.playerId);
    });

  const salaryByPlayerId = new Map<string, number>();
  let index = 0;

  while (index < rated.length) {
    const score = rated[index]?.overallRating ?? 0;
    let end = index + 1;
    while ((rated[end]?.overallRating ?? NaN) === score) {
      end++;
    }

    const startRank = index + 1;
    const endRank = end;
    const averageRank = (startRank + endRank) / 2;
    const salary = roundSalary(interpolateSalaryByRank(averageRank));

    for (let current = index; current < end; current++) {
      const playerId = rated[current]?.playerId;
      if (!playerId) continue;
      salaryByPlayerId.set(playerId, salary);
    }

    index = end;
  }

  return salaryByPlayerId;
}

function resolveOverallRatingValue(row: SheetRecord | null): number | null {
  if (!row) return null;
  for (const fieldName of [
    "overallRating",
    "overallrating",
    "overall_rating",
  ]) {
    const numeric = toFiniteNumber(row[fieldName]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function resolveSalaryValue(row: SheetRecord | null): number | null {
  if (!row) return null;
  for (const fieldName of ["salary", "Salary"]) {
    const numeric = toFiniteNumber(row[fieldName]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function interpolateSalaryByRank(rank: number): number {
  const highestSalaryPoint = SALARY_RANK_POINTS[0];
  const lowestSalaryPoint = SALARY_RANK_POINTS[SALARY_RANK_POINTS.length - 1];
  if (!Number.isFinite(rank) || rank <= 0) return MAX_SALARY;
  if (!highestSalaryPoint || !lowestSalaryPoint) return MIN_SALARY;
  if (rank <= highestSalaryPoint.rank) return MAX_SALARY;
  if (rank >= lowestSalaryPoint.rank) {
    return MIN_SALARY;
  }

  for (let index = 0; index < SALARY_RANK_POINTS.length - 1; index++) {
    const left = SALARY_RANK_POINTS[index];
    const right = SALARY_RANK_POINTS[index + 1];
    if (!left || !right) continue;
    if (rank <= right.rank) {
      const span = Math.max(right.rank - left.rank, 0.0001);
      const progress = (rank - left.rank) / span;
      return left.salary + progress * (right.salary - left.salary);
    }
  }

  return MIN_SALARY;
}

function roundSalary(value: number): number {
  return Math.round(value / 50_000) * 50_000;
}

function compareSeasonIdAsc(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function getDatesInRangeInclusiveCount(
  startDate: unknown,
  endDate: unknown,
): number {
  const startKey = formatDateOnlyValue(startDate);
  const endKey = formatDateOnlyValue(endDate);
  if (!startKey || !endKey) return 0;

  const start = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return 0;
  }

  return (
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
}

function normalizeExpiryStatus(value: unknown): string {
  const raw = toTrimmedString(value).toUpperCase();
  if (raw === RESIGNABLE_STATUS.RFA) return RESIGNABLE_STATUS.RFA;
  if (raw === RESIGNABLE_STATUS.UFA) return RESIGNABLE_STATUS.UFA;
  return "";
}

function getContractEffectiveEndKey(contract: SheetRecord | null): string {
  if (!contract) return "";
  const expiryKey = formatDateOnlyValue(contract.expiryDate);
  const capHitEndKey = formatDateOnlyValue(contract.capHitEndDate);
  return [expiryKey, capHitEndKey].filter(Boolean).sort().at(-1) ?? "";
}

function isEligibleForLineupSlot(
  nhlPosTokens: string[],
  eligiblePositions: readonly string[],
): boolean {
  return nhlPosTokens.some((token) => eligiblePositions.includes(token));
}

function buildLineupAssignments(
  roster: Array<{ playerId: string; nhlPosTokens: string[]; rating: number }>,
): Map<string, string> {
  const assignments = new Map<string, string>();
  const usedPlayerIds = new Set<string>();
  const sortedRoster = roster
    .slice()
    .sort((left, right) => right.rating - left.rating);

  for (const slot of LINEUP_SLOTS) {
    const candidate = sortedRoster.find((player) => {
      if (usedPlayerIds.has(player.playerId)) return false;
      return isEligibleForLineupSlot(player.nhlPosTokens, slot.eligible);
    });

    if (!candidate) continue;
    assignments.set(candidate.playerId, slot.position);
    usedPlayerIds.add(candidate.playerId);
  }

  for (const player of sortedRoster) {
    if (usedPlayerIds.has(player.playerId)) continue;
    assignments.set(player.playerId, "BN");
  }

  return assignments;
}

async function resolveCurrentGshlSeasonId(
  explicitSeasonId: string,
): Promise<string> {
  if (toTrimmedString(explicitSeasonId)) {
    return toTrimmedString(explicitSeasonId);
  }

  const seasonRows = await readSheetRecords(
    WORKBOOKS.GENERAL,
    SHEETS_CONFIG.SHEETS.Season,
  );
  const activeRows = seasonRows.filter((row) => toBoolean(row.isActive));
  const candidates = activeRows.length ? activeRows : seasonRows;
  const sortedCandidates = candidates.slice().sort((left, right) => {
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
      return rightId - leftId;
    }
    return String(right.id ?? "").localeCompare(String(left.id ?? ""));
  });

  const currentSeasonId = toTrimmedString(sortedCandidates[0]?.id);
  if (!currentSeasonId) {
    throw new Error(
      "[player-bio-sync] Could not determine the current GSHL season id.",
    );
  }

  return currentSeasonId;
}

async function buildTeamIdToFranchiseIdMapForSeason(
  gshlSeasonId: string,
): Promise<Map<string, string>> {
  const teamRows = await readSheetRecords(
    WORKBOOKS.GENERAL,
    SHEETS_CONFIG.SHEETS.Team,
  );
  const teamIdToFranchiseId = new Map<string, string>();

  for (const row of teamRows) {
    if (toTrimmedString(row.seasonId) !== gshlSeasonId) continue;
    const teamId = toTrimmedString(row.id);
    const franchiseId = toTrimmedString(row.franchiseId);
    if (!teamId || !franchiseId) continue;
    teamIdToFranchiseId.set(teamId, franchiseId);
  }

  return teamIdToFranchiseId;
}

async function buildLatestPlayerDaySnapshots(): Promise<
  Map<string, LatestPlayerDaySnapshot>
> {
  const snapshots = new Map<string, LatestPlayerDaySnapshot>();

  for (const workbookKey of PLAYERDAY_WORKBOOK_KEYS) {
    const spreadsheetId = WORKBOOKS[workbookKey];
    if (!spreadsheetId) continue;

    const rows = await readSheetRecords(
      spreadsheetId,
      SHEETS_CONFIG.SHEETS.PlayerDayStatLine,
      "A1:I",
    );

    for (const row of rows) {
      const playerId = toTrimmedString(row.playerId);
      const dateKey = formatDateOnlyValue(row.date);
      if (!playerId || !dateKey) continue;

      const existingSnapshot = snapshots.get(playerId);
      if (!existingSnapshot || dateKey > existingSnapshot.dateKey) {
        snapshots.set(playerId, { dateKey, row });
        continue;
      }

      if (dateKey === existingSnapshot.dateKey) {
        snapshots.set(playerId, {
          dateKey,
          row: choosePreferredPlayerDayRow(existingSnapshot.row, row),
        });
      }
    }
  }

  return snapshots;
}

async function buildRosterSnapshotContext(
  gshlSeasonId: string,
  referenceDate: Date,
): Promise<RosterSnapshotContext> {
  const [seasonRows, weekRows] = await Promise.all([
    readSheetRecords(WORKBOOKS.GENERAL, SHEETS_CONFIG.SHEETS.Season),
    readSheetRecords(WORKBOOKS.GENERAL, SHEETS_CONFIG.SHEETS.Week),
  ]);

  const seasonRow =
    seasonRows.find((row) => toTrimmedString(row.id) === gshlSeasonId) ?? null;
  const seasonStartKey = formatDateOnlyValue(seasonRow?.startDate);
  const seasonEndKey = formatDateOnlyValue(seasonRow?.endDate);
  const regularSeasonEndKey =
    weekRows
      .filter(
        (row) =>
          toTrimmedString(row.seasonId) === gshlSeasonId &&
          toTrimmedString(row.weekType) === REGULAR_SEASON,
      )
      .map((row) => formatDateOnlyValue(row.endDate))
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  const referenceDateKey = formatDateOnlyValue(referenceDate);
  const activeByDate =
    !!seasonStartKey &&
    !!seasonEndKey &&
    !!referenceDateKey &&
    seasonStartKey <= referenceDateKey &&
    referenceDateKey <= seasonEndKey;
  const isSeasonActive =
    activeByDate ||
    ((!seasonStartKey || !seasonEndKey) && toBoolean(seasonRow?.isActive));
  const targetDateKey =
    (isSeasonActive ? referenceDateKey : regularSeasonEndKey || seasonEndKey) ||
    "";

  if (!targetDateKey) {
    return {
      targetDateKey: "",
      snapshotDateKey: "",
      playerRowsByPlayerId: new Map<string, SheetRecord>(),
    };
  }

  const rows = await readSheetRecords(
    getPlayerDayWorkbookId(gshlSeasonId),
    SHEETS_CONFIG.SHEETS.PlayerDayStatLine,
    "A1:I",
  );

  let snapshotDateKey = "";
  for (const row of rows) {
    if (toTrimmedString(row.seasonId) !== gshlSeasonId) continue;
    const dateKey = formatDateOnlyValue(row.date);
    if (!dateKey || dateKey > targetDateKey) continue;
    if (!snapshotDateKey || dateKey > snapshotDateKey) {
      snapshotDateKey = dateKey;
    }
  }

  const playerRowsByPlayerId = new Map<string, SheetRecord>();
  if (!snapshotDateKey) {
    return {
      targetDateKey,
      snapshotDateKey: "",
      playerRowsByPlayerId,
    };
  }

  for (const row of rows) {
    if (toTrimmedString(row.seasonId) !== gshlSeasonId) continue;
    const playerId = toTrimmedString(row.playerId);
    const dateKey = formatDateOnlyValue(row.date);
    if (!playerId || dateKey !== snapshotDateKey) continue;

    const existingRow = playerRowsByPlayerId.get(playerId) ?? null;
    playerRowsByPlayerId.set(
      playerId,
      choosePreferredPlayerDayRow(existingRow, row),
    );
  }

  return {
    targetDateKey,
    snapshotDateKey,
    playerRowsByPlayerId,
  };
}

async function buildPlayerSeasonStatusContext(
  gshlSeasonId: string,
  referenceDate: Date,
): Promise<PlayerSeasonStatusContext> {
  const [seasonRows, weekRows, contractRows, totalRows] = await Promise.all([
    readSheetRecords(WORKBOOKS.GENERAL, SHEETS_CONFIG.SHEETS.Season),
    readSheetRecords(WORKBOOKS.GENERAL, SHEETS_CONFIG.SHEETS.Week),
    readSheetRecords(WORKBOOKS.GENERAL, SHEETS_CONFIG.SHEETS.Contract),
    readSheetRecords(
      WORKBOOKS.PLAYERSTATS,
      SHEETS_CONFIG.SHEETS.PlayerTotalStatLine,
    ),
  ]);

  const regularSeasonDayCount = weekRows
    .filter(
      (row) =>
        toTrimmedString(row.seasonId) === gshlSeasonId &&
        toTrimmedString(row.weekType) === REGULAR_SEASON,
    )
    .reduce((sum, row) => {
      const scheduledDays = toFiniteNumber(row.gameDays);
      if (scheduledDays !== null && scheduledDays > 0) {
        return sum + scheduledDays;
      }
      return sum + getDatesInRangeInclusiveCount(row.startDate, row.endDate);
    }, 0);

  const minimumSignableDays =
    regularSeasonDayCount > 0 ? regularSeasonDayCount * 0.35 : 0;

  const futureContractsByPlayerId = new Map<string, SheetRecord[]>();
  const currentContractsByPlayerId = new Map<string, SheetRecord[]>();
  const offseasonUfaExpiryByPlayerId = new Map<string, SheetRecord[]>();
  const offseasonExpiredContractsByPlayerId = new Map<string, SheetRecord[]>();
  const todayKey = formatDateOnlyValue(referenceDate);
  const seasonEndKey =
    formatDateOnlyValue(
      seasonRows.find((row) => toTrimmedString(row.id) === gshlSeasonId)
        ?.endDate,
    ) || "";

  const pushContract = (
    bucketMap: Map<string, SheetRecord[]>,
    playerId: string,
    contract: SheetRecord,
  ) => {
    const bucket = bucketMap.get(playerId) ?? [];
    bucket.push(contract);
    bucketMap.set(playerId, bucket);
  };

  for (const contract of contractRows) {
    const playerId = toTrimmedString(contract.playerId);
    const effectiveEndKey = getContractEffectiveEndKey(contract);
    const normalizedExpiryStatus = normalizeExpiryStatus(contract.expiryStatus);
    if (!playerId || !effectiveEndKey) continue;

    if (DEBUG_PLAYER_ID && playerId === DEBUG_PLAYER_ID) {
      console.log(
        JSON.stringify(
          {
            debugContractPlayerId: playerId,
            contractId: contract.id,
            todayKey,
            seasonEndKey,
            expiryDate: contract.expiryDate,
            capHitEndDate: contract.capHitEndDate,
            effectiveEndKey,
            normalizedExpiryStatus,
            bucketChecks: {
              future: effectiveEndKey > todayKey,
              current: effectiveEndKey >= todayKey,
              offseason:
                !!seasonEndKey &&
                effectiveEndKey >= seasonEndKey &&
                effectiveEndKey < todayKey,
            },
          },
          null,
          2,
        ),
      );
    }

    if (effectiveEndKey > todayKey) {
      pushContract(futureContractsByPlayerId, playerId, contract);
    }

    if (effectiveEndKey >= todayKey) {
      pushContract(currentContractsByPlayerId, playerId, contract);
    }

    if (
      seasonEndKey &&
      effectiveEndKey >= seasonEndKey &&
      effectiveEndKey < todayKey
    ) {
      pushContract(offseasonExpiredContractsByPlayerId, playerId, contract);
      if (normalizedExpiryStatus === RESIGNABLE_STATUS.UFA) {
        pushContract(offseasonUfaExpiryByPlayerId, playerId, contract);
      }
    }
  }

  const sortContractsDesc = (contracts: SheetRecord[]) => {
    contracts.sort((left, right) => {
      const leftExpiry = getContractEffectiveEndKey(left);
      const rightExpiry = getContractEffectiveEndKey(right);
      if (leftExpiry !== rightExpiry) {
        return rightExpiry.localeCompare(leftExpiry);
      }

      const leftNominalExpiry = formatDateOnlyValue(left.expiryDate);
      const rightNominalExpiry = formatDateOnlyValue(right.expiryDate);
      if (leftNominalExpiry !== rightNominalExpiry) {
        return rightNominalExpiry.localeCompare(leftNominalExpiry);
      }

      const leftStart = formatDateOnlyValue(left.startDate);
      const rightStart = formatDateOnlyValue(right.startDate);
      if (leftStart !== rightStart) {
        return rightStart.localeCompare(leftStart);
      }

      return toTrimmedString(right.id).localeCompare(toTrimmedString(left.id));
    });
  };

  for (const contracts of futureContractsByPlayerId.values()) {
    sortContractsDesc(contracts);
  }
  for (const contracts of currentContractsByPlayerId.values()) {
    sortContractsDesc(contracts);
  }
  for (const contracts of offseasonUfaExpiryByPlayerId.values()) {
    sortContractsDesc(contracts);
  }
  for (const contracts of offseasonExpiredContractsByPlayerId.values()) {
    sortContractsDesc(contracts);
  }

  const regularSeasonDaysByPlayerId = new Map<string, number>();
  for (const row of totalRows) {
    const playerId = toTrimmedString(row.playerId);
    if (
      !playerId ||
      toTrimmedString(row.seasonId) !== gshlSeasonId ||
      toTrimmedString(row.seasonType) !== REGULAR_SEASON
    ) {
      continue;
    }

    const days = toFiniteNumber(row.days);
    if (days !== null) {
      regularSeasonDaysByPlayerId.set(playerId, days);
    }
  }

  return {
    minimumSignableDays,
    futureContractsByPlayerId,
    regularSeasonDaysByPlayerId,
    currentContractsByPlayerId,
    offseasonUfaExpiryByPlayerId,
    offseasonExpiredContractsByPlayerId,
  };
}

async function buildPlayerNhlContext(
  gshlSeasonId: string,
  playerRows: PlayerSheetRow[],
): Promise<PlayerNhlContext> {
  const { records: allRows } = await readSheetRecordsForNames(
    WORKBOOKS.PLAYERSTATS,
    ["PlayerNHLStatLine", "PlayerNHL"],
  );

  const seasonRows = allRows.filter(
    (row) => toTrimmedString(row.seasonId) === gshlSeasonId,
  );
  const seasonOrder = buildSeasonOrder(allRows);
  const currentSeasonIndex = seasonOrder.indexOf(gshlSeasonId);
  const seasonIndexMap = buildSeasonIndexMap(allRows, [gshlSeasonId]);
  const targetSeasonIndex = seasonIndexMap.get(gshlSeasonId);
  const previousSeasonId =
    currentSeasonIndex > 0 ? (seasonOrder[currentSeasonIndex - 1] ?? "") : "";
  const rowsByPlayerId = buildRowsByPlayerId(allRows);
  const seasonLeagueAnchors = buildSeasonLeagueAnchors(seasonRows);
  const currentSeasonRowsByPlayerId = new Map<string, SheetRecord>();

  for (const row of seasonRows) {
    const playerId = toTrimmedString(row.playerId);
    if (!playerId) continue;
    currentSeasonRowsByPlayerId.set(playerId, row);
  }

  const seasonPlayerRows = seasonRows
    .map((row) => {
      const playerId = toTrimmedString(row.playerId);
      if (!playerId) return null;

      return {
        playerId,
        seasonRating: resolveSeasonRatingValue(row),
        overallRating: resolveOverallRatingValue(row),
        salary: resolveSalaryValue(row),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const previousSeasonRows = previousSeasonId
    ? allRows.filter(
        (row) => toTrimmedString(row.seasonId) === previousSeasonId,
      )
    : [];
  const previousSeasonOverallRows = previousSeasonRows
    .map((row) => {
      const playerId = toTrimmedString(row.playerId);
      const overallRating = resolveOverallRatingValue(row);
      if (!playerId || overallRating === null) return null;
      return { playerId, overallRating };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const overallPlayerRows = playerRows
    .filter((row) => toBoolean(row.data.isActive))
    .map((playerRow) => {
      const playerId = toTrimmedString(playerRow.data.id);
      if (!playerId || targetSeasonIndex === undefined) return null;

      const currentSeasonRow =
        currentSeasonRowsByPlayerId.get(playerId) ?? null;
      const historyRows = getHistoryRowsForSeason(
        playerId,
        rowsByPlayerId,
        seasonIndexMap,
        targetSeasonIndex,
        MAX_LOOKBACK_SEASONS,
      );
      const posGroup = currentSeasonRow
        ? getRecordPosGroup(currentSeasonRow)
        : historyRows[0]
          ? getRecordPosGroup(historyRows[0])
          : getRecordPosGroup(
              null,
              playerRow.data.posGroup ?? playerRow.data.nhlPos,
            );
      const overallRating = computeOverallRatingForHistory(
        historyRows,
        seasonLeagueAnchors[posGroup] ?? 62.5,
      );
      return {
        playerId,
        overallRating: overallRating ?? 0,
        seasonRating: currentSeasonRow
          ? resolveSeasonRatingValue(currentSeasonRow)
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const seasonRanksByPlayerId = buildDenseRankMap(
    seasonPlayerRows.filter((row) => row.seasonRating !== null),
    "seasonRating",
    "playerId",
  );
  const overallRanksByPlayerId = buildDenseRankMap(
    overallPlayerRows,
    "overallRating",
    "playerId",
  );
  const preDraftRanksByPlayerId = buildDenseRankMap(
    previousSeasonOverallRows,
    "overallRating",
    "playerId",
  );

  const seasonRatingsByPlayerId = new Map<string, number>();
  const overallRatingsByPlayerId = new Map<string, number>();
  const salaryByPlayerId = buildSalaryByPlayerId(overallPlayerRows);

  for (const row of seasonPlayerRows) {
    if (row.seasonRating !== null) {
      seasonRatingsByPlayerId.set(row.playerId, row.seasonRating);
    }
  }

  for (const row of overallPlayerRows) {
    overallRatingsByPlayerId.set(row.playerId, row.overallRating);
  }

  return {
    currentSeasonId: gshlSeasonId,
    previousSeasonId,
    seasonRatingsByPlayerId,
    overallRatingsByPlayerId,
    salaryByPlayerId,
    seasonRanksByPlayerId,
    overallRanksByPlayerId,
    preDraftRanksByPlayerId,
  };
}

async function readPlayerSheet(): Promise<{
  headers: string[];
  rows: PlayerSheetRow[];
}> {
  const optimizedSheetsClient = await getOptimizedSheetsClient();
  const sheetName = SHEETS_CONFIG.SHEETS.Player;
  const rawRows = await optimizedSheetsClient.getValues(
    WORKBOOKS.GENERAL,
    `${sheetName}!A1:ZZ`,
  );

  if (!rawRows.length) {
    throw new Error("[player-bio-sync] Player sheet is empty.");
  }

  const headers = (rawRows[0] ?? []).map((value) => String(value ?? "").trim());
  if (!headers.length) {
    throw new Error("[player-bio-sync] Player sheet header row is empty.");
  }

  const rows: PlayerSheetRow[] = [];
  for (let index = 1; index < rawRows.length; index++) {
    const values = [...(rawRows[index] ?? [])];
    if (!values.length) continue;
    const data: Record<string, PrimitiveCellValue> = {};
    headers.forEach((header, columnIndex) => {
      data[header] = values[columnIndex] ?? "";
    });
    if (!toTrimmedString(data.id)) continue;
    rows.push({
      rowNumber: index + 1,
      values: headers.map((_, columnIndex) => values[columnIndex] ?? ""),
      data,
    });
  }

  return { headers, rows };
}

function determineNextPlayerId(rows: PlayerSheetRow[]): number {
  let maxId = 0;

  for (const row of rows) {
    const numericId = toFiniteNumber(row.data.id);
    if (numericId === null) continue;
    maxId = Math.max(maxId, Math.floor(numericId));
  }

  return maxId + 1;
}

function buildSeasonContextPatch(
  playerId: string,
  nhlContext: PlayerNhlContext,
): Record<string, PrimitiveCellValue> {
  const fields: Record<string, PrimitiveCellValue> = {
    seasonRating: "",
    seasonRk: "",
    overallRating: "",
    overallRk: "",
    salary: "",
  };

  const seasonRating = nhlContext.seasonRatingsByPlayerId.get(playerId);
  if (seasonRating !== undefined) {
    fields.seasonRating = seasonRating;
  }

  const seasonRank = nhlContext.seasonRanksByPlayerId.get(playerId);
  if (seasonRank !== undefined) {
    fields.seasonRk = seasonRank;
  }

  const overallRating = nhlContext.overallRatingsByPlayerId.get(playerId);
  if (overallRating !== undefined) {
    fields.overallRating = overallRating;
  }

  const overallRank = nhlContext.overallRanksByPlayerId.get(playerId);
  if (overallRank !== undefined) {
    fields.overallRk = overallRank;
  }

  const salary = nhlContext.salaryByPlayerId.get(playerId);
  if (salary !== undefined) {
    fields.salary = salary;
  }

  return fields;
}

function buildPlayerStatusPatch(
  playerId: string | null,
  isActive: boolean,
  nhlContext: PlayerNhlContext,
  statusContext: PlayerSeasonStatusContext,
): Record<string, PrimitiveCellValue> {
  const fields: Record<string, PrimitiveCellValue> = {
    isSignable: false,
    isResignable: RESIGNABLE_STATUS.DRAFT,
  };

  const normalizedPlayerId = toTrimmedString(playerId);
  if (!normalizedPlayerId) {
    fields.preDraftRk = "";
    return fields;
  }

  const preDraftRank =
    nhlContext.preDraftRanksByPlayerId.get(normalizedPlayerId);
  fields.preDraftRk = preDraftRank ?? "";

  const futureContracts =
    statusContext.futureContractsByPlayerId.get(normalizedPlayerId) ?? [];
  const currentContracts =
    statusContext.currentContractsByPlayerId.get(normalizedPlayerId) ?? [];
  const offseasonExpiredContracts =
    statusContext.offseasonExpiredContractsByPlayerId.get(normalizedPlayerId) ??
    [];
  const offseasonUfaExpiries =
    statusContext.offseasonUfaExpiryByPlayerId.get(normalizedPlayerId) ?? [];
  const regularSeasonDays =
    statusContext.regularSeasonDaysByPlayerId.get(normalizedPlayerId) ?? 0;
  const meetsDaysRequirement =
    statusContext.minimumSignableDays <= 0 ||
    regularSeasonDays >= statusContext.minimumSignableDays;
  const latestOffseasonExpiredContract = offseasonExpiredContracts[0] ?? null;
  const latestOffseasonExpiryStatus = normalizeExpiryStatus(
    latestOffseasonExpiredContract?.expiryStatus,
  );

  if (!isActive) {
    fields.isSignable = false;
  } else if (currentContracts.length > 0) {
    fields.isSignable = false;
  } else if (offseasonUfaExpiries.length > 0) {
    fields.isSignable = false;
  } else if (latestOffseasonExpiryStatus === RESIGNABLE_STATUS.RFA) {
    fields.isSignable = true;
  } else {
    fields.isSignable = meetsDaysRequirement;
  }

  const latestRelevantContract =
    currentContracts[0] ??
    offseasonExpiredContracts[0] ??
    futureContracts[0] ??
    null;
  const normalizedExpiryStatus = normalizeExpiryStatus(
    latestRelevantContract?.expiryStatus,
  );
  if (normalizedExpiryStatus) {
    fields.isResignable = normalizedExpiryStatus;
  }

  if (DEBUG_PLAYER_ID && normalizedPlayerId === DEBUG_PLAYER_ID) {
    console.log(
      JSON.stringify(
        {
          debugPlayerId: normalizedPlayerId,
          isActive,
          currentContracts: currentContracts.map((contract) => ({
            id: contract.id,
            expiryStatus: contract.expiryStatus,
            expiryDate: contract.expiryDate,
            capHitEndDate: contract.capHitEndDate,
            effectiveEndKey: getContractEffectiveEndKey(contract),
          })),
          offseasonExpiredContracts: offseasonExpiredContracts.map(
            (contract) => ({
              id: contract.id,
              expiryStatus: contract.expiryStatus,
              expiryDate: contract.expiryDate,
              capHitEndDate: contract.capHitEndDate,
              effectiveEndKey: getContractEffectiveEndKey(contract),
            }),
          ),
          offseasonUfaExpiries: offseasonUfaExpiries.map((contract) => ({
            id: contract.id,
            expiryStatus: contract.expiryStatus,
            expiryDate: contract.expiryDate,
            capHitEndDate: contract.capHitEndDate,
            effectiveEndKey: getContractEffectiveEndKey(contract),
          })),
          futureContracts: futureContracts.map((contract) => ({
            id: contract.id,
            expiryStatus: contract.expiryStatus,
            expiryDate: contract.expiryDate,
            capHitEndDate: contract.capHitEndDate,
            effectiveEndKey: getContractEffectiveEndKey(contract),
          })),
          regularSeasonDays,
          minimumSignableDays: statusContext.minimumSignableDays,
          result: {
            isSignable: fields.isSignable,
            isResignable: fields.isResignable,
            preDraftRk: fields.preDraftRk,
          },
        },
        null,
        2,
      ),
    );
  }

  return fields;
}

function buildLatestPlayerDayPatch(
  playerId: string,
  latestPlayerDaySnapshots: Map<string, LatestPlayerDaySnapshot>,
): Record<string, PrimitiveCellValue> {
  const snapshot = latestPlayerDaySnapshots.get(playerId);
  if (!snapshot) return {};

  const latestDayRow = snapshot.row;
  const nhlPos = toTrimmedString(latestDayRow.nhlPos);
  const posGroup =
    normalizePositionGroupToken(latestDayRow.posGroup) ||
    normalizePositionGroupToken(nhlPos);
  const nhlTeam = toTrimmedString(latestDayRow.nhlTeam);
  const fields: Record<string, PrimitiveCellValue> = {};

  if (nhlPos) {
    fields.nhlPos = nhlPos;
  }
  if (posGroup) {
    fields.posGroup = posGroup;
  }
  if (nhlTeam) {
    fields.nhlTeam = nhlTeam;
  }

  return fields;
}

function buildRosterSnapshotPatch(
  playerId: string,
  rosterSnapshotContext: RosterSnapshotContext,
  teamIdToFranchiseId: Map<string, string>,
): Record<string, PrimitiveCellValue> {
  const fields: Record<string, PrimitiveCellValue> = {
    gshlTeamId: "",
  };
  const snapshotRow = rosterSnapshotContext.playerRowsByPlayerId.get(playerId);
  if (!snapshotRow) return fields;

  const rosterTeamId = toTrimmedString(snapshotRow.gshlTeamId);
  fields.gshlTeamId = rosterTeamId
    ? (teamIdToFranchiseId.get(rosterTeamId) ?? "")
    : "";

  return fields;
}

function buildPlayerContextPatch(
  playerId: string | null,
  normalizedPos: string,
  nhlContext: PlayerNhlContext,
  latestPlayerDaySnapshots: Map<string, LatestPlayerDaySnapshot>,
  rosterSnapshotContext: RosterSnapshotContext,
  teamIdToFranchiseId: Map<string, string>,
  isInsert: boolean,
): Record<string, PrimitiveCellValue> {
  const fields: Record<string, PrimitiveCellValue> = {};
  const normalizedPlayerId = toTrimmedString(playerId);

  if (normalizedPlayerId) {
    Object.assign(
      fields,
      buildSeasonContextPatch(normalizedPlayerId, nhlContext),
    );
    Object.assign(
      fields,
      buildLatestPlayerDayPatch(normalizedPlayerId, latestPlayerDaySnapshots),
    );
    Object.assign(
      fields,
      buildRosterSnapshotPatch(
        normalizedPlayerId,
        rosterSnapshotContext,
        teamIdToFranchiseId,
      ),
    );
  }

  if (isInsert) {
    if (!Object.prototype.hasOwnProperty.call(fields, "gshlTeamId")) {
      fields.gshlTeamId = "";
    }
    if (!Object.prototype.hasOwnProperty.call(fields, "nhlPos")) {
      fields.nhlPos = normalizedPos;
    }
    if (!Object.prototype.hasOwnProperty.call(fields, "posGroup")) {
      fields.posGroup = getPosGroup(normalizedPos);
    }
  }

  return fields;
}

function buildInsertPayload(
  id: number,
  apiRow: Record<string, unknown>,
  managedFields: Record<string, PrimitiveCellValue>,
  playerContextFields: Record<string, PrimitiveCellValue>,
  normalizedPos: string,
): Record<string, PrimitiveCellValue> | null {
  const firstName = sanitizeDisplayNamePart(apiRow.p_fn);
  const lastName = sanitizeDisplayNamePart(apiRow.p_ln);
  if (
    !Number.isFinite(id) ||
    id <= 0 ||
    !firstName ||
    !lastName ||
    !normalizedPos
  ) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: Math.floor(id),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    nhlPos: normalizedPos,
    posGroup: getPosGroup(normalizedPos),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...playerContextFields,
    ...managedFields,
  };
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

function parseOptions(argv: string[]): PlayerBioSyncOptions {
  const apply = hasFlag(argv, "--apply");
  const headless = hasFlag(argv, "--headless");
  const currentDateValue = getArgValue(argv, "--current-date");
  const currentDate = currentDateValue
    ? new Date(currentDateValue)
    : new Date();

  if (Number.isNaN(currentDate.getTime())) {
    throw new Error("[player-bio-sync] --current-date must be a valid date.");
  }

  return {
    apply,
    logToConsole: parseBooleanFlag(getArgValue(argv, "--log"), true),
    gshlSeasonId: toTrimmedString(getArgValue(argv, "--gshl-season-id")),
    focusSeason:
      toTrimmedString(getArgValue(argv, "--focus-season")) ||
      DEFAULT_FOCUS_SEASON,
    statSeason:
      toTrimmedString(getArgValue(argv, "--stat-season")) ||
      DEFAULT_STAT_SEASON,
    pageSize: toPositiveInteger(
      getArgValue(argv, "--page-size"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
    maxPages: toPositiveInteger(
      getArgValue(argv, "--max-pages"),
      DEFAULT_MAX_PAGES,
    ),
    currentDate,
    headless,
    browserExecutablePath: resolveBrowserExecutablePath(
      getArgValue(argv, "--browser-path"),
    ),
    userDataDir:
      toTrimmedString(getArgValue(argv, "--user-data-dir")) ||
      DEFAULT_USER_DATA_DIR,
    waitForManualClearanceMs: toPositiveInteger(
      getArgValue(argv, "--wait-ms"),
      DEFAULT_WAIT_FOR_MANUAL_CLEARANCE_MS,
    ),
  };
}

async function run(): Promise<void> {
  if (hasFlag(process.argv.slice(2), "--help")) {
    console.log(HELP_TEXT);
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  const optimizedSheetsClient = await getOptimizedSheetsClient();
  const gshlSeasonId = await resolveCurrentGshlSeasonId(options.gshlSeasonId);
  const summary: PlayerBioSyncSummary = {
    dryRun: !options.apply,
    pagesFetched: 0,
    apiRowsSeen: 0,
    matchedUpdates: 0,
    insertedPlayers: 0,
    ambiguousSheetKeys: 0,
    duplicateApiKeys: 0,
    invalidBirthdays: 0,
    invalidHeights: 0,
    skippedRows: 0,
  };

  const { headers, rows } = await readPlayerSheet();
  const existingIndex = buildExistingPlayerIndex(rows);
  let nextPlayerId = determineNextPlayerId(rows);
  const [
    nhlContext,
    latestPlayerDaySnapshots,
    rosterSnapshotContext,
    teamIdToFranchiseId,
    statusContext,
  ] = await Promise.all([
    buildPlayerNhlContext(gshlSeasonId, rows),
    buildLatestPlayerDaySnapshots(),
    buildRosterSnapshotContext(gshlSeasonId, options.currentDate),
    buildTeamIdToFranchiseIdMapForSeason(gshlSeasonId),
    buildPlayerSeasonStatusContext(gshlSeasonId, options.currentDate),
  ]);
  summary.ambiguousSheetKeys = existingIndex.ambiguousKeys.size;

  console.log(
    `[player-bio-sync] Starting sync dryRun=${summary.dryRun} gshlSeasonId=${gshlSeasonId} rosterTargetDate=${rosterSnapshotContext.targetDateKey || "n/a"} rosterSnapshotDate=${rosterSnapshotContext.snapshotDateKey || "n/a"} pageSize=${options.pageSize} maxPages=${options.maxPages} existingPlayers=${rows.length} ambiguousSheetKeys=${summary.ambiguousSheetKeys} browser=${options.browserExecutablePath} headless=${options.headless}`,
  );

  const browser = await launchBrowser(options);
  const page = await browser.newPage();

  try {
    await waitForSearchPageReady(page, options);

    const seenApiKeys = new Set<string>();
    const touchedExistingRowNumbers = new Set<number>();
    const pendingExistingUpdates: PendingExistingUpdate[] = [];
    const pendingInserts: PendingInsert[] = [];
    const rowUpdates = new Map<number, PrimitiveCellValue[]>();
    const appendRows: PrimitiveCellValue[][] = [];

    for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber++) {
      const apiRows = await fetchPuckPediaRows(page, pageNumber, options);
      summary.pagesFetched++;
      summary.apiRowsSeen += apiRows.length;

      console.log(
        `[player-bio-sync] Page ${pageNumber} returned ${apiRows.length} row(s).`,
      );

      for (const apiRow of apiRows) {
        const normalizedPos = normalizeApiPosition(apiRow.pos);
        const exactMatchKey = buildExactMatchKey(
          apiRow.p_fn,
          apiRow.p_ln,
          normalizedPos,
        );
        const candidateMatchKeys = buildCandidateMatchKeys(
          apiRow.p_fn,
          apiRow.p_ln,
          normalizedPos,
        );

        if (!exactMatchKey || !candidateMatchKeys.length) {
          summary.skippedRows++;
          continue;
        }

        if (seenApiKeys.has(exactMatchKey)) {
          summary.duplicateApiKeys++;
          summary.skippedRows++;
          continue;
        }
        seenApiKeys.add(exactMatchKey);

        const managedFields = buildManagedFieldPatch(
          apiRow,
          options.currentDate,
          summary,
        );
        const existingMatches = resolveExistingPlayerMatches(
          existingIndex,
          apiRow.p_fn,
          apiRow.p_ln,
          normalizedPos,
        );

        if (existingMatches.length > 1) {
          summary.skippedRows++;
          continue;
        }

        const [existingRow] = existingMatches;
        const existingPlayerId = existingRow
          ? toTrimmedString(existingRow.data.id)
          : null;
        const playerContextFields = buildPlayerContextPatch(
          existingPlayerId,
          normalizedPos,
          nhlContext,
          latestPlayerDaySnapshots,
          rosterSnapshotContext,
          teamIdToFranchiseId,
          !existingRow,
        );
        const playerStatusFields = buildPlayerStatusPatch(
          existingPlayerId,
          existingRow ? toBoolean(existingRow.data.isActive) : true,
          nhlContext,
          statusContext,
        );

        if (existingRow) {
          if (
            !existingPlayerId ||
            !hasManagedFields({
              ...managedFields,
              ...playerContextFields,
              ...playerStatusFields,
            })
          ) {
            summary.skippedRows++;
            continue;
          }

          const updatedSource: Record<string, PrimitiveCellValue> = {
            ...playerContextFields,
            ...playerStatusFields,
            ...managedFields,
            updatedAt: new Date().toISOString(),
          };

          pendingExistingUpdates.push({
            row: existingRow,
            playerId: existingPlayerId,
            source: updatedSource,
          });
          touchedExistingRowNumbers.add(existingRow.rowNumber);
          summary.matchedUpdates++;
          continue;
        }

        const assignedPlayerId = nextPlayerId;
        const insertPayload = buildInsertPayload(
          assignedPlayerId,
          apiRow,
          managedFields,
          {
            ...playerContextFields,
            ...playerStatusFields,
          },
          normalizedPos,
        );
        if (!insertPayload) {
          summary.skippedRows++;
          continue;
        }

        nextPlayerId++;
        pendingInserts.push({
          playerId: String(assignedPlayerId),
          payload: insertPayload,
        });
        summary.insertedPlayers++;
      }

      if (apiRows.length === 0 || apiRows.length < options.pageSize) {
        break;
      }
    }

    for (const existingRow of rows) {
      if (touchedExistingRowNumbers.has(existingRow.rowNumber)) {
        continue;
      }

      const existingPlayerId = toTrimmedString(existingRow.data.id);
      if (!existingPlayerId) {
        continue;
      }

      const playerContextFields = buildPlayerContextPatch(
        existingPlayerId,
        "",
        nhlContext,
        latestPlayerDaySnapshots,
        rosterSnapshotContext,
        teamIdToFranchiseId,
        false,
      );
      const playerStatusFields = buildPlayerStatusPatch(
        existingPlayerId,
        toBoolean(existingRow.data.isActive),
        nhlContext,
        statusContext,
      );

      pendingExistingUpdates.push({
        row: existingRow,
        playerId: existingPlayerId,
        source: {
          ...playerContextFields,
          ...playerStatusFields,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const rosterByFranchiseId = new Map<
      string,
      Array<{ playerId: string; nhlPosTokens: string[]; rating: number }>
    >();
    const lineupAssignments = new Map<string, string>();

    for (const pendingUpdate of pendingExistingUpdates) {
      const effectiveRecord = {
        ...pendingUpdate.row.data,
        ...pendingUpdate.source,
      };
      const franchiseId = toTrimmedString(effectiveRecord.gshlTeamId);
      if (!franchiseId) continue;

      const roster = rosterByFranchiseId.get(franchiseId) ?? [];
      roster.push({
        playerId: pendingUpdate.playerId,
        nhlPosTokens: splitNhlPosTokens(effectiveRecord.nhlPos),
        rating: toFiniteNumber(effectiveRecord.seasonRating) ?? 0,
      });
      rosterByFranchiseId.set(franchiseId, roster);
    }

    for (const pendingInsert of pendingInserts) {
      const franchiseId = toTrimmedString(pendingInsert.payload.gshlTeamId);
      if (!franchiseId) continue;

      const roster = rosterByFranchiseId.get(franchiseId) ?? [];
      roster.push({
        playerId: pendingInsert.playerId,
        nhlPosTokens: splitNhlPosTokens(pendingInsert.payload.nhlPos),
        rating: toFiniteNumber(pendingInsert.payload.seasonRating) ?? 0,
      });
      rosterByFranchiseId.set(franchiseId, roster);
    }

    for (const roster of rosterByFranchiseId.values()) {
      if (!roster.length) continue;

      const assignments = buildLineupAssignments(roster);
      for (const player of roster) {
        lineupAssignments.set(
          player.playerId,
          assignments.get(player.playerId) ?? "BN",
        );
      }
    }

    const rosterSizes = [...rosterByFranchiseId.values()].map(
      (roster) => roster.length,
    );
    const totalRosterPlayers = rosterSizes.reduce((sum, size) => sum + size, 0);
    const maxRosterSize = rosterSizes.length ? Math.max(...rosterSizes) : 0;
    console.log(
      `[player-bio-sync] Roster snapshot date=${rosterSnapshotContext.snapshotDateKey || "n/a"} franchises=${rosterByFranchiseId.size} rosterPlayers=${totalRosterPlayers} maxRosterSize=${maxRosterSize}`,
    );

    for (const pendingUpdate of pendingExistingUpdates) {
      const effectiveRecord = {
        ...pendingUpdate.row.data,
        ...pendingUpdate.source,
      };
      const franchiseId = toTrimmedString(effectiveRecord.gshlTeamId);
      pendingUpdate.source.lineupPos = franchiseId
        ? (lineupAssignments.get(pendingUpdate.playerId) ?? "BN")
        : "";
      rowUpdates.set(
        pendingUpdate.row.rowNumber - 1,
        buildRowArray(headers, pendingUpdate.source, pendingUpdate.row.values),
      );
    }

    for (const pendingInsert of pendingInserts) {
      const franchiseId = toTrimmedString(pendingInsert.payload.gshlTeamId);
      pendingInsert.payload.lineupPos = franchiseId
        ? (lineupAssignments.get(pendingInsert.playerId) ?? "BN")
        : "";
      appendRows.push(buildRowArray(headers, pendingInsert.payload));
    }

    if (summary.dryRun) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (rowUpdates.size > 0) {
      await optimizedSheetsClient.updateRowsByIds(
        WORKBOOKS.GENERAL,
        SHEETS_CONFIG.SHEETS.Player,
        rowUpdates,
      );
    }

    if (appendRows.length > 0) {
      await optimizedSheetsClient.appendValuesBatch(
        WORKBOOKS.GENERAL,
        SHEETS_CONFIG.SHEETS.Player,
        appendRows,
      );
    }

    summary.updated = rowUpdates.size;
    summary.inserted = appendRows.length;
    summary.total = rowUpdates.size + appendRows.length;

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
