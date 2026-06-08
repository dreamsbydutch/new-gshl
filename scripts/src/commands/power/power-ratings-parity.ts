import path from "node:path";
import { getArgValue, hasFlag, toBoolean } from "@gshl-lib/ranking/player-rating-support";
import { runAppsScriptFunction } from "@gshl-lib/ranking/apps-script-execution";
import { runLocalPowerRankingsSeason } from "../../domains/power/apps-script-power-engine";

type ParityOptions = {
  seasonId: string;
  sampleSize: number;
  weekTypes: string[];
  seasonType: string;
  logToConsole: boolean;
};

type PowerParityResponse = {
  seasonId: string;
  weekUpdates: Array<Record<string, unknown>>;
  seasonUpdates: Array<Record<string, unknown>>;
  matchupUpdates: Array<Record<string, unknown>>;
};

const HELP_TEXT = `
Usage:
  npm run power:parity -- --season-id <id>

Options:
  --season-id <id>      Required season id.
  --sample-size <n>     Number of team-week and matchup rows to compare. Default: 20.
  --week-types <list>   Optional comma-separated week types.
  --season-type <type>  Optional legacy seasonType filter.
  --log <true|false>    Enable or disable console logging. Default: true.
  --help                Show this message and exit.
`.trim();

const TEAM_WEEK_FIELDS = [
  "powerElo",
  "powerEloPre",
  "powerEloPost",
  "powerEloDelta",
  "powerEloExpected",
  "powerEloK",
  "powerStatScore",
  "powerStatEwma",
  "powerTalent",
  "powerHistoryPrior",
  "powerComposite",
  "powerRating",
  "powerRk",
] as const;

const TEAM_SEASON_FIELDS = [
  "powerRk",
] as const;

const MATCHUP_FIELDS = [
  "homeRank",
  "awayRank",
  "rating",
  "ratingPre",
  "ratingRealized",
  "ratingCompetitive",
  "ratingImportance",
  "ratingRosterStrength",
] as const;

function parseList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptions(args: string[]): ParityOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonId = String(getArgValue(args, "--season-id") ?? "").trim();
  if (!seasonId) {
    throw new Error("[power:parity] --season-id is required.");
  }

  const sampleSize = Number(getArgValue(args, "--sample-size") ?? 20);
  return {
    seasonId,
    sampleSize: Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : 20,
    weekTypes: parseList(getArgValue(args, "--week-types")),
    seasonType: String(getArgValue(args, "--season-type") ?? "").trim(),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
  };
}

function normalizeComparableValue(value: unknown): number | string | null {
  if (value === "" || value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return String(value);
}

function compareField(
  left: unknown,
  right: unknown,
  tolerance = 1e-9,
): boolean {
  const normalizedLeft = normalizeComparableValue(left);
  const normalizedRight = normalizeComparableValue(right);
  if (
    typeof normalizedLeft === "number" &&
    typeof normalizedRight === "number"
  ) {
    return Math.abs(normalizedLeft - normalizedRight) <= tolerance;
  }
  return normalizedLeft === normalizedRight;
}

function takeSample<T>(rows: T[], size: number): T[] {
  return rows.slice(0, Math.min(size, rows.length));
}

function buildKey(row: Record<string, unknown>, fields: string[]): string {
  return fields.map((field) => String(row[field] ?? "")).join("::");
}

function compareRows(
  label: string,
  localRows: Array<Record<string, unknown>>,
  remoteRows: Array<Record<string, unknown>>,
  keyFields: string[],
  compareFields: readonly string[],
): Array<{ key: string; field: string; local: unknown; remote: unknown }> {
  const remoteByKey = new Map<string, Record<string, unknown>>();
  for (const row of remoteRows) {
    remoteByKey.set(buildKey(row, keyFields), row);
  }

  const mismatches: Array<{
    key: string;
    field: string;
    local: unknown;
    remote: unknown;
  }> = [];

  for (const row of localRows) {
    const key = buildKey(row, keyFields);
    const remote = remoteByKey.get(key);
    if (!remote) {
      mismatches.push({ key, field: `${label}:missing`, local: row, remote: null });
      continue;
    }

    for (const field of compareFields) {
      if (!compareField(row[field], remote[field])) {
        mismatches.push({
          key,
          field,
          local: row[field],
          remote: remote[field],
        });
      }
    }
  }

  return mismatches;
}

async function main(): Promise<void> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const options = parseOptions(process.argv.slice(2));
  const local = await runLocalPowerRankingsSeason(options.seasonId, {
    weekTypes: options.weekTypes.length ? options.weekTypes : null,
    seasonType: options.seasonType || null,
    dryRun: true,
    returnRows: true,
    logToConsole: options.logToConsole,
  });

  const localWeekUpdates = takeSample(local.weekUpdates ?? [], options.sampleSize);
  const localMatchupUpdates = takeSample(
    local.matchupUpdates ?? [],
    options.sampleSize,
  );
  const localSeasonUpdates = local.seasonUpdates ?? [];

  const remote = await runAppsScriptFunction<PowerParityResponse>(
    "runPowerRankingsParitySample",
    {
      seasonId: options.seasonId,
      weekTypes: options.weekTypes,
      seasonType: options.seasonType || undefined,
      weekKeys: localWeekUpdates.map(
        (row) => `${String(row.gshlTeamId ?? "")}::${String(row.weekId ?? "")}`,
      ),
      matchupIds: localMatchupUpdates.map((row) => String(row.id ?? "")),
      seasonTypes: localSeasonUpdates.map((row) => String(row.seasonType ?? "")),
    },
  );

  const mismatches = [
    ...compareRows(
      "teamWeek",
      localWeekUpdates,
      remote.weekUpdates ?? [],
      ["gshlTeamId", "weekId"],
      TEAM_WEEK_FIELDS,
    ),
    ...compareRows(
      "teamSeason",
      localSeasonUpdates,
      remote.seasonUpdates ?? [],
      ["gshlTeamId", "seasonType"],
      TEAM_SEASON_FIELDS,
    ),
    ...compareRows(
      "matchup",
      localMatchupUpdates,
      remote.matchupUpdates ?? [],
      ["id"],
      MATCHUP_FIELDS,
    ),
  ];

  console.log(
    JSON.stringify(
      {
        seasonId: options.seasonId,
        sampledWeekRows: localWeekUpdates.length,
        sampledSeasonRows: localSeasonUpdates.length,
        sampledMatchupRows: localMatchupUpdates.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 50),
      },
      null,
      2,
    ),
  );

  if (mismatches.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
