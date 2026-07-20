/**
 * Usage:
 *   npm run awards:backfill
 *   npm run awards:backfill -- --season-id 11
 *   npm run awards:backfill -- --season-ids 09,10,11 --apply
 *
 * What it does:
 *   Rebuilds season award rows from TeamSeasonStatLine standings/rating fields
 *   and playoff final matchups. Runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-id <id>       Backfill one season.
 *   --season-ids <list>    Backfill a comma-separated list of seasons. Default: all Season rows.
 *   --apply                Persist award rows to Convex.
 *   --log <true|false>     Enable or disable console logging. Default: true.
 *   --stop-on-error        Stop immediately after the first failed season.
 *   --help                 Print the built-in help text and exit.
 */
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { getAppsScriptLineupBuilder } from "@gshl-lib/lineup/apps-script-lineup-builder";
import * as convexStore from "@gshl-lib/data/convex-store";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { MatchupType, SeasonType } from "@gshl-lib/types/enums";
import {
  getArgValue,
  hasFlag,
  toBoolean,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import { mapTeamAwardPodiumToOwners } from "../../domains/awards/team-award-ownership";

type AwardKey =
  | "rocket"
  | "artRoss"
  | "selke"
  | "hart"
  | "vezina"
  | "norris"
  | "calder"
  | "gmoy"
  | "jackAdams"
  | "ladyByng"
  | "gshlCup"
  | "brophy"
  | "president"
  | "sunview"
  | "hickory"
  | "firstAS"
  | "secondAS"
  | "playoffAS"
  | "crosby"
  | "orr"
  | "brodeur"
  | "gretzky"
  | "ovechkin";

type PlayerTrophyKey = "crosby" | "orr" | "brodeur" | "gretzky" | "ovechkin";

type TeamAwardKey = Exclude<
  AwardKey,
  PlayerTrophyKey | "firstAS" | "secondAS" | "playoffAS"
>;

type AwardsBackfillOptions = {
  seasonIds: string[];
  apply: boolean;
  logToConsole: boolean;
  stopOnError: boolean;
};

type PlayerAwardRecord = DatabaseRecord & {
  seasonId: string;
  playerId: string;
  nomineeIds: string[];
  award: AwardKey;
};

type TeamAwardRecord = DatabaseRecord & {
  seasonId: string;
  ownerId: string;
  nomineeIds: string[];
  award: AwardKey;
};

type AwardRecord = PlayerAwardRecord | TeamAwardRecord;

type TeamSeasonRecord = DatabaseRecord & {
  seasonId?: string | number | null;
  seasonType?: string | null;
  gshlTeamId?: string | number | null;
  G?: string | number | null;
  A?: string | number | null;
  P?: string | number | null;
  HIT?: string | number | null;
  BLK?: string | number | null;
  playersUsed?: string | number | null;
  overallRk?: string | number | null;
  conferenceRk?: string | number | null;
  hartRating?: string | number | null;
  hartRk?: string | number | null;
  norrisRating?: string | number | null;
  norrisRk?: string | number | null;
  vezinaRating?: string | number | null;
  vezinaRk?: string | number | null;
  calderRating?: string | number | null;
  calderRk?: string | number | null;
  jackAdamsRating?: string | number | null;
  jackAdamsRk?: string | number | null;
  GMOYRating?: string | number | null;
  GMOYRk?: string | number | null;
};

type PlayerTotalRecord = DatabaseRecord & {
  seasonId?: string | number | null;
  playerId?: string | number | null;
  seasonType?: string | null;
  nhlPos?: string | string[] | null;
  posGroup?: string | null;
  G?: string | number | null;
  A?: string | number | null;
  P?: string | number | null;
  Rating?: string | number | null;
};

type SeasonRecord = DatabaseRecord & {
  id?: string | number | null;
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
  ownerId?: string | number | null;
};

type ConferenceRecord = DatabaseRecord & {
  id?: string | number | null;
  name?: string | null;
  abbr?: string | null;
};

type MatchupRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  weekId?: string | number | null;
  homeTeamId?: string | number | null;
  awayTeamId?: string | number | null;
  gameType?: string | null;
  homeScore?: string | number | null;
  awayScore?: string | number | null;
  homeWin?: boolean | string | number | null;
  awayWin?: boolean | string | number | null;
  tie?: boolean | string | number | null;
  isComplete?: boolean | string | number | null;
};

type WeekRecord = DatabaseRecord & {
  id?: string | number | null;
  seasonId?: string | number | null;
  weekNum?: string | number | null;
  startDate?: string | Date | null;
};

type AwardCandidate = {
  teamId: string;
  value: number;
  rank?: number | null;
  rating?: number | null;
  overallRk?: number | null;
  conferenceRk?: number | null;
};

type AwardPodium = {
  winnerId: string;
  nomineeIds: string[];
};

type AllStarPlayer = {
  playerId: string;
  nhlPos: string[];
  posGroup: string;
  Rating: number;
};

type PlayerTrophyCandidate = {
  playerId: string;
  value: number;
  rating: number | null;
};

type AwardsDataSnapshot = {
  teamSeasons: TeamSeasonRecord[];
  playerTotals: PlayerTotalRecord[];
  teams: TeamRecord[];
  franchises: FranchiseRecord[];
  conferences: ConferenceRecord[];
  matchups: MatchupRecord[];
  weeks: WeekRecord[];
};

type AwardsSeasonSummary = {
  seasonId: string;
  computedAwards: number;
  skippedAwards: AwardKey[];
  awards: AwardRecord[];
};

type AwardsBackfillSummary = {
  apply: boolean;
  seasonIds: string[];
  processedSeasons: number;
  computedAwards: number;
  write: {
    updated: number;
    inserted: number;
    total: number;
    playerAwards: number;
    teamAwards: number;
    applied: boolean;
  };
  failures: Array<{ seasonId: string; message: string }>;
  seasons: AwardsSeasonSummary[];
};

const TEAM_AWARD_KEYS: readonly TeamAwardKey[] = [
  "rocket",
  "artRoss",
  "selke",
  "hart",
  "vezina",
  "norris",
  "calder",
  "gmoy",
  "jackAdams",
  "ladyByng",
  "gshlCup",
  "brophy",
  "president",
  "sunview",
  "hickory",
];

const PLAYER_TROPHY_KEYS: readonly PlayerTrophyKey[] = [
  "crosby",
  "orr",
  "brodeur",
  "gretzky",
  "ovechkin",
];

const AWARD_KEYS: readonly AwardKey[] = [
  ...TEAM_AWARD_KEYS,
  ...PLAYER_TROPHY_KEYS,
  "firstAS",
  "secondAS",
  "playoffAS",
];

const ALL_STAR_SLOTS = [
  { position: "C", eligiblePositions: ["C"] },
  { position: "LW", eligiblePositions: ["LW"] },
  { position: "RW", eligiblePositions: ["RW"] },
  { position: "D", eligiblePositions: ["D"] },
  { position: "D", eligiblePositions: ["D"] },
  { position: "G", eligiblePositions: ["G"] },
] as const;

const HELP_TEXT = `
Usage:
  npm run awards:backfill
  npm run awards:backfill -- --season-id 11
  npm run awards:backfill -- --season-ids 09,10,11
  npm run awards:backfill -- --season-ids 09,10,11 --apply

Options:
  --season-id <id>       Backfill one season.
  --season-ids <list>    Backfill comma-separated season ids. Default: all Season rows.
  --apply                Write Awards rows back to Convex. Omit for dry-run.
  --log <true|false>     Enable or disable console logging. Default: true.
  --stop-on-error        Abort immediately on the first season failure.
  --help                 Show this message and exit.

Requirements:
  CONVEX_PROD_URL, a prod: CONVEX_DEPLOYMENT, or a production CONVEX_DEPLOY_KEY is required.
`.trim();

function compareSeasonIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function parseSeasonIds(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeRecordId(value: unknown): string {
  return toTrimmedString(value);
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
    timeZone: "America/Toronto",
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumber(value: unknown): number {
  return toFiniteNumber(value) ?? 0;
}

function shouldDeriveArtRossPointsFromGoalsAndAssists(
  seasonId: string,
): boolean {
  const seasonNumber = Number.parseInt(seasonId, 10);
  return (
    Number.isFinite(seasonNumber) && seasonNumber >= 1 && seasonNumber <= 2
  );
}

function getArtRossPointsValue(
  row: TeamSeasonRecord,
  seasonId: string,
): number | null {
  const explicitPoints = toFiniteNumber(row.P);
  const goals = toFiniteNumber(row.G);
  const assists = toFiniteNumber(row.A);

  if (shouldDeriveArtRossPointsFromGoalsAndAssists(seasonId)) {
    return goals === null && assists === null
      ? explicitPoints
      : (goals ?? 0) + (assists ?? 0);
  }

  if (explicitPoints !== null) return explicitPoints;
  return goals === null && assists === null
    ? null
    : (goals ?? 0) + (assists ?? 0);
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

function normalizeSearchToken(value: unknown): string {
  return toTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isRegularSeasonRow(row: TeamSeasonRecord): boolean {
  const seasonType = normalizeSearchToken(row.seasonType);
  return (
    !seasonType ||
    seasonType === normalizeSearchToken(SeasonType.REGULAR_SEASON) ||
    seasonType === "regularseason" ||
    seasonType === "rs"
  );
}

function matchesSeasonType(value: unknown, seasonType: SeasonType): boolean {
  const normalized = normalizeSearchToken(value);
  return (
    normalized === normalizeSearchToken(seasonType) ||
    (seasonType === SeasonType.REGULAR_SEASON &&
      (normalized === "" || normalized === "regularseason"))
  );
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
      teamConfId || franchiseConfMap.get(franchiseId) || "";
    if (resolvedConfId) {
      teamConfMap.set(teamId, resolvedConfId);
    }
  }

  return teamConfMap;
}

function getConferenceAliases(
  conference: ConferenceRecord | undefined,
  fallbackAliases: readonly string[],
): string[] {
  return Array.from(
    new Set(
      [
        normalizeRecordId(conference?.id),
        normalizeRecordId(conference?.name),
        normalizeRecordId(conference?.abbr),
        ...fallbackAliases,
      ]
        .map(normalizeSearchToken)
        .filter(Boolean),
    ),
  );
}

function findConferenceByAliases(
  conferences: ConferenceRecord[],
  aliases: readonly string[],
): ConferenceRecord | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeSearchToken));
  return conferences.find((conference) => {
    const tokens = [conference.id, conference.name, conference.abbr].map(
      normalizeSearchToken,
    );
    return tokens.some((token) => token && normalizedAliases.has(token));
  });
}

function isTeamInConference(
  teamId: string,
  conferenceAliases: readonly string[],
  teamConferenceMap: Map<string, string>,
  conferenceById: Map<string, ConferenceRecord>,
): boolean {
  const teamConfId = normalizeRecordId(teamConferenceMap.get(teamId));
  if (!teamConfId) return false;

  const conference = conferenceById.get(teamConfId);
  const tokens = [
    teamConfId,
    conference?.id,
    conference?.name,
    conference?.abbr,
  ].map(normalizeSearchToken);
  const aliasSet = new Set(conferenceAliases.map(normalizeSearchToken));
  return tokens.some((token) => token && aliasSet.has(token));
}

function getCandidateBase(
  row: TeamSeasonRecord,
): Omit<AwardCandidate, "value"> | null {
  const teamId = normalizeRecordId(row.gshlTeamId);
  if (!teamId) return null;

  return {
    teamId,
    overallRk: toFiniteNumber(row.overallRk),
    conferenceRk: toFiniteNumber(row.conferenceRk),
  };
}

function compareNullableRank(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  const leftRank = left ?? Number.POSITIVE_INFINITY;
  const rightRank = right ?? Number.POSITIVE_INFINITY;
  return leftRank - rightRank;
}

function compareAwardCandidatesDesc(
  left: AwardCandidate,
  right: AwardCandidate,
): number {
  if (left.value !== right.value) return right.value - left.value;
  const overallDiff = compareNullableRank(left.overallRk, right.overallRk);
  if (overallDiff !== 0) return overallDiff;
  const conferenceDiff = compareNullableRank(
    left.conferenceRk,
    right.conferenceRk,
  );
  if (conferenceDiff !== 0) return conferenceDiff;
  return left.teamId.localeCompare(right.teamId);
}

function compareAwardCandidatesAsc(
  left: AwardCandidate,
  right: AwardCandidate,
): number {
  if (left.value !== right.value) return left.value - right.value;
  const overallDiff = compareNullableRank(left.overallRk, right.overallRk);
  if (overallDiff !== 0) return overallDiff;
  const conferenceDiff = compareNullableRank(
    left.conferenceRk,
    right.conferenceRk,
  );
  if (conferenceDiff !== 0) return conferenceDiff;
  return left.teamId.localeCompare(right.teamId);
}

function podiumFromSortedCandidates(
  candidates: AwardCandidate[],
  options?: { includeNominees?: boolean },
): AwardPodium | null {
  const winner = candidates[0];
  if (!winner) return null;

  return {
    winnerId: winner.teamId,
    nomineeIds:
      options?.includeNominees === false
        ? []
        : candidates.slice(1, 3).map((candidate) => candidate.teamId),
  };
}

function selectNumericAward(
  rows: TeamSeasonRecord[],
  valueForRow: (row: TeamSeasonRecord) => number | null,
  direction: "desc" | "asc" = "desc",
  options?: { includeNominees?: boolean },
): AwardPodium | null {
  const candidates = rows
    .map((row): AwardCandidate | null => {
      const base = getCandidateBase(row);
      const value = valueForRow(row);
      if (!base || value === null) return null;
      return { ...base, value };
    })
    .filter((candidate): candidate is AwardCandidate => candidate !== null);

  candidates.sort(
    direction === "desc"
      ? compareAwardCandidatesDesc
      : compareAwardCandidatesAsc,
  );

  return podiumFromSortedCandidates(candidates, options);
}

function selectRankAward(
  rows: TeamSeasonRecord[],
  rankField: keyof TeamSeasonRecord,
): AwardPodium | null {
  const candidates = rows
    .map((row): AwardCandidate | null => {
      const base = getCandidateBase(row);
      const rank = toFiniteNumber(row[rankField]);
      if (!base || rank === null) return null;
      return {
        ...base,
        value: rank,
        rank,
      };
    })
    .filter((candidate): candidate is AwardCandidate => candidate !== null);

  candidates.sort((left, right) => {
    const rankDiff = compareNullableRank(left.rank, right.rank);
    if (rankDiff !== 0) return rankDiff;
    return compareAwardCandidatesDesc(left, right);
  });

  return podiumFromSortedCandidates(candidates);
}

function makeTeamAwardRecord(
  seasonId: string,
  award: AwardKey,
  podium: AwardPodium | null,
  ownerIdByTeamId: ReadonlyMap<string, string>,
): TeamAwardRecord | null {
  if (!podium) return null;
  const ownerPodium = mapTeamAwardPodiumToOwners(podium, ownerIdByTeamId);
  if (!ownerPodium) return null;

  return {
    seasonId,
    ...ownerPodium,
    award,
  };
}

function makePlayerAwardRecords(
  seasonId: string,
  award: AwardKey,
  playerIds: string[],
): PlayerAwardRecord[] {
  return playerIds.map((playerId) => ({
    seasonId,
    playerId,
    nomineeIds: [],
    award,
  }));
}

function matchupHasOutcome(matchup: MatchupRecord): boolean {
  if (toBooleanFlag(matchup.homeWin)) return true;
  if (toBooleanFlag(matchup.awayWin)) return true;

  const homeScore = toFiniteNumber(matchup.homeScore);
  const awayScore = toFiniteNumber(matchup.awayScore);
  return homeScore !== null && awayScore !== null;
}

function resolveMatchupWinnerLoser(
  matchup: MatchupRecord,
): { winnerId: string; loserId: string } | null {
  const homeTeamId = normalizeRecordId(matchup.homeTeamId);
  const awayTeamId = normalizeRecordId(matchup.awayTeamId);
  if (!homeTeamId || !awayTeamId) return null;

  if (toBooleanFlag(matchup.homeWin)) {
    return { winnerId: homeTeamId, loserId: awayTeamId };
  }
  if (toBooleanFlag(matchup.awayWin)) {
    return { winnerId: awayTeamId, loserId: homeTeamId };
  }

  const homeScore = toFiniteNumber(matchup.homeScore);
  const awayScore = toFiniteNumber(matchup.awayScore);
  if (homeScore === null || awayScore === null) return null;

  return homeScore >= awayScore
    ? { winnerId: homeTeamId, loserId: awayTeamId }
    : { winnerId: awayTeamId, loserId: homeTeamId };
}

function buildWeekSortMap(weeks: WeekRecord[]): Map<string, number> {
  const weekSortMap = new Map<string, number>();

  for (const week of weeks) {
    const weekId = normalizeRecordId(week.id);
    if (!weekId) continue;

    const weekNum = toFiniteNumber(week.weekNum);
    if (weekNum !== null) {
      weekSortMap.set(weekId, weekNum);
      continue;
    }

    const startDate = toTrimmedString(week.startDate);
    const parsedDate = startDate ? new Date(startDate).getTime() : Number.NaN;
    weekSortMap.set(weekId, Number.isFinite(parsedDate) ? parsedDate : 0);
  }

  return weekSortMap;
}

function compareMatchupsByLatestWeek(
  weekSortMap: Map<string, number>,
  left: MatchupRecord,
  right: MatchupRecord,
): number {
  const leftWeek = weekSortMap.get(normalizeRecordId(left.weekId)) ?? 0;
  const rightWeek = weekSortMap.get(normalizeRecordId(right.weekId)) ?? 0;
  if (leftWeek !== rightWeek) return rightWeek - leftWeek;
  return normalizeRecordId(left.id).localeCompare(normalizeRecordId(right.id));
}

function selectGshlCupAward(
  seasonMatchups: MatchupRecord[],
  seasonWeeks: WeekRecord[],
): AwardPodium | null {
  const weekSortMap = buildWeekSortMap(seasonWeeks);
  const completedPlayoffMatchups = seasonMatchups.filter((matchup) => {
    const gameType = normalizeRecordId(matchup.gameType);
    return (
      gameType !== MatchupType.LOSERS_TOURNAMENT &&
      [
        MatchupType.QUARTER_FINAL,
        MatchupType.SEMI_FINAL,
        MatchupType.FINAL,
      ].includes(gameType as MatchupType) &&
      matchupHasOutcome(matchup)
    );
  });

  const finalMatchup = completedPlayoffMatchups
    .filter(
      (matchup) => normalizeRecordId(matchup.gameType) === MatchupType.FINAL,
    )
    .sort((left, right) =>
      compareMatchupsByLatestWeek(weekSortMap, left, right),
    )[0];

  if (!finalMatchup) return null;

  const finalOutcome = resolveMatchupWinnerLoser(finalMatchup);
  if (!finalOutcome) return null;

  return {
    winnerId: finalOutcome.winnerId,
    nomineeIds: [],
  };
}

function normalizeNhlPosList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeNhlPosList(entry));
  }

  const raw = toTrimmedString(value);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeNhlPosList(parsed);
    }
  } catch {
    // Fall back to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

function selectPlayerTrophy(
  rows: PlayerTotalRecord[],
  valueForRow: (row: PlayerTotalRecord) => number | null,
  eligible: (row: PlayerTotalRecord) => boolean = () => true,
): { playerId: string; nomineeIds: string[] } | null {
  const candidates = rows
    .filter(eligible)
    .map((row): PlayerTrophyCandidate | null => {
      const playerId = normalizeRecordId(row.playerId);
      const value = valueForRow(row);
      if (!playerId || value === null) return null;
      return { playerId, value, rating: toFiniteNumber(row.Rating) };
    })
    .filter(
      (candidate): candidate is PlayerTrophyCandidate => candidate !== null,
    )
    .sort(
      (left, right) =>
        right.value - left.value ||
        (right.rating ?? Number.NEGATIVE_INFINITY) -
          (left.rating ?? Number.NEGATIVE_INFINITY) ||
        left.playerId.localeCompare(right.playerId),
    );
  const winner = candidates[0];
  return winner
    ? {
        playerId: winner.playerId,
        nomineeIds: candidates.slice(1, 3).map((row) => row.playerId),
      }
    : null;
}

function buildPlayerTrophyAwardRows(
  seasonId: string,
  playerTotals: PlayerTotalRecord[],
): PlayerAwardRecord[] {
  const rows = playerTotals.filter(
    (row) =>
      normalizeRecordId(row.seasonId) === seasonId &&
      matchesSeasonType(row.seasonType, SeasonType.REGULAR_SEASON),
  );
  const isDefenseman = (row: PlayerTotalRecord) =>
    normalizeNhlPosList(row.nhlPos).includes("D");
  const isGoaltender = (row: PlayerTotalRecord) =>
    normalizeSearchToken(row.posGroup) === "g" ||
    normalizeNhlPosList(row.nhlPos).includes("G");
  const points = (row: PlayerTotalRecord) => {
    const explicitPoints = toFiniteNumber(row.P);
    const goals = toFiniteNumber(row.G);
    const assists = toFiniteNumber(row.A);
    if (shouldDeriveArtRossPointsFromGoalsAndAssists(seasonId)) {
      return goals === null && assists === null
        ? explicitPoints
        : (goals ?? 0) + (assists ?? 0);
    }
    return (
      explicitPoints ??
      (goals === null && assists === null
        ? null
        : (goals ?? 0) + (assists ?? 0))
    );
  };
  const definitions: Array<
    [PlayerTrophyKey, { playerId: string; nomineeIds: string[] } | null]
  > = [
    ["crosby", selectPlayerTrophy(rows, (row) => toFiniteNumber(row.Rating))],
    [
      "orr",
      selectPlayerTrophy(
        rows,
        (row) => toFiniteNumber(row.Rating),
        isDefenseman,
      ),
    ],
    [
      "brodeur",
      selectPlayerTrophy(
        rows,
        (row) => toFiniteNumber(row.Rating),
        isGoaltender,
      ),
    ],
    ["gretzky", selectPlayerTrophy(rows, points)],
    ["ovechkin", selectPlayerTrophy(rows, (row) => toFiniteNumber(row.G))],
  ];

  return definitions.flatMap(([award, podium]) =>
    podium ? [{ seasonId, award, ...podium }] : [],
  );
}

function buildAllStarPlayers(rows: PlayerTotalRecord[]): AllStarPlayer[] {
  return rows
    .map((row): AllStarPlayer | null => {
      const playerId = normalizeRecordId(row.playerId);
      const rating = toFiniteNumber(row.Rating);
      const posGroup = toTrimmedString(row.posGroup).toUpperCase();
      const nhlPos = normalizeNhlPosList(row.nhlPos);

      if (
        !playerId ||
        rating === null ||
        rating <= 0 ||
        !posGroup ||
        !nhlPos.length
      ) {
        return null;
      }

      return {
        playerId,
        nhlPos,
        posGroup,
        Rating: rating,
      };
    })
    .filter((player): player is AllStarPlayer => player !== null);
}

async function selectAllStarTeam(
  playerPool: AllStarPlayer[],
): Promise<string[]> {
  if (!playerPool.length) return [];

  const lineupBuilder = await getAppsScriptLineupBuilder();
  const assignments = lineupBuilder.findBestLineup(
    playerPool.map((player) => ({
      playerId: player.playerId,
      nhlPos: player.nhlPos,
      posGroup: player.posGroup,
      dailyPos: "BN",
      GP: "1",
      GS: "1",
      IR: "",
      IRplus: "",
      Rating: player.Rating,
    })),
    false,
    [...ALL_STAR_SLOTS],
  );

  const selectedPlayers = playerPool
    .filter((player) => Boolean(assignments[player.playerId]))
    .sort((left, right) => {
      const positionOrder = ["C", "LW", "RW", "D", "G"];
      const leftAssignment = assignments[left.playerId] ?? "";
      const rightAssignment = assignments[right.playerId] ?? "";
      const leftIndex = positionOrder.indexOf(leftAssignment);
      const rightIndex = positionOrder.indexOf(rightAssignment);

      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      if (leftAssignment === "D" && rightAssignment === "D") {
        if (left.Rating !== right.Rating) return right.Rating - left.Rating;
      }

      return left.playerId.localeCompare(right.playerId);
    })
    .map((player) => player.playerId);

  return selectedPlayers.length === ALL_STAR_SLOTS.length
    ? selectedPlayers
    : [];
}

async function buildAllStarAwardRows(
  seasonId: string,
  playerTotals: PlayerTotalRecord[],
): Promise<Record<"firstAS" | "secondAS" | "playoffAS", PlayerAwardRecord[]>> {
  const regularSeasonPool = buildAllStarPlayers(
    playerTotals.filter(
      (row) =>
        normalizeRecordId(row.seasonId) === seasonId &&
        matchesSeasonType(row.seasonType, SeasonType.REGULAR_SEASON),
    ),
  );
  const firstTeamIds = await selectAllStarTeam(regularSeasonPool);
  const firstTeamSet = new Set(firstTeamIds);
  const secondTeamIds = await selectAllStarTeam(
    regularSeasonPool.filter((player) => !firstTeamSet.has(player.playerId)),
  );

  const playoffPool = buildAllStarPlayers(
    playerTotals.filter(
      (row) =>
        normalizeRecordId(row.seasonId) === seasonId &&
        matchesSeasonType(row.seasonType, SeasonType.PLAYOFFS),
    ),
  );
  const playoffTeamIds = await selectAllStarTeam(playoffPool);

  return {
    firstAS: makePlayerAwardRecords(seasonId, "firstAS", firstTeamIds),
    secondAS: makePlayerAwardRecords(seasonId, "secondAS", secondTeamIds),
    playoffAS: makePlayerAwardRecords(seasonId, "playoffAS", playoffTeamIds),
  };
}

async function computeAwardsForSeason(
  seasonId: string,
  snapshot: AwardsDataSnapshot,
): Promise<AwardsSeasonSummary> {
  const regularRows = snapshot.teamSeasons.filter(
    (row) =>
      normalizeRecordId(row.seasonId) === seasonId && isRegularSeasonRow(row),
  );
  const seasonTeams = snapshot.teams.filter(
    (team) => normalizeRecordId(team.seasonId) === seasonId,
  );
  const seasonMatchups = snapshot.matchups.filter(
    (matchup) => normalizeRecordId(matchup.seasonId) === seasonId,
  );
  const seasonWeeks = snapshot.weeks.filter(
    (week) => normalizeRecordId(week.seasonId) === seasonId,
  );
  const teamConferenceMap = buildTeamConferenceMap(
    seasonTeams,
    snapshot.franchises,
  );
  const ownerIdByFranchiseId = new Map(
    snapshot.franchises
      .map(
        (franchise) =>
          [
            normalizeRecordId(franchise.id),
            normalizeRecordId(franchise.ownerId),
          ] as const,
      )
      .filter(([franchiseId, ownerId]) => Boolean(franchiseId && ownerId)),
  );
  const ownerIdByTeamId = new Map(
    seasonTeams
      .map(
        (team) =>
          [
            normalizeRecordId(team.id),
            ownerIdByFranchiseId.get(normalizeRecordId(team.franchiseId)) ?? "",
          ] as const,
      )
      .filter(([teamId, ownerId]) => Boolean(teamId && ownerId)),
  );
  const conferenceById = new Map<string, ConferenceRecord>();
  for (const conference of snapshot.conferences) {
    const conferenceId = normalizeRecordId(conference.id);
    if (conferenceId) conferenceById.set(conferenceId, conference);
  }

  const sunviewConference = findConferenceByAliases(snapshot.conferences, [
    "sunview",
    "sv",
  ]);
  const hickoryConference = findConferenceByAliases(snapshot.conferences, [
    "hickory",
    "hickoryhotel",
    "hh",
  ]);
  const sunviewAliases = getConferenceAliases(sunviewConference, [
    "sunview",
    "sv",
  ]);
  const hickoryAliases = getConferenceAliases(hickoryConference, [
    "hickory",
    "hickoryhotel",
    "hh",
  ]);
  const sunviewRows = regularRows.filter((row) =>
    isTeamInConference(
      normalizeRecordId(row.gshlTeamId),
      sunviewAliases,
      teamConferenceMap,
      conferenceById,
    ),
  );
  const hickoryRows = regularRows.filter((row) =>
    isTeamInConference(
      normalizeRecordId(row.gshlTeamId),
      hickoryAliases,
      teamConferenceMap,
      conferenceById,
    ),
  );

  const awardPodiums: Record<TeamAwardKey, AwardPodium | null> = {
    rocket: selectNumericAward(regularRows, (row) => toFiniteNumber(row.G)),
    artRoss: selectNumericAward(regularRows, (row) =>
      getArtRossPointsValue(row, seasonId),
    ),
    selke: selectNumericAward(regularRows, (row) => {
      const hits = toFiniteNumber(row.HIT);
      const blocks = toFiniteNumber(row.BLK);
      return hits === null && blocks === null
        ? null
        : (hits ?? 0) + (blocks ?? 0);
    }),
    hart: selectRankAward(regularRows, "hartRk"),
    vezina: selectRankAward(regularRows, "vezinaRk"),
    norris: selectRankAward(regularRows, "norrisRk"),
    calder: selectRankAward(regularRows, "calderRk"),
    gmoy: selectRankAward(regularRows, "GMOYRk"),
    jackAdams: selectRankAward(regularRows, "jackAdamsRk"),
    ladyByng: selectNumericAward(regularRows, (row) =>
      toFiniteNumber(row.playersUsed),
    ),
    gshlCup: selectGshlCupAward(seasonMatchups, seasonWeeks),
    brophy: selectNumericAward(
      regularRows,
      (row) => toFiniteNumber(row.overallRk),
      "desc",
      { includeNominees: false },
    ),
    president: selectNumericAward(
      regularRows,
      (row) => toFiniteNumber(row.overallRk),
      "asc",
      { includeNominees: false },
    ),
    sunview: selectNumericAward(
      sunviewRows,
      (row) => toFiniteNumber(row.conferenceRk),
      "asc",
      { includeNominees: false },
    ),
    hickory: selectNumericAward(
      hickoryRows,
      (row) => toFiniteNumber(row.conferenceRk),
      "asc",
      { includeNominees: false },
    ),
  };
  const playerTrophyAwards = buildPlayerTrophyAwardRows(
    seasonId,
    snapshot.playerTotals,
  );
  const allStarAwards = await buildAllStarAwardRows(
    seasonId,
    snapshot.playerTotals,
  );

  const awards = [
    ...TEAM_AWARD_KEYS.map((award) =>
      makeTeamAwardRecord(
        seasonId,
        award,
        awardPodiums[award],
        ownerIdByTeamId,
      ),
    ).filter((award): award is TeamAwardRecord => award !== null),
    ...playerTrophyAwards,
    ...allStarAwards.firstAS,
    ...allStarAwards.secondAS,
    ...allStarAwards.playoffAS,
  ];
  const computedAwardSet = new Set(awards.map((award) => award.award));

  return {
    seasonId,
    computedAwards: awards.length,
    skippedAwards: AWARD_KEYS.filter((award) => !computedAwardSet.has(award)),
    awards,
  };
}

async function loadSnapshot(): Promise<AwardsDataSnapshot> {
  const [
    teamSeasons,
    playerTotals,
    teams,
    franchises,
    conferences,
    matchups,
    weeks,
  ] = await Promise.all([
    fastSheetsReader.fetchModel<TeamSeasonRecord>("TeamSeasonStatLine"),
    fastSheetsReader.fetchModel<PlayerTotalRecord>("PlayerTotalStatLine"),
    fastSheetsReader.fetchModel<TeamRecord>("Team"),
    fastSheetsReader.fetchModel<FranchiseRecord>("Franchise"),
    fastSheetsReader.fetchModel<ConferenceRecord>("Conference"),
    fastSheetsReader.fetchModel<MatchupRecord>("Matchup"),
    fastSheetsReader.fetchModel<WeekRecord>("Week"),
  ]);

  return {
    teamSeasons,
    playerTotals,
    teams,
    franchises,
    conferences,
    matchups,
    weeks,
  };
}

function summarizeWrite(
  total: number,
  applied: boolean,
  counts: { playerAwards: number; teamAwards: number },
  result?: { updated: number; inserted: number; total: number },
): AwardsBackfillSummary["write"] {
  return {
    updated: result?.updated ?? (applied ? total : 0),
    inserted: result?.inserted ?? 0,
    total: result?.total ?? total,
    playerAwards: counts.playerAwards,
    teamAwards: counts.teamAwards,
    applied,
  };
}

function log(
  options: Pick<AwardsBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[awards:backfill] ${message}`);
  }
}

async function getCompletedSeasonIds(): Promise<string[]> {
  const today = getTodayDateString();
  const seasons = await fastSheetsReader.fetchModel<SeasonRecord>("Season");

  return seasons
    .filter((season) => {
      const seasonId = normalizeRecordId(season.id);
      const endDate = formatDateOnly(season.endDate);
      return Boolean(seasonId && endDate && endDate < today);
    })
    .map((season) => normalizeRecordId(season.id))
    .filter(Boolean)
    .sort(compareSeasonIds);
}

async function parseOptions(args: string[]): Promise<AwardsBackfillOptions> {
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
  const completedSeasonIds = await getCompletedSeasonIds();
  const completedSeasonIdSet = new Set(completedSeasonIds);
  const seasonIds = (
    requestedSeasonIds.length ? requestedSeasonIds : completedSeasonIds
  ).filter((seasonId) => completedSeasonIdSet.has(seasonId));

  if (!seasonIds.length) {
    throw new Error(
      "[awards:backfill] No completed season ids found to process.",
    );
  }

  return {
    seasonIds,
    apply: hasFlag(args, "--apply"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    stopOnError: hasFlag(args, "--stop-on-error"),
  };
}

async function runAwardsBackfill(
  options: AwardsBackfillOptions,
): Promise<AwardsBackfillSummary> {
  const snapshot = await loadSnapshot();
  const seasons: AwardsSeasonSummary[] = [];
  const failures: Array<{ seasonId: string; message: string }> = [];

  for (const seasonId of options.seasonIds) {
    try {
      const season = await computeAwardsForSeason(seasonId, snapshot);
      seasons.push(season);
      log(
        options,
        `Season ${seasonId}: computed=${season.computedAwards} skipped=${season.skippedAwards.join(",") || "none"}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      failures.push({ seasonId, message });
      console.error(`[awards:backfill] Season ${seasonId} failed\n${message}`);
      if (options.stopOnError) {
        break;
      }
    }
  }

  const awardRows = seasons.flatMap((season) => season.awards);
  const playerAwardRows = awardRows.filter(
    (award): award is PlayerAwardRecord => "playerId" in award,
  );
  const teamAwardRows = awardRows.filter(
    (award): award is TeamAwardRecord => "ownerId" in award,
  );
  let writeResult:
    | { updated: number; inserted: number; total: number }
    | undefined;
  if (options.apply) {
    let updated = 0;
    let inserted = 0;
    let total = 0;

    for (const season of seasons) {
      const seasonPlayerAwards = season.awards.filter(
        (award): award is PlayerAwardRecord => "playerId" in award,
      );
      const seasonTeamAwards = season.awards.filter(
        (award): award is TeamAwardRecord => "ownerId" in award,
      );
      const playerResult = await convexStore.upsertByCompositeKey(
        "PlayerAward",
        ["seasonId", "award", "playerId"],
        seasonPlayerAwards,
        {
          merge: true,
          deleteMissing: {
            filter: {
              seasonId: season.seasonId,
            },
          },
        },
      );
      const teamResult = await convexStore.upsertByCompositeKey(
        "TeamAward",
        ["seasonId", "award", "ownerId"],
        seasonTeamAwards,
        {
          merge: true,
          deleteMissing: {
            filter: {
              seasonId: season.seasonId,
            },
          },
        },
      );
      updated += playerResult.updated + teamResult.updated;
      inserted += playerResult.inserted + teamResult.inserted;
      total += playerResult.total + teamResult.total;
    }

    writeResult = { updated, inserted, total };
  }

  return {
    apply: options.apply,
    seasonIds: options.seasonIds,
    processedSeasons: seasons.length,
    computedAwards: awardRows.length,
    write: summarizeWrite(
      awardRows.length,
      options.apply,
      {
        playerAwards: playerAwardRows.length,
        teamAwards: teamAwardRows.length,
      },
      writeResult,
    ),
    failures,
    seasons,
  };
}

async function main(): Promise<void> {
  const options = await parseOptions(process.argv.slice(2));
  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} awards rebuild for ${options.seasonIds.length} season(s).`,
  );

  const summary = await runAwardsBackfill(options);
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
