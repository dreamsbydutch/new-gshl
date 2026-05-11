import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";

type PlayerDayDerivedRecord = DatabaseRecord & {
  date?: unknown;
  ADD?: unknown;
  MS?: unknown;
  BS?: unknown;
};

const BENCH_DAILY_POSITIONS = new Set(["BN", "IR", "IR+"]);
const NON_GOALIE_STARTING_FULL_POSITIONS = new Set([
  "LW",
  "C",
  "RW",
  "D",
  "UTIL",
]);

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function toUpperToken(value: unknown): string {
  return toTrimmedString(value).toUpperCase();
}

function buildPresenceKey(playerId: string, teamId: string, date: string): string {
  return `${playerId}|${teamId}|${date}`;
}

function buildRowKey(row: DatabaseRecord): string {
  return [
    toTrimmedString(row.seasonId),
    toTrimmedString(row.gshlTeamId),
    toTrimmedString(row.playerId),
    normalizeDateOnlyValue(row.date) ?? "",
  ].join("|");
}

function getPreviousDateKey(dateKey: string): string {
  const normalized = normalizeDateOnlyValue(dateKey);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return "";
  const previousDate = new Date(Date.UTC(year, month - 1, day));
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

export function computePlayerDayAddValue(
  row: DatabaseRecord,
  presenceSet: ReadonlySet<string>,
  datePresenceSet: ReadonlySet<string>,
): string {
  const playerId = toTrimmedString(row.playerId);
  const teamId = toTrimmedString(row.gshlTeamId);
  const dateKey = normalizeDateOnlyValue(row.date) ?? "";
  if (!playerId || !teamId || !dateKey) return "";

  const previousDateKey = getPreviousDateKey(dateKey);
  if (!previousDateKey || !datePresenceSet.has(previousDateKey)) {
    return "";
  }

  return presenceSet.has(buildPresenceKey(playerId, teamId, previousDateKey))
    ? ""
    : "1";
}

export function computePlayerDayLineupFlags(row: DatabaseRecord): {
  MS: string;
  BS: string;
} {
  if (toUpperToken(row.posGroup) === "G") {
    return { MS: "", BS: "" };
  }

  const played = toTrimmedString(row.GP) === "1";
  if (!played) {
    return { MS: "", BS: "" };
  }

  const dailyPos = toUpperToken(row.dailyPos);
  const fullPos = toUpperToken(row.fullPos);
  const bestPos = toUpperToken(row.bestPos);

  const MS =
    BENCH_DAILY_POSITIONS.has(dailyPos) &&
    NON_GOALIE_STARTING_FULL_POSITIONS.has(fullPos)
      ? "1"
      : "";
  const BS = fullPos === "BN" && !!bestPos && bestPos !== "BN" ? "1" : "";

  return { MS, BS };
}

export function applyPlayerDayDerivedColumns<T extends PlayerDayDerivedRecord>(
  targetRows: T[],
  contextRows: readonly DatabaseRecord[],
): void {
  const mergedRows = new Map<string, DatabaseRecord>();

  for (const row of contextRows) {
    const key = buildRowKey(row);
    if (!key) continue;
    mergedRows.set(key, row);
  }

  for (const row of targetRows) {
    const key = buildRowKey(row);
    if (!key) continue;
    mergedRows.set(key, row);
  }

  const presenceSet = new Set<string>();
  const datePresenceSet = new Set<string>();

  for (const row of mergedRows.values()) {
    const playerId = toTrimmedString(row.playerId);
    const teamId = toTrimmedString(row.gshlTeamId);
    const dateKey = normalizeDateOnlyValue(row.date) ?? "";
    if (!playerId || !teamId || !dateKey) continue;
    presenceSet.add(buildPresenceKey(playerId, teamId, dateKey));
    datePresenceSet.add(dateKey);
  }

  for (const row of targetRows) {
    const normalizedDate = normalizeDateOnlyValue(row.date);
    if (normalizedDate) {
      row.date = normalizedDate;
    }
    row.ADD = computePlayerDayAddValue(row, presenceSet, datePresenceSet);
    const flags = computePlayerDayLineupFlags(row);
    row.MS = flags.MS;
    row.BS = flags.BS;
  }
}
