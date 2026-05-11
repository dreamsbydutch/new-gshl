/**
 * Usage:
 *   npm run standings:backfill [-- --season-id 11] [--apply]
 *   npm run standings:backfill -- --season-ids 09,10,11 --include-active
 *
 * What it does:
 *   Rebuilds matchup scores, matchup power-rank snapshots, and TeamSeasonStatLine
 *   standings fields for one or more seasons. By default it targets prior
 *   seasons and runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-id <id>       Backfill one season.
 *   --season-ids <list>    Backfill a comma-separated list of seasons.
 *   --apply                Persist matchup and standings updates to Google Sheets.
 *   --include-active       Include the active season when auto-selecting seasons.
 *   --log <true|false>     Enable or disable console logging. Default: true.
 *   --stop-on-error        Stop immediately after the first failed season.
 *   --help                 Print the built-in help text and exit.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { getCompositeKeyColumnsForModel } from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { SeasonType } from "@gshl-lib/types/enums";
import type { Matchup } from "@gshl-lib/types/database";

type BackfillOptions = {
  seasonIds: string[];
  apply: boolean;
  includeActive: boolean;
  logToConsole: boolean;
  stopOnError: boolean;
};

export type StandingsBackfillSeasonSummary = {
  seasonId: string;
  matchupWrite: {
    updated: number;
    inserted: number;
    total: number;
    applied: boolean;
  };
  matchupRankWrite: {
    updated: number;
    inserted: number;
    total: number;
    applied: boolean;
  };
  standingsWrite: {
    updated: number;
    inserted: number;
    total: number;
    applied: boolean;
  };
};

type SeasonRecord = DatabaseRecord & {
  id?: string | number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isActive?: boolean | string | number | null;
};

type WeekRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  weekType?: string | null;
  isComplete?: boolean | string | number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

type TeamRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  confId?: string | number | null;
  franchiseId?: string | number | null;
};

type FranchiseRecord = DatabaseRecord & {
  id?: string | number | null;
  confId?: string | number | null;
};

type TeamWeekRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  weekId?: string | number | null;
  gshlTeamId?: string | number | null;
  powerRk?: string | number | null;
};

type PlayerWeekRecord = DatabaseRecord & {
  seasonId?: string | number | null;
  weekId?: string | number | null;
  gshlTeamId?: string | number | null;
  posGroup?: string | null;
  GS?: string | number | null;
};

type TeamSeasonRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  seasonType?: string | null;
  gshlTeamId?: string | number | null;
  powerRating?: string | number | null;
  conferenceRk?: string | number | null;
};

type MatchupUpdate = Pick<
  Matchup,
  | "id"
  | "seasonId"
  | "weekId"
  | "homeTeamId"
  | "awayTeamId"
  | "homeScore"
  | "awayScore"
  | "homeWin"
  | "awayWin"
  | "tie"
  | "isComplete"
>;

type MatchupRankUpdate = Pick<Matchup, "id" | "homeRank" | "awayRank">;

type TeamSeasonStandingUpdate = {
  id?: string | number;
  gshlTeamId?: string | number | null;
  seasonId?: string | number | null;
  seasonType?: string | null;
  teamW: number;
  teamHW: number;
  teamHL: number;
  teamL: number;
  teamCCW: number;
  teamCCHW: number;
  teamCCHL: number;
  teamCCL: number;
  streak: string;
  overallRk?: number | null;
  conferenceRk?: number | null;
  wildcardRk?: number | null;
};

type RankingEntry = {
  teamId: string;
  confId: string;
  update: TeamSeasonStandingUpdate;
  wins: number;
  teamPoints: number;
  powerRating: number;
};

const MATCHUP_CATEGORY_RULES = [
  { field: "G", higherBetter: true },
  { field: "A", higherBetter: true },
  { field: "P", higherBetter: true },
  { field: "PPP", higherBetter: true },
  { field: "SOG", higherBetter: true },
  { field: "HIT", higherBetter: true },
  { field: "BLK", higherBetter: true },
  { field: "W", higherBetter: true },
  { field: "GAA", higherBetter: false },
  { field: "SVP", higherBetter: true },
] as const;

const GOALIE_CATEGORY_SET = new Set<string>(["W", "GAA", "SVP"]);
const GOALIE_START_MINIMUM = 2;

const HELP_TEXT = `
Usage:
  npm run standings:backfill
  npm run standings:backfill -- --season-id 11
  npm run standings:backfill -- --season-ids 09,10,11
  npm run standings:backfill -- --season-id 11 --apply
  npm run standings:backfill -- --include-active

Options:
  --season-id <id>       Optional single season id to finalize.
  --season-ids <list>    Optional comma-separated season ids. Default: all prior seasons.
  --apply                Write matchup and standings updates back to Google Sheets.
  --include-active       Include the current active season when auto-selecting seasons.
  --log <true|false>     Enable or disable console logging. Default: true.
  --stop-on-error        Abort immediately on the first season failure.
  --help                 Show this message and exit.

Requirements:
  Google Sheets credentials must be configured locally.
`.trim();

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

function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).trim();
  }
  return "";
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseSeasonIds(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function compareSeasonIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function log(options: Pick<BackfillOptions, "logToConsole">, message: string) {
  if (options.logToConsole) {
    console.log(`[standings:backfill] ${message}`);
  }
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBooleanFlag(value: unknown): boolean {
  return (
    value === true ||
    value === "TRUE" ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function formatDateOnly(value: unknown): string {
  if (!value && value !== 0) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  if (
    !(
      value instanceof Date ||
      typeof value === "string" ||
      typeof value === "number"
    )
  ) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateString(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function isWeekCompleteRecord(week: WeekRecord, today: string): boolean {
  if (toBooleanFlag(week.isComplete)) return true;
  const endDate = formatDateOnly(week.endDate);
  return Boolean(endDate && today && today > endDate);
}

function normalizeRecordId(value: unknown): string {
  return toTrimmedString(value);
}

function normalizeStandingsSeasonType(value: unknown): string {
  const seasonType = toTrimmedString(value);
  if (!seasonType) return SeasonType.REGULAR_SEASON;
  if (seasonType === String(SeasonType.LOSERS_TOURNAMENT)) {
    return SeasonType.PLAYOFFS;
  }
  return seasonType;
}

function matchupHasOutcome(matchup: DatabaseRecord): boolean {
  if (toBooleanFlag(matchup.homeWin)) return true;
  if (toBooleanFlag(matchup.awayWin)) return true;
  if (toBooleanFlag(matchup.tie)) return true;

  const homeScore = toNullableNumber(matchup.homeScore);
  const awayScore = toNullableNumber(matchup.awayScore);
  return homeScore !== null && awayScore !== null;
}

function resolveMatchupOutcome(matchup: DatabaseRecord) {
  const homeScore = toNullableNumber(matchup.homeScore);
  const awayScore = toNullableNumber(matchup.awayScore);
  const scoresWereEqual =
    homeScore !== null && awayScore !== null && homeScore === awayScore;

  if (toBooleanFlag(matchup.homeWin)) {
    return { hasOutcome: true, homeWin: true, awayWin: false, scoresWereEqual };
  }

  if (toBooleanFlag(matchup.awayWin)) {
    return { hasOutcome: true, homeWin: false, awayWin: true, scoresWereEqual };
  }

  if (homeScore !== null && awayScore !== null) {
    if (scoresWereEqual) {
      return {
        hasOutcome: true,
        homeWin: true,
        awayWin: false,
        scoresWereEqual: true,
      };
    }

    return {
      hasOutcome: true,
      homeWin: homeScore > awayScore,
      awayWin: awayScore > homeScore,
      scoresWereEqual: false,
    };
  }

  return {
    hasOutcome: false,
    homeWin: false,
    awayWin: false,
    scoresWereEqual: false,
  };
}

function buildWeekStatusMap(weeks: WeekRecord[]) {
  const today = getTodayDateString();
  const map = new Map<
    string,
    { weekType: string; isComplete: boolean; isActive: boolean }
  >();

  for (const week of weeks) {
    const weekId = normalizeRecordId(week.id);
    if (!weekId) continue;

    const startDate = formatDateOnly(week.startDate);
    const endDate = formatDateOnly(week.endDate);
    const isComplete = isWeekCompleteRecord(week, today);
    const isActive =
      !isComplete &&
      Boolean(startDate && endDate && today >= startDate && today <= endDate);

    map.set(weekId, {
      weekType: normalizeStandingsSeasonType(week.weekType),
      isComplete,
      isActive,
    });
  }

  return map;
}

function buildTeamConferenceMap(
  teams: TeamRecord[],
  franchises: FranchiseRecord[],
): Map<string, string> {
  const franchiseConfMap = new Map<string, string>();
  for (const franchise of franchises) {
    const franchiseId = normalizeRecordId(franchise.id);
    const confId = normalizeRecordId(franchise.confId);
    if (franchiseId && confId) {
      franchiseConfMap.set(franchiseId, confId);
    }
  }

  const teamConfMap = new Map<string, string>();
  for (const team of teams) {
    const teamId = normalizeRecordId(team.id);
    if (!teamId) continue;
    const teamConfId = normalizeRecordId(team.confId);
    const franchiseId = normalizeRecordId(team.franchiseId);
    const resolvedConfId =
      teamConfId !== "" ? teamConfId : (franchiseConfMap.get(franchiseId) ?? "");
    if (resolvedConfId) {
      teamConfMap.set(teamId, resolvedConfId);
    }
  }

  return teamConfMap;
}

function buildGoalieStartsByTeamWeek(playerWeeks: PlayerWeekRecord[]) {
  const map = new Map<string, number>();
  for (const playerWeek of playerWeeks) {
    if (toTrimmedString(playerWeek.posGroup) !== "G") continue;
    const teamId = normalizeRecordId(playerWeek.gshlTeamId);
    const weekId = normalizeRecordId(playerWeek.weekId);
    if (!teamId || !weekId) continue;
    const key = `${teamId}|${weekId}`;
    map.set(key, (map.get(key) ?? 0) + toNumber(playerWeek.GS));
  }
  return map;
}

function computeTeamPointsFromRecord(
  teamW: unknown,
  teamHW: unknown,
  teamHL: unknown,
): number {
  const wins = toNumber(teamW);
  const homeWins = toNumber(teamHW);
  const homeLosses = toNumber(teamHL);
  return (wins - homeWins) * 3 + homeWins * 2 + homeLosses;
}

function buildCategoriesForMap(
  matchups: DatabaseRecord[],
  weekIdsInType: Set<string>,
) {
  const map = new Map<string, number>();
  for (const matchup of matchups) {
    const weekId = normalizeRecordId(matchup.weekId);
    if (!weekId || !weekIdsInType.has(weekId) || !matchupHasOutcome(matchup)) {
      continue;
    }
    const homeId = normalizeRecordId(matchup.homeTeamId);
    const awayId = normalizeRecordId(matchup.awayTeamId);
    if (!homeId || !awayId) continue;
    map.set(homeId, (map.get(homeId) ?? 0) + toNumber(matchup.homeScore));
    map.set(awayId, (map.get(awayId) ?? 0) + toNumber(matchup.awayScore));
  }
  return map;
}

function computeHeadToHeadStatsForGroup(
  teamIdSet: Set<string>,
  matchups: DatabaseRecord[],
  weekIdsInType: Set<string>,
) {
  const stats = new Map<
    string,
    {
      h2hW: number;
      h2hHW: number;
      h2hHL: number;
      h2hTeamPoints: number;
      h2hCatsFor: number;
    }
  >();

  for (const teamId of teamIdSet) {
    stats.set(teamId, {
      h2hW: 0,
      h2hHW: 0,
      h2hHL: 0,
      h2hTeamPoints: 0,
      h2hCatsFor: 0,
    });
  }

  for (const matchup of matchups) {
    const weekId = normalizeRecordId(matchup.weekId);
    if (!weekId || !weekIdsInType.has(weekId) || !matchupHasOutcome(matchup)) {
      continue;
    }
    const homeId = normalizeRecordId(matchup.homeTeamId);
    const awayId = normalizeRecordId(matchup.awayTeamId);
    if (
      !homeId ||
      !awayId ||
      !teamIdSet.has(homeId) ||
      !teamIdSet.has(awayId)
    ) {
      continue;
    }

    const homeStats = stats.get(homeId);
    const awayStats = stats.get(awayId);
    if (!homeStats || !awayStats) continue;

    const outcome = resolveMatchupOutcome(matchup);

    homeStats.h2hCatsFor += toNumber(matchup.homeScore);
    awayStats.h2hCatsFor += toNumber(matchup.awayScore);

    if (outcome.homeWin) {
      homeStats.h2hW += 1;
      if (outcome.scoresWereEqual) {
        homeStats.h2hHW += 1;
        awayStats.h2hHL += 1;
      }
    } else if (outcome.awayWin) {
      awayStats.h2hW += 1;
    }
  }

  for (const statsEntry of stats.values()) {
    statsEntry.h2hTeamPoints = computeTeamPointsFromRecord(
      statsEntry.h2hW,
      statsEntry.h2hHW,
      statsEntry.h2hHL,
    );
  }

  return stats;
}

function sortEntriesWithTiebreakers(
  entries: RankingEntry[],
  matchups: DatabaseRecord[],
  weekIdsInType: Set<string>,
  categoriesForMap: Map<string, number>,
): RankingEntry[] {
  const sorted = entries.slice().sort((left, right) => {
    if (left.wins !== right.wins) return right.wins - left.wins;
    if (left.teamPoints !== right.teamPoints) {
      return right.teamPoints - left.teamPoints;
    }
    return left.teamId.localeCompare(right.teamId);
  });

  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (
      end < sorted.length &&
      sorted[end]!.wins === sorted[index]!.wins &&
      sorted[end]!.teamPoints === sorted[index]!.teamPoints
    ) {
      end += 1;
    }

    if (end - index > 1) {
      const group = sorted.slice(index, end);
      const teamIdSet = new Set(group.map((entry) => entry.teamId));
      const h2hStats = computeHeadToHeadStatsForGroup(
        teamIdSet,
        matchups,
        weekIdsInType,
      );

      group.sort((left, right) => {
        const leftH2H = h2hStats.get(left.teamId) ?? {
          h2hW: 0,
          h2hTeamPoints: 0,
          h2hCatsFor: 0,
        };
        const rightH2H = h2hStats.get(right.teamId) ?? {
          h2hW: 0,
          h2hTeamPoints: 0,
          h2hCatsFor: 0,
        };

        if (leftH2H.h2hW !== rightH2H.h2hW) {
          return rightH2H.h2hW - leftH2H.h2hW;
        }
        if (leftH2H.h2hTeamPoints !== rightH2H.h2hTeamPoints) {
          return rightH2H.h2hTeamPoints - leftH2H.h2hTeamPoints;
        }
        if (leftH2H.h2hCatsFor !== rightH2H.h2hCatsFor) {
          return rightH2H.h2hCatsFor - leftH2H.h2hCatsFor;
        }

        const leftCatsFor = categoriesForMap.get(left.teamId) ?? 0;
        const rightCatsFor = categoriesForMap.get(right.teamId) ?? 0;
        if (leftCatsFor !== rightCatsFor) {
          return rightCatsFor - leftCatsFor;
        }

        if (left.powerRating !== right.powerRating) {
          return right.powerRating - left.powerRating;
        }

        return left.teamId.localeCompare(right.teamId);
      });

      for (let groupIndex = 0; groupIndex < group.length; groupIndex += 1) {
        sorted[index + groupIndex] = group[groupIndex]!;
      }
    }

    index = end;
  }

  return sorted;
}

function computeMatchupScore(
  homeWeek: TeamWeekRecord,
  awayWeek: TeamWeekRecord,
  homeGoalieStarts: number,
  awayGoalieStarts: number,
) {
  let homeScore = 0;
  let awayScore = 0;
  const homeHasGoalies = homeGoalieStarts >= GOALIE_START_MINIMUM;
  const awayHasGoalies = awayGoalieStarts >= GOALIE_START_MINIMUM;

  for (const rule of MATCHUP_CATEGORY_RULES) {
    const isGoalieCategory = GOALIE_CATEGORY_SET.has(rule.field);
    if (isGoalieCategory) {
      if (!homeHasGoalies && !awayHasGoalies) continue;
      if (homeHasGoalies && !awayHasGoalies) {
        homeScore += 1;
        continue;
      }
      if (!homeHasGoalies && awayHasGoalies) {
        awayScore += 1;
        continue;
      }
    }

    const homeValue = toNumber(homeWeek[rule.field]);
    const awayValue = toNumber(awayWeek[rule.field]);
    if (homeValue === awayValue) continue;

    const homeWins =
      rule.higherBetter === false
        ? homeValue < awayValue
        : homeValue > awayValue;
    if (homeWins) homeScore += 1;
    else awayScore += 1;
  }

  return { homeScore, awayScore };
}

function summarizeWrite(
  total: number,
  applied: boolean,
  result?: { updated: number; inserted: number; total: number },
) {
  return {
    updated: result?.updated ?? total,
    inserted: result?.inserted ?? 0,
    total: result?.total ?? total,
    applied,
  };
}

function resolveCurrentSeasonId(seasons: SeasonRecord[]): string {
  const today = getTodayDateString();
  const currentSeason = seasons.find((season) => {
    const startDate = formatDateOnly(season.startDate);
    const endDate = formatDateOnly(season.endDate);
    return Boolean(startDate && endDate && startDate <= today && today <= endDate);
  });

  if (currentSeason) {
    return normalizeRecordId(currentSeason.id);
  }

  return normalizeRecordId(
    seasons.find((season) => toBooleanFlag(season.isActive))?.id,
  );
}

async function getDefaultSeasonIds(includeActive: boolean): Promise<string[]> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const seasons = await fastSheetsReader.fetchModel<SeasonRecord>("Season");
  const currentSeasonId = resolveCurrentSeasonId(seasons);

  return seasons
    .map((season) => toTrimmedString(season.id))
    .filter(Boolean)
    .filter((seasonId) => includeActive || seasonId !== currentSeasonId)
    .sort(compareSeasonIds);
}

async function parseOptions(args: string[]): Promise<BackfillOptions> {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const requestedSeasonIds = Array.from(
    new Set(
      [
        toTrimmedString(getArgValue(args, "--season-id")),
        ...parseSeasonIds(getArgValue(args, "--season-ids")),
      ].filter(Boolean),
    ),
  ).sort(compareSeasonIds);

  const includeActive = hasFlag(args, "--include-active");
  const seasonIds = requestedSeasonIds.length
    ? requestedSeasonIds
    : await getDefaultSeasonIds(includeActive);

  if (!seasonIds.length) {
    throw new Error("[standings:backfill] No season ids found to process.");
  }

  return {
    seasonIds,
    apply: hasFlag(args, "--apply"),
    includeActive,
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    stopOnError: hasFlag(args, "--stop-on-error"),
  };
}

export async function rebuildSeasonStandingsForSeasonId(
  seasonId: string,
  apply: boolean,
): Promise<StandingsBackfillSeasonSummary> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const [
    weeks,
    teams,
    franchises,
    teamWeeks,
    playerWeeks,
    matchups,
    teamSeasons,
  ] = await Promise.all([
    fastSheetsReader.fetchModel<WeekRecord>("Week"),
    fastSheetsReader.fetchModel<TeamRecord>("Team"),
    fastSheetsReader.fetchModel<FranchiseRecord>("Franchise"),
    fastSheetsReader.fetchModel<TeamWeekRecord>("TeamWeekStatLine"),
    fastSheetsReader.fetchModel<PlayerWeekRecord>("PlayerWeekStatLine"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Matchup"),
    fastSheetsReader.fetchModel<TeamSeasonRecord>("TeamSeasonStatLine"),
  ]);

  const seasonWeeks = weeks.filter(
    (week) => normalizeRecordId(week.seasonId) === seasonId,
  );
  const seasonTeams = teams.filter(
    (team) => normalizeRecordId(team.seasonId) === seasonId,
  );
  const seasonTeamWeeks = teamWeeks.filter(
    (teamWeek) => normalizeRecordId(teamWeek.seasonId) === seasonId,
  );
  const seasonPlayerWeeks = playerWeeks.filter(
    (playerWeek) => normalizeRecordId(playerWeek.seasonId) === seasonId,
  );
  const seasonMatchups = matchups.filter(
    (matchup) => normalizeRecordId(matchup.seasonId) === seasonId,
  );
  const seasonTeamSeasons = teamSeasons.filter(
    (teamSeason) => normalizeRecordId(teamSeason.seasonId) === seasonId,
  );

  const weekStatusMap = buildWeekStatusMap(seasonWeeks);
  const teamConfMap = buildTeamConferenceMap(seasonTeams, franchises);
  const goalieStartsMap = buildGoalieStartsByTeamWeek(seasonPlayerWeeks);
  const teamWeekByTeamAndWeek = new Map<string, TeamWeekRecord>();

  for (const teamWeek of seasonTeamWeeks) {
    const teamId = normalizeRecordId(teamWeek.gshlTeamId);
    const weekId = normalizeRecordId(teamWeek.weekId);
    if (!teamId || !weekId) continue;
    teamWeekByTeamAndWeek.set(`${teamId}|${weekId}`, teamWeek);
  }

  const matchupUpdates: MatchupUpdate[] = [];
  for (const matchup of seasonMatchups) {
    const weekId = normalizeRecordId(matchup.weekId);
    const status = weekStatusMap.get(weekId);
    if (!weekId || !status || (!status.isActive && !status.isComplete)) {
      continue;
    }

    const homeTeamId = normalizeRecordId(matchup.homeTeamId);
    const awayTeamId = normalizeRecordId(matchup.awayTeamId);
    if (!homeTeamId || !awayTeamId) continue;

    const homeWeek = teamWeekByTeamAndWeek.get(`${homeTeamId}|${weekId}`);
    const awayWeek = teamWeekByTeamAndWeek.get(`${awayTeamId}|${weekId}`);
    if (!homeWeek || !awayWeek) continue;

    const scores = computeMatchupScore(
      homeWeek,
      awayWeek,
      goalieStartsMap.get(`${homeTeamId}|${weekId}`) ?? 0,
      goalieStartsMap.get(`${awayTeamId}|${weekId}`) ?? 0,
    );

    matchupUpdates.push({
      id: normalizeRecordId(matchup.id),
      seasonId,
      weekId,
      homeTeamId,
      awayTeamId,
      homeScore: scores.homeScore,
      awayScore: scores.awayScore,
      isComplete: status.isComplete,
      ...(status.isComplete
        ? {
            tie: false,
            homeWin: scores.homeScore >= scores.awayScore,
            awayWin: scores.homeScore < scores.awayScore,
          }
        : {}),
    });
  }

  const matchupById = new Map<string, DatabaseRecord>();
  for (const matchup of seasonMatchups) {
    const matchupId = normalizeRecordId(matchup.id);
    if (matchupId) matchupById.set(matchupId, matchup);
  }
  for (const update of matchupUpdates) {
    const current = matchupById.get(update.id);
    matchupById.set(update.id, {
      ...(current ?? {}),
      ...update,
    });
  }
  const recalculatedMatchups = Array.from(matchupById.values());

  const matchupRankUpdates: MatchupRankUpdate[] = [];
  const powerRankByTeamWeek = new Map<string, number>();
  for (const teamWeek of seasonTeamWeeks) {
    const teamId = normalizeRecordId(teamWeek.gshlTeamId);
    const weekId = normalizeRecordId(teamWeek.weekId);
    const powerRank = toNullableNumber(teamWeek.powerRk);
    if (!teamId || !weekId || powerRank === null || powerRank <= 0) continue;
    powerRankByTeamWeek.set(`${teamId}|${weekId}`, Math.round(powerRank));
  }
  for (const matchup of recalculatedMatchups) {
    const matchupId = normalizeRecordId(matchup.id);
    const weekId = normalizeRecordId(matchup.weekId);
    const homeTeamId = normalizeRecordId(matchup.homeTeamId);
    const awayTeamId = normalizeRecordId(matchup.awayTeamId);
    if (!matchupId || !weekId || !homeTeamId || !awayTeamId) continue;
    const homeRank = powerRankByTeamWeek.get(`${homeTeamId}|${weekId}`);
    const awayRank = powerRankByTeamWeek.get(`${awayTeamId}|${weekId}`);
    if (homeRank === undefined && awayRank === undefined) continue;
    matchupRankUpdates.push({
      id: matchupId,
      ...(homeRank !== undefined ? { homeRank } : {}),
      ...(awayRank !== undefined ? { awayRank } : {}),
    });
  }

  const weekIdsBySeasonType = new Map<string, Set<string>>();
  for (const seasonType of [SeasonType.REGULAR_SEASON, SeasonType.PLAYOFFS]) {
    weekIdsBySeasonType.set(
      seasonType,
      new Set(
        seasonWeeks
          .filter(
            (week) =>
              normalizeStandingsSeasonType(week.weekType) ===
              String(seasonType),
          )
          .map((week) => normalizeRecordId(week.id))
          .filter(Boolean),
      ),
    );
  }

  const regularSeasonWeekIds =
    weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON) ?? new Set<string>();
  const categoriesForMap = buildCategoriesForMap(
    recalculatedMatchups,
    regularSeasonWeekIds,
  );
  const standingsUpdates: TeamSeasonStandingUpdate[] = [];
  const rankingEntries: RankingEntry[] = [];

  for (const teamSeason of seasonTeamSeasons) {
    const teamId = normalizeRecordId(teamSeason.gshlTeamId);
    if (!teamId) continue;
    const seasonType = normalizeStandingsSeasonType(teamSeason.seasonType);
    const weekIdsInType =
      weekIdsBySeasonType.get(seasonType) ?? regularSeasonWeekIds;

    const teamMatchups = recalculatedMatchups
      .filter((matchup) => {
        const weekId = normalizeRecordId(matchup.weekId);
        if (
          !weekId ||
          !weekIdsInType.has(weekId) ||
          !matchupHasOutcome(matchup)
        ) {
          return false;
        }
        return (
          normalizeRecordId(matchup.homeTeamId) === teamId ||
          normalizeRecordId(matchup.awayTeamId) === teamId
        );
      })
      .sort((left, right) =>
        normalizeRecordId(left.weekId).localeCompare(
          normalizeRecordId(right.weekId),
        ),
      );

    let teamW = 0;
    let teamHW = 0;
    let teamHL = 0;
    let teamL = 0;
    let teamCCW = 0;
    let teamCCHW = 0;
    let teamCCHL = 0;
    let teamCCL = 0;
    const recentResults: string[] = [];

    for (const matchup of teamMatchups) {
      const isHome = normalizeRecordId(matchup.homeTeamId) === teamId;
      const opponentId = isHome
        ? normalizeRecordId(matchup.awayTeamId)
        : normalizeRecordId(matchup.homeTeamId);
      const teamConference = teamConfMap.get(teamId) ?? "";
      const opponentConference = teamConfMap.get(opponentId) ?? "";
      const isConference =
        Boolean(teamConference) && teamConference === opponentConference;

      const outcome = resolveMatchupOutcome(matchup);
      const scoresWereEqual = outcome.scoresWereEqual;
      const isHomeWin = outcome.homeWin;
      const isAwayWin = outcome.awayWin;

      let result = "";
      if (isHome && isHomeWin) {
        teamW += 1;
        if (isConference) teamCCW += 1;
        if (scoresWereEqual) {
          teamHW += 1;
          if (isConference) teamCCHW += 1;
        }
        result = "W";
      } else if (!isHome && isAwayWin) {
        teamW += 1;
        if (isConference) teamCCW += 1;
        result = "W";
      } else if (isHome && isAwayWin) {
        teamL += 1;
        if (isConference) teamCCL += 1;
        result = "L";
      } else if (!isHome && isHomeWin) {
        teamL += 1;
        if (isConference) teamCCL += 1;
        if (scoresWereEqual) {
          teamHL += 1;
          if (isConference) teamCCHL += 1;
        }
        result = "L";
      }

      if (result) {
        recentResults.push(result);
      }
    }

    let streak = "";
    if (recentResults.length > 0) {
      const lastResult = recentResults[recentResults.length - 1]!;
      let streakCount = 1;
      for (let index = recentResults.length - 2; index >= 0; index -= 1) {
        if (recentResults[index] === lastResult) streakCount += 1;
        else break;
      }
      streak = `${streakCount}${lastResult}`;
    }

    const update: TeamSeasonStandingUpdate = {
      ...(teamSeason.id ? { id: teamSeason.id } : {}),
      gshlTeamId: teamSeason.gshlTeamId,
      seasonId: teamSeason.seasonId,
      seasonType,
      teamW,
      teamHW,
      teamHL,
      teamL,
      teamCCW,
      teamCCHW,
      teamCCHL,
      teamCCL,
      streak,
    };

    if (seasonType !== String(SeasonType.REGULAR_SEASON)) {
      update.overallRk = null;
      update.conferenceRk = null;
      update.wildcardRk = null;
    }

    standingsUpdates.push(update);

    if (seasonType === String(SeasonType.REGULAR_SEASON)) {
      rankingEntries.push({
        teamId,
        confId: teamConfMap.get(teamId) ?? "",
        update,
        wins: teamW,
        teamPoints: computeTeamPointsFromRecord(teamW, teamHW, teamHL),
        powerRating: toNumber(teamSeason.powerRating),
      });
    }
  }

  if (rankingEntries.length > 0) {
    const overallSorted = sortEntriesWithTiebreakers(
      rankingEntries,
      recalculatedMatchups,
      regularSeasonWeekIds,
      categoriesForMap,
    );
    overallSorted.forEach((entry, index) => {
      entry.update.overallRk = index + 1;
    });

    const entriesByConference = new Map<string, RankingEntry[]>();
    for (const entry of rankingEntries) {
      if (!entry.confId) continue;
      const current = entriesByConference.get(entry.confId) ?? [];
      current.push(entry);
      entriesByConference.set(entry.confId, current);
    }

    for (const conferenceEntries of entriesByConference.values()) {
      const conferenceSorted = sortEntriesWithTiebreakers(
        conferenceEntries,
        recalculatedMatchups,
        regularSeasonWeekIds,
        categoriesForMap,
      );
      conferenceSorted.forEach((entry, index) => {
        entry.update.conferenceRk = index + 1;
      });
    }

    const wildcardPool = rankingEntries.filter(
      (entry) => entry.confId && toNumber(entry.update.conferenceRk) > 3,
    );
    if (wildcardPool.length > 0) {
      const wildcardSorted = sortEntriesWithTiebreakers(
        wildcardPool,
        recalculatedMatchups,
        regularSeasonWeekIds,
        categoriesForMap,
      );
      wildcardSorted.forEach((entry, index) => {
        entry.update.wildcardRk = index + 1;
      });
    }

    for (const entry of rankingEntries) {
      if (!entry.confId) {
        entry.update.conferenceRk = null;
        entry.update.wildcardRk = null;
      } else if (!(toNumber(entry.update.conferenceRk) > 3)) {
        entry.update.wildcardRk = null;
      }
    }
  }

  const appliedMatchupWrite =
    apply && matchupUpdates.length > 0
      ? await minimalSheetsWriter.upsertByCompositeKey(
          "Matchup",
          ["id"],
          matchupUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
          },
        )
      : undefined;

  const appliedMatchupRankWrite =
    apply && matchupRankUpdates.length > 0
      ? await minimalSheetsWriter.upsertByCompositeKey(
          "Matchup",
          ["id"],
          matchupRankUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
          },
        )
      : undefined;

  const appliedStandingsWrite =
    apply && standingsUpdates.length > 0
      ? await minimalSheetsWriter.upsertByCompositeKey(
          "TeamSeasonStatLine",
          getCompositeKeyColumnsForModel("TeamSeasonStatLine"),
          standingsUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
          },
        )
      : undefined;

  return {
    seasonId,
    matchupWrite: summarizeWrite(
      matchupUpdates.length,
      apply,
      appliedMatchupWrite,
    ),
    matchupRankWrite: summarizeWrite(
      matchupRankUpdates.length,
      apply,
      appliedMatchupRankWrite,
    ),
    standingsWrite: summarizeWrite(
      standingsUpdates.length,
      apply,
      appliedStandingsWrite,
    ),
  };
}

async function main(): Promise<void> {
  const options = await parseOptions(process.argv.slice(2));
  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} standings rebuild for ${options.seasonIds.length} season(s).`,
  );

  const seasons: StandingsBackfillSeasonSummary[] = [];
  const failures: Array<{ seasonId: string; message: string }> = [];

  for (const seasonId of options.seasonIds) {
    try {
      log(options, `Processing season ${seasonId}.`);
      const result = await rebuildSeasonStandingsForSeasonId(
        seasonId,
        options.apply,
      );
      seasons.push(result);
      log(
        options,
        `Season ${seasonId}: matchups=${result.matchupWrite.total} matchupRanks=${result.matchupRankWrite.total} standings=${result.standingsWrite.total}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      failures.push({ seasonId, message });
      console.error(
        `[standings:backfill] Season ${seasonId} failed\n${message}`,
      );
      if (options.stopOnError) {
        break;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        seasonIds: options.seasonIds,
        includeActive: options.includeActive,
        processedSeasons: seasons.length,
        failures,
        seasons,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

const entryScriptPath = process.argv[1];
const isDirectExecution =
  typeof entryScriptPath === "string" &&
  import.meta.url === pathToFileURL(entryScriptPath).href;

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
