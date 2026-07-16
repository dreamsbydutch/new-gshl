import { AWARD_CATALOG_BY_KEY } from "@gshl-lib/config/awards";
import { AwardsList, PositionGroup, SeasonType } from "@gshl-types";
import type {
  AwardSummaryRow,
  Awards,
  FranchiseCareerRow,
  GSHLTeam,
  NHLTeam,
  Player,
  PlayerAwardBreakdown,
  PlayerCareerSplitStatLine,
  PlayerTotalStatLine,
  RecordLeader,
  RecordStatKey,
} from "@gshl-types";
import { normalizeIdList } from "../core/ids";
import {
  findNhlTeamByAbbreviation,
  formatPlayerPositionList,
} from "../domain/player";
import { formatNumber, toNumber } from "../core";
import { getAllStarSeasonType } from "./season-awards";

const PLAYER_AWARD_KEYS = new Set<AwardsList>([
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const ALL_STAR_AWARD_KEYS = new Set<AwardsList>([
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const GOALIE_RATE_MINIMUMS: Record<SeasonType, number> = {
  [SeasonType.REGULAR_SEASON]: 10,
  [SeasonType.PLAYOFFS]: 3,
  [SeasonType.LOSERS_TOURNAMENT]: 3,
};

const CAREER_TOTAL_FIELDS: Array<
  keyof Omit<
    FranchiseCareerRow,
    "playerId" | "seasonType" | "posGroup" | "nhlPos" | "nhlTeam" | "GAA" | "SVP"
  >
> = [
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

/**
 * Returns player award label.
 *
 * @param awardKey - The award key to use.
 * @returns The requested player award label.
 */
export function getPlayerAwardLabel(awardKey: AwardsList): string {
  if (awardKey === AwardsList.FIRST_AS) {
    return "First Team All-Star";
  }
  if (awardKey === AwardsList.SECOND_AS) {
    return "Second Team All-Star";
  }
  if (awardKey === AwardsList.PLAYOFF_AS) {
    return "Playoff All-Star";
  }

  return AWARD_CATALOG_BY_KEY.get(awardKey)?.fullName ?? awardKey;
}

/**
 * Returns player positions.
 *
 * @param player - The player to use.
 * @param fallbackPositions - The fallback positions to use.
 * @returns The requested player positions.
 */
export function getPlayerPositions(
  player: Player | undefined,
  fallbackPositions: string[],
): string {
  const positions = player?.nhlPos ?? fallbackPositions;
  return formatPlayerPositionList(
    Array.isArray(positions) ? positions : String(positions ?? ""),
  );
}

/**
 * Returns nhl team for player.
 *
 * @param nhlTeamsByAbbr - The nhl teams by abbr to use.
 * @param player - The player to use.
 * @param fallbackAbbr - The fallback abbr to use.
 * @returns The requested nhl team for player.
 */
export function getNhlTeamForPlayer(
  nhlTeamsByAbbr: Map<string, NHLTeam>,
  player: Player | undefined,
  fallbackAbbr: string,
): NHLTeam | undefined {
  const teamAbbr = String(player?.nhlTeam ?? fallbackAbbr ?? "").trim();
  if (!teamAbbr) return undefined;
  return nhlTeamsByAbbr.get(teamAbbr);
}

/**
 * Formats record value for display.
 *
 * @param stat - The stat to use.
 * @param value - The source value to process.
 * @returns The formatted record value.
 */
export function formatRecordValue(stat: RecordStatKey, value: number): string {
  if (stat === "SVP") {
    return formatNumber(value, 3);
  }
  if (stat === "GAA") {
    return formatNumber(value, 2);
  }
  return formatNumber(value, 0);
}

/**
 * Builds franchise career rows.
 *
 * @param careerSplits - The career splits to use.
 * @param franchiseTeamIds - The franchise team ids to use.
 * @returns The assembled franchise career rows.
 */
export function buildFranchiseCareerRows(
  careerSplits: PlayerCareerSplitStatLine[],
  franchiseTeamIds: Set<string>,
): FranchiseCareerRow[] {
  const grouped = new Map<string, FranchiseCareerRow>();

  for (const row of careerSplits) {
    const teamId = String(row.gshlTeamId ?? "");
    const seasonType = String(row.seasonType ?? "") as SeasonType;
    const playerId = String(row.playerId ?? "");

    if (!franchiseTeamIds.has(teamId) || !playerId) {
      continue;
    }
    if (
      seasonType !== SeasonType.REGULAR_SEASON &&
      seasonType !== SeasonType.PLAYOFFS
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

    if (!grouped.has(key)) {
      grouped.set(key, existing);
    }

    if (!existing.posGroup && row.posGroup) {
      existing.posGroup = String(row.posGroup);
    }

    for (const position of normalizeIdList(row.nhlPos)) {
      if (!existing.nhlPos.includes(position)) {
        existing.nhlPos.push(position);
      }
    }

    if (!existing.nhlTeam && row.nhlTeam) {
      existing.nhlTeam = String(row.nhlTeam).trim();
    }

    for (const field of CAREER_TOTAL_FIELDS) {
      existing[field] += toNumber(row[field], 0);
    }
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    GAA: row.TOI > 0 ? (row.GA / row.TOI) * 60 : null,
    SVP: row.SA > 0 ? row.SV / row.SA : null,
  }));
}

/**
 * Finds leader.
 *
 * @param rows - The rows to use.
 * @param playersById - The players by id to use.
 * @param nhlTeamsByAbbr - The nhl teams by abbr to use.
 * @param definition - The definition to use.
 * @param options - Configuration options for the operation.
 * @returns The matching leader, if one exists.
 */
export function findLeader(
  rows: FranchiseCareerRow[],
  playersById: Map<string, Player>,
  nhlTeamsByAbbr: Map<string, NHLTeam>,
  definition: { key: string; label: string; stat: RecordStatKey },
  options: {
    seasonType: SeasonType;
    group: "all" | "skater" | "goalie";
  },
): RecordLeader | null {
  const filtered = rows.filter((row) => {
    if (row.seasonType !== options.seasonType) {
      return false;
    }

    const player = playersById.get(row.playerId);
    const posGroup = player?.posGroup ?? row.posGroup;

    const isGoalie = String(posGroup) === String(PositionGroup.G);

    if (options.group === "skater" && isGoalie) {
      return false;
    }
    if (options.group === "goalie" && !isGoalie) {
      return false;
    }

    const value = row[definition.stat];
    if (value == null || !Number.isFinite(value)) {
      return false;
    }

    if ((definition.stat === "GAA" || definition.stat === "SVP") && row.GS <= 0) {
      return false;
    }

    if (definition.stat === "GAA" || definition.stat === "SVP") {
      return row.GS >= GOALIE_RATE_MINIMUMS[options.seasonType];
    }

    return value > 0;
  });

  if (filtered.length === 0) {
    return null;
  }

  const sorted = filtered.slice().sort((left, right) => {
    const leftValue = left[definition.stat];
    const rightValue = right[definition.stat];

    if (definition.stat === "GAA") {
      if (leftValue !== rightValue) {
        return (leftValue ?? Number.POSITIVE_INFINITY) -
          (rightValue ?? Number.POSITIVE_INFINITY);
      }
    } else if ((rightValue ?? -Infinity) !== (leftValue ?? -Infinity)) {
      return (rightValue ?? -Infinity) - (leftValue ?? -Infinity);
    }

    if (right.GP !== left.GP) {
      return right.GP - left.GP;
    }

    const leftName = playersById.get(left.playerId)?.fullName ?? left.playerId;
    const rightName = playersById.get(right.playerId)?.fullName ?? right.playerId;
    return leftName.localeCompare(rightName);
  });

  const leader = sorted[0];
  if (!leader) {
    return null;
  }

  const player = playersById.get(leader.playerId);
  const nhlTeam = getNhlTeamForPlayer(
    nhlTeamsByAbbr,
    player,
    leader.nhlTeam,
  );

  return {
    key: definition.key,
    label: definition.label,
    playerId: leader.playerId,
    playerName: player?.fullName ?? `Player ${leader.playerId}`,
    nhlTeam,
    positions: getPlayerPositions(player, leader.nhlPos),
    displayValue: formatRecordValue(
      definition.stat,
      toNumber(leader[definition.stat], 0),
    ),
    note:
      definition.stat === "GAA" || definition.stat === "SVP"
        ? `Min ${GOALIE_RATE_MINIMUMS[options.seasonType]} starts`
        : undefined,
  };
}

/**
 * Builds award summary rows.
 *
 * @returns The assembled award summary rows.
 */
export function buildAwardSummaryRows({
  allAwards,
  allTeams,
  currentTeam,
  nhlTeamsByAbbr,
  playerTotals,
  playersById,
  seasonsById,
}: {
  allAwards: Awards[];
  allTeams: GSHLTeam[];
  currentTeam: GSHLTeam;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
  playerTotals: PlayerTotalStatLine[];
  playersById: Map<string, Player>;
  seasonsById: Map<string, number>;
}): AwardSummaryRow[] {
  const franchiseTeams = allTeams.filter(
    (team) => String(team.franchiseId) === String(currentTeam.franchiseId),
  );
  const teamIdBySeason = new Map<string, string>(
    franchiseTeams.map((team) => [String(team.seasonId), String(team.id)]),
  );
  const summaryMap = new Map<string, PlayerAwardBreakdown>();

  for (const award of allAwards) {
    const awardKey = String(award.award) as AwardsList;
    if (!PLAYER_AWARD_KEYS.has(awardKey)) {
      continue;
    }

    const seasonId = String(award.seasonId);
    const teamId = teamIdBySeason.get(seasonId);
    if (!teamId) {
      continue;
    }

    const playerId = String(award.winnerId);
    const seasonType =
      (ALL_STAR_AWARD_KEYS.has(awardKey)
        ? getAllStarSeasonType(awardKey)
        : SeasonType.REGULAR_SEASON) ?? SeasonType.REGULAR_SEASON;

    const belongsToFranchise = playerTotals.some((row) => {
      return (
        String(row.playerId) === playerId &&
        String(row.seasonId) === seasonId &&
        String(row.seasonType) === String(seasonType) &&
        normalizeIdList(row.gshlTeamIds).includes(teamId)
      );
    });

    if (!belongsToFranchise) {
      continue;
    }

    const seasonYear = seasonsById.get(seasonId) ?? seasonId;
    const existing = summaryMap.get(playerId) ?? {
      playerId,
      counts: new Map<AwardsList, number>(),
      totalAwards: 0,
      firstTeamAllStars: 0,
      secondTeamAllStars: 0,
      playoffAllStars: 0,
      latestYear: seasonYear,
    };

    if (!summaryMap.has(playerId)) {
      summaryMap.set(playerId, existing);
    }

    existing.totalAwards += 1;
    if (awardKey === AwardsList.FIRST_AS) {
      existing.firstTeamAllStars += 1;
    } else if (awardKey === AwardsList.SECOND_AS) {
      existing.secondTeamAllStars += 1;
    } else if (awardKey === AwardsList.PLAYOFF_AS) {
      existing.playoffAllStars += 1;
    }
    existing.counts.set(awardKey, (existing.counts.get(awardKey) ?? 0) + 1);

    if (Number(seasonYear) > Number(existing.latestYear)) {
      existing.latestYear = seasonYear;
    }
  }

  return Array.from(summaryMap.values())
    .map((summary) => {
      const player = playersById.get(summary.playerId);
      const breakdown = Array.from(summary.counts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }
          return getPlayerAwardLabel(left[0]).localeCompare(
            getPlayerAwardLabel(right[0]),
          );
        })
        .map(([awardKey, count]) => `${count}x ${getPlayerAwardLabel(awardKey)}`)
        .join(", ");

      return {
        playerId: summary.playerId,
        playerName: player?.fullName ?? `Player ${summary.playerId}`,
        nhlTeam: findNhlTeamByAbbreviation(
          Array.from(nhlTeamsByAbbr.values()),
          String(player?.nhlTeam ?? ""),
        ),
        positions: getPlayerPositions(player, []),
        totalAwards: summary.totalAwards,
        firstTeamAllStars: summary.firstTeamAllStars,
        secondTeamAllStars: summary.secondTeamAllStars,
        playoffAllStars: summary.playoffAllStars,
        latestYear: summary.latestYear,
        breakdown,
      };
    })
    .sort((left, right) => {
      if (right.totalAwards !== left.totalAwards) {
        return right.totalAwards - left.totalAwards;
      }
      if (right.firstTeamAllStars !== left.firstTeamAllStars) {
        return right.firstTeamAllStars - left.firstTeamAllStars;
      }
      if (right.secondTeamAllStars !== left.secondTeamAllStars) {
        return right.secondTeamAllStars - left.secondTeamAllStars;
      }
      if (right.playoffAllStars !== left.playoffAllStars) {
        return right.playoffAllStars - left.playoffAllStars;
      }
      return left.playerName.localeCompare(right.playerName);
    });
}
