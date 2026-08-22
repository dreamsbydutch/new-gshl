type StorageRow = Record<string, unknown>;

function validEpochMilliseconds(value: number): number | null {
  return Number.isSafeInteger(value) &&
    Number.isFinite(new Date(value).getTime())
    ? value
    : null;
}

export const DATE_KEY_TABLE_FIELDS = {
  playerDayStatLines: ["date"],
  teamDayStatLines: ["date"],
} as const;

export const UTC_TIMESTAMP_TABLE_FIELDS = {
  authUsers: ["createdAt", "updatedAt", "lastLoginAt"],
  seasons: [
    "startDate",
    "endDate",
    "signingEndDate",
    "draftStartAt",
    "createdAt",
    "updatedAt",
  ],
  conferences: ["createdAt", "updatedAt"],
  owners: ["createdAt", "updatedAt"],
  franchises: ["createdAt", "updatedAt"],
  teams: ["createdAt", "updatedAt"],
  players: ["birthday", "nhlSigningDate", "createdAt", "updatedAt"],
  contracts: [
    "signingDate",
    "startDate",
    "expiryDate",
    "capHitEndDate",
    "createdAt",
    "updatedAt",
  ],
  tradeBlockEntries: ["createdAt", "updatedAt"],
  weeks: ["startDate", "endDate", "createdAt", "updatedAt"],
  matchups: ["createdAt", "updatedAt"],
  events: ["date", "createdAt", "updatedAt"],
  awards: ["createdAt", "updatedAt"],
  playerAwards: ["createdAt", "updatedAt"],
  teamAwards: ["createdAt", "updatedAt"],
  draftPicks: [
    "onClockStartedAt",
    "onClockExpiresAt",
    "onClockEndedAt",
    "createdAt",
    "updatedAt",
  ],
  nhlTeams: ["createdAt", "updatedAt"],
  playerDayStatLines: ["createdAt", "updatedAt"],
  playerDayHighlights: ["createdAt", "updatedAt"],
  playerWeekStatLines: ["createdAt", "updatedAt"],
  playerSplitStatLines: ["createdAt", "updatedAt"],
  playerTotalStatLines: ["createdAt", "updatedAt"],
  playerCareerSplitStatLines: ["createdAt", "updatedAt"],
  playerCareerTotalStatLines: ["createdAt", "updatedAt"],
  playerNhlStatLines: ["createdAt", "updatedAt"],
  teamDayStatLines: ["createdAt", "updatedAt"],
  teamWeekStatLines: ["createdAt", "updatedAt"],
  teamSeasonStatLines: ["createdAt", "updatedAt"],
  seasonDataArchives: [
    "exportedAt",
    "verifiedAt",
    "deletedAt",
    "restoredAt",
    "createdAt",
    "updatedAt",
  ],
  weeklyEditions: [
    "startDate",
    "endDate",
    "publishedAt",
    "scheduledFor",
    "createdAt",
    "updatedAt",
  ],
  weeklyEditionRevisions: ["createdAt"],
  ufaOfferGroups: ["deadlineAt", "createdAt", "resolvedAt", "updatedAt"],
  ufaOffers: ["submittedAt", "updatedAt"],
  jobRuns: ["createdAt", "startedAt", "heartbeatAt", "finishedAt"],
  jobEvents: ["createdAt"],
  jobSchedules: ["nextRunAt", "lastRunAt", "createdAt", "updatedAt"],
  externalTasks: ["leaseExpiresAt", "heartbeatAt", "createdAt", "updatedAt"],
  jobArtifacts: ["createdAt"],
} as const satisfies Record<string, readonly string[]>;

export type TimestampTableName = keyof typeof UTC_TIMESTAMP_TABLE_FIELDS;

export function describeTimestampValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value.toString();
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  return JSON.stringify(value) ?? Object.prototype.toString.call(value);
}

export function toUtcTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") {
    return validEpochMilliseconds(value);
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return validEpochMilliseconds(numeric);
  }

  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function timestampFieldsForTable(table: string): readonly string[] {
  return (
    UTC_TIMESTAMP_TABLE_FIELDS[table as TimestampTableName] ?? ([] as const)
  );
}

export function normalizeTimestampFields(
  table: string,
  row: StorageRow,
): StorageRow {
  const normalized = { ...row };
  for (const field of timestampFieldsForTable(table)) {
    const value = normalized[field];
    if (value === undefined || value === null) continue;
    const timestamp = toUtcTimestamp(value);
    if (timestamp === null) {
      throw new Error(
        `Invalid UTC timestamp for ${table}.${field}: ${describeTimestampValue(value)}`,
      );
    }
    normalized[field] = timestamp;
  }
  return normalized;
}

export function utcTimestampToDateKey(value: unknown): string | null {
  const timestamp = toUtcTimestamp(value);
  return timestamp === null
    ? null
    : new Date(timestamp).toISOString().slice(0, 10);
}
