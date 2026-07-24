import { getAwardLabel } from "@gshl-lib/config/awards";
import type {
  AwardsList as AwardsListType,
  BuildRecordBookAwardRowsOptions,
  BuildRecordBookPlayerRowsOptions,
  BuildRecordBookPlayerRowsResult,
  FranchiseCareerRow,
  FranchiseSeasonRow,
  NHLTeam,
  Player,
  PlayerAward,
  PlayerCareerSplitStatLine,
  PlayerSplitStatLine,
  RecordBookAwardRow,
  RecordBookPlayerRow,
  RecordBookSortState,
  RecordBookStatColumn,
  RecordBookStatLine,
  SeasonType as SeasonTypeValue,
} from "@gshl-types";
import { formatNumber, toNumber } from "../core";
import { normalizeIdList } from "../core/ids";
import { AwardsList, SeasonType } from "../domain/constants";
import {
  findNhlTeamByAbbreviation,
  formatPlayerPositionList,
} from "../domain/player";
import { getAllStarSeasonType } from "./season-awards";

const PLAYER_AWARD_KEYS = new Set<AwardsListType>([
  AwardsList.CROSBY,
  AwardsList.ORR,
  AwardsList.BRODEUR,
  AwardsList.GRETZKY,
  AwardsList.OVECHKIN,
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const ALL_STAR_AWARD_KEYS = new Set<AwardsListType>([
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const RECORD_BOOK_SEASON_TYPES = new Set<SeasonTypeValue>([
  SeasonType.REGULAR_SEASON,
  SeasonType.PLAYOFFS,
  SeasonType.LOSERS_TOURNAMENT,
]);

const TOTAL_FIELDS: Array<keyof Omit<RecordBookStatLine, "GAA" | "SVP">> = [
  "days",
  "GP",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "TOI",
];

export const RECORD_BOOK_SKATER_COLUMNS: RecordBookStatColumn[] = [
  { key: "days", label: "D", title: "Game days" },
  { key: "GP", label: "GP", title: "Games played" },
  { key: "G", label: "G", title: "Goals" },
  { key: "A", label: "A", title: "Assists" },
  { key: "P", label: "P", title: "Points" },
  { key: "PM", label: "+/-", title: "Plus/minus" },
  { key: "PIM", label: "PIM", title: "Penalty minutes" },
  { key: "PPP", label: "PPP", title: "Power-play points" },
  { key: "SOG", label: "SOG", title: "Shots on goal" },
  { key: "HIT", label: "HIT", title: "Hits" },
  { key: "BLK", label: "BLK", title: "Blocks" },
];

export const RECORD_BOOK_GOALIE_COLUMNS: RecordBookStatColumn[] = [
  { key: "days", label: "D", title: "Game days" },
  { key: "GP", label: "GP", title: "Games played" },
  { key: "GS", label: "GS", title: "Games started" },
  { key: "W", label: "W", title: "Wins" },
  { key: "GA", label: "GA", title: "Goals against" },
  { key: "GAA", label: "GAA", title: "Goals-against average", precision: 2 },
  { key: "SV", label: "SV", title: "Saves" },
  { key: "SA", label: "SA", title: "Shots against" },
  { key: "SVP", label: "SV%", title: "Save percentage", precision: 3 },
  { key: "SO", label: "SO", title: "Shutouts" },
  { key: "TOI", label: "TOI", title: "Time on ice", precision: 1 },
];

function isRecordBookSeasonType(value: string): value is SeasonTypeValue {
  return RECORD_BOOK_SEASON_TYPES.has(value as SeasonTypeValue);
}

function createEmptyStatLine(): RecordBookStatLine {
  return {
    days: 0,
    GP: 0,
    GS: 0,
    G: 0,
    A: 0,
    P: 0,
    PM: 0,
    PIM: 0,
    PPP: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: 0,
    GA: 0,
    SV: 0,
    SA: 0,
    SO: 0,
    TOI: 0,
    GAA: null,
    SVP: null,
  };
}

function addStats(
  target: RecordBookStatLine,
  source: PlayerCareerSplitStatLine | PlayerSplitStatLine,
): void {
  for (const field of TOTAL_FIELDS) {
    target[field] += toNumber(source[field], 0);
  }
}

function finalizeRates<T extends RecordBookStatLine>(row: T): T {
  return {
    ...row,
    GAA: row.TOI > 0 ? (row.GA / row.TOI) * 60 : null,
    SVP: row.SA > 0 ? row.SV / row.SA : null,
  };
}

function getStatLine(row: RecordBookStatLine): RecordBookStatLine {
  return {
    days: row.days,
    GP: row.GP,
    GS: row.GS,
    G: row.G,
    A: row.A,
    P: row.P,
    PM: row.PM,
    PIM: row.PIM,
    PPP: row.PPP,
    SOG: row.SOG,
    HIT: row.HIT,
    BLK: row.BLK,
    W: row.W,
    GA: row.GA,
    SV: row.SV,
    SA: row.SA,
    SO: row.SO,
    TOI: row.TOI,
    GAA: row.GAA,
    SVP: row.SVP,
  };
}

function compareYears(left: number | string, right: number | string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
  });
}

/**
 * Returns the display label for a player award.
 */
export function getPlayerAwardLabel(awardKey: AwardsListType): string {
  if (awardKey === AwardsList.FIRST_AS) return "First Team All-Star";
  if (awardKey === AwardsList.SECOND_AS) return "Second Team All-Star";
  if (awardKey === AwardsList.PLAYOFF_AS) return "Playoff All-Star";
  return getAwardLabel(awardKey);
}

/**
 * Returns a compact player position list with a row-level fallback.
 */
export function getPlayerPositions(
  player: Player | undefined,
  fallbackPositions: string[],
): string {
  const positions =
    fallbackPositions.length > 0 ? fallbackPositions : player?.nhlPos;
  return formatPlayerPositionList(
    Array.isArray(positions) ? positions : String(positions ?? ""),
  );
}

/**
 * Resolves the player's NHL team while preserving historical row data.
 */
export function getNhlTeamForPlayer(
  nhlTeamsByAbbr: Map<string, NHLTeam>,
  player: Player | undefined,
  fallbackAbbr: string,
  preferFallback = false,
): NHLTeam | undefined {
  const historicalAbbr = String(fallbackAbbr).trim();
  const currentAbbr = String(player?.nhlTeam ?? "").trim();
  const teamAbbr =
    (preferFallback
      ? [historicalAbbr, currentAbbr]
      : [currentAbbr, historicalAbbr]
    ).find((value) => value.length > 0) ?? "";
  if (!teamAbbr) return undefined;
  return findNhlTeamByAbbreviation(
    Array.from(nhlTeamsByAbbr.values()),
    teamAbbr,
  );
}

/**
 * Aggregates franchise career split rows by player and season stage.
 */
export function buildFranchiseCareerRows(
  careerSplits: PlayerCareerSplitStatLine[],
  franchiseTeamIds: Set<string>,
): FranchiseCareerRow[] {
  const grouped = new Map<string, FranchiseCareerRow>();

  for (const row of careerSplits) {
    const teamId = String(row.gshlTeamId ?? "");
    const seasonType = String(row.seasonType ?? "");
    const playerId = String(row.playerId ?? "");

    if (
      !franchiseTeamIds.has(teamId) ||
      !playerId ||
      !isRecordBookSeasonType(seasonType)
    ) {
      continue;
    }

    const key = `${playerId}|${seasonType}`;
    const existing = grouped.get(key) ?? {
      playerId,
      seasonType,
      posGroup: String(row.posGroup ?? ""),
      nhlPos: normalizeIdList(row.nhlPos),
      nhlTeam: String(row.nhlTeam ?? "").trim(),
      ...createEmptyStatLine(),
    };

    if (!grouped.has(key)) grouped.set(key, existing);
    if (!existing.posGroup && row.posGroup) {
      existing.posGroup = String(row.posGroup);
    }
    for (const position of normalizeIdList(row.nhlPos)) {
      if (!existing.nhlPos.includes(position)) existing.nhlPos.push(position);
    }
    if (!existing.nhlTeam && row.nhlTeam) {
      existing.nhlTeam = String(row.nhlTeam).trim();
    }
    addStats(existing, row);
  }

  return Array.from(grouped.values()).map(finalizeRates);
}

/**
 * Aggregates franchise season split rows by player, year, and season stage.
 */
export function buildFranchiseSeasonRows(
  seasonSplits: PlayerSplitStatLine[],
  franchiseTeamIds: Set<string>,
  seasonsById: Map<string, number>,
): FranchiseSeasonRow[] {
  const grouped = new Map<string, FranchiseSeasonRow>();

  for (const row of seasonSplits) {
    const teamId = String(row.gshlTeamId ?? "");
    const seasonId = String(row.seasonId ?? "");
    const seasonType = String(row.seasonType ?? "");
    const playerId = String(row.playerId ?? "");

    if (
      !franchiseTeamIds.has(teamId) ||
      !seasonId ||
      !playerId ||
      !isRecordBookSeasonType(seasonType)
    ) {
      continue;
    }

    const key = `${playerId}|${seasonId}|${seasonType}`;
    const existing = grouped.get(key) ?? {
      playerId,
      seasonId,
      seasonYear: seasonsById.get(seasonId) ?? seasonId,
      seasonType,
      posGroup: String(row.posGroup ?? ""),
      nhlPos: normalizeIdList(row.nhlPos),
      nhlTeam: String(row.nhlTeam ?? "").trim(),
      ...createEmptyStatLine(),
    };

    if (!grouped.has(key)) grouped.set(key, existing);
    if (!existing.posGroup && row.posGroup) {
      existing.posGroup = String(row.posGroup);
    }
    for (const position of normalizeIdList(row.nhlPos)) {
      if (!existing.nhlPos.includes(position)) existing.nhlPos.push(position);
    }
    if (!existing.nhlTeam && row.nhlTeam) {
      existing.nhlTeam = String(row.nhlTeam).trim();
    }
    addStats(existing, row);
  }

  return Array.from(grouped.values()).map(finalizeRates);
}

/**
 * Builds display-ready career and by-season player history rows.
 */
export function buildRecordBookPlayerRows(
  options: BuildRecordBookPlayerRowsOptions,
): BuildRecordBookPlayerRowsResult {
  const {
    careerSplits,
    franchiseTeamIds,
    nhlTeamsByAbbr,
    playersById,
    seasonSplits,
    seasonsById,
  } = options;
  const franchiseSeasonRows = buildFranchiseSeasonRows(
    seasonSplits,
    franchiseTeamIds,
    seasonsById,
  );
  const seasonsByPlayerStage = new Map<string, FranchiseSeasonRow[]>();

  for (const row of franchiseSeasonRows) {
    const key = `${row.playerId}|${row.seasonType}`;
    const rows = seasonsByPlayerStage.get(key) ?? [];
    rows.push(row);
    seasonsByPlayerStage.set(key, rows);
  }

  const seasonRows = franchiseSeasonRows.map((row): RecordBookPlayerRow => {
    const player = playersById.get(row.playerId);
    return {
      id: `${row.playerId}|${row.seasonId}|${row.seasonType}`,
      playerId: row.playerId,
      playerName: player?.fullName ?? `Player ${row.playerId}`,
      nhlTeam: getNhlTeamForPlayer(nhlTeamsByAbbr, player, row.nhlTeam, true),
      positions: getPlayerPositions(player, row.nhlPos),
      positionGroup: String(player?.posGroup ?? row.posGroup),
      seasonType: row.seasonType,
      seasonId: row.seasonId,
      seasonYear: row.seasonYear,
      seasonCount: 1,
      firstSeason: row.seasonYear,
      lastSeason: row.seasonYear,
      ...getStatLine(row),
    };
  });

  const careerRows = buildFranchiseCareerRows(
    careerSplits,
    franchiseTeamIds,
  ).map((row): RecordBookPlayerRow => {
    const player = playersById.get(row.playerId);
    const playerSeasons =
      seasonsByPlayerStage.get(`${row.playerId}|${row.seasonType}`) ?? [];
    const years = [
      ...new Set(playerSeasons.map((season) => season.seasonYear)),
    ].sort(compareYears);

    return {
      id: `${row.playerId}|career|${row.seasonType}`,
      playerId: row.playerId,
      playerName: player?.fullName ?? `Player ${row.playerId}`,
      nhlTeam: getNhlTeamForPlayer(nhlTeamsByAbbr, player, row.nhlTeam),
      positions: getPlayerPositions(player, row.nhlPos),
      positionGroup: String(player?.posGroup ?? row.posGroup),
      seasonType: row.seasonType,
      seasonCount: years.length,
      firstSeason: years.at(0),
      lastSeason: years.at(-1),
      ...getStatLine(row),
    };
  });

  return { careerRows, seasonRows };
}

function playerAwardBelongsToFranchise(
  award: PlayerAward,
  teamId: string,
  playerTotals: BuildRecordBookAwardRowsOptions["playerTotals"],
): boolean {
  const awardKey = String(award.award) as AwardsListType;
  const seasonType =
    (ALL_STAR_AWARD_KEYS.has(awardKey)
      ? getAllStarSeasonType(awardKey)
      : SeasonType.REGULAR_SEASON) ?? SeasonType.REGULAR_SEASON;

  return playerTotals.some(
    (row) =>
      String(row.playerId) === String(award.playerId) &&
      String(row.seasonId) === String(award.seasonId) &&
      String(row.seasonType) === String(seasonType) &&
      normalizeIdList(row.gshlTeamIds).includes(teamId),
  );
}

/**
 * Builds one row for every player award won while attached to the franchise.
 */
export function buildRecordBookAwardRows({
  allTeams,
  currentTeam,
  nhlTeamsByAbbr,
  playerAwards,
  playerTotals,
  playersById,
  seasonsById,
}: BuildRecordBookAwardRowsOptions): RecordBookAwardRow[] {
  const teamIdBySeason = new Map(
    allTeams
      .filter(
        (team) => String(team.franchiseId) === String(currentTeam.franchiseId),
      )
      .map((team) => [String(team.seasonId), String(team.id)]),
  );

  return playerAwards
    .flatMap((award): RecordBookAwardRow[] => {
      const awardKey = String(award.award) as AwardsListType;
      const seasonId = String(award.seasonId);
      const teamId = teamIdBySeason.get(seasonId);
      if (
        !teamId ||
        !PLAYER_AWARD_KEYS.has(awardKey) ||
        !playerAwardBelongsToFranchise(award, teamId, playerTotals)
      ) {
        return [];
      }

      const playerId = String(award.playerId);
      const player = playersById.get(playerId);
      const historicalTotal = playerTotals.find(
        (row) =>
          String(row.playerId) === playerId &&
          String(row.seasonId) === seasonId &&
          normalizeIdList(row.gshlTeamIds).includes(teamId),
      );

      return [
        {
          id: String(award.id),
          playerId,
          playerName: player?.fullName ?? `Player ${playerId}`,
          nhlTeam: getNhlTeamForPlayer(
            nhlTeamsByAbbr,
            player,
            String(historicalTotal?.nhlTeam ?? ""),
            true,
          ),
          positions: getPlayerPositions(
            player,
            normalizeIdList(historicalTotal?.nhlPos),
          ),
          seasonYear: seasonsById.get(seasonId) ?? seasonId,
          award: awardKey,
          awardLabel: getPlayerAwardLabel(awardKey),
        },
      ];
    })
    .sort(
      (left, right) =>
        compareYears(right.seasonYear, left.seasonYear) ||
        left.awardLabel.localeCompare(right.awardLabel) ||
        left.playerName.localeCompare(right.playerName),
    );
}

function compareSortValues(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
  direction: RecordBookSortState["direction"],
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  let delta: number;
  if (typeof left === "number" && typeof right === "number") {
    delta = left - right;
  } else {
    delta = String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return direction === "asc" ? delta : -delta;
}

/**
 * Sorts player history rows without mutating hook output.
 */
export function sortRecordBookPlayerRows(
  rows: RecordBookPlayerRow[],
  sort: RecordBookSortState,
): RecordBookPlayerRow[] {
  return rows.slice().sort((left, right) => {
    const key = sort.key === "awardLabel" ? "playerName" : sort.key;
    const delta = compareSortValues(left[key], right[key], sort.direction);
    if (delta !== 0) return delta;
    return left.playerName.localeCompare(right.playerName);
  });
}

/**
 * Sorts player award rows without mutating hook output.
 */
export function sortRecordBookAwardRows(
  rows: RecordBookAwardRow[],
  sort: RecordBookSortState,
): RecordBookAwardRow[] {
  return rows.slice().sort((left, right) => {
    const key =
      sort.key === "playerName" ||
      sort.key === "positions" ||
      sort.key === "seasonYear" ||
      sort.key === "awardLabel"
        ? sort.key
        : "playerName";
    const delta = compareSortValues(left[key], right[key], sort.direction);
    if (delta !== 0) return delta;
    return left.playerName.localeCompare(right.playerName);
  });
}

/**
 * Formats a record-book statistic for the compact table.
 */
export function formatRecordBookStat(
  row: RecordBookPlayerRow,
  column: RecordBookStatColumn,
): string {
  const value = row[column.key];
  if (value == null) return "—";
  return formatNumber(value, column.precision ?? 0);
}
