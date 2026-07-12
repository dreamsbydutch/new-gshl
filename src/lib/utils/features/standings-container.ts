/**
 * Standings Container Utility Functions
 *
 * Contains constants, grouping logic, and helper functions for the StandingsContainer component.
 * Type definitions have been moved to @gshl-types/ui-components
 */

import type { GSHLTeam, Matchup, TeamSeasonStatLine, Week } from "@gshl-types";
import type { StandingsGroup } from "@gshl-types";

// Re-export types for backward compatibility
export type {
  StandingsType,
  StandingsOption,
  StandingsGroup,
  StandingsContainerProps,
  StandingsItemProps,
  StandingsTeamInfoProps as TeamInfoProps,
  PlayoffProbType,
} from "@gshl-types";

export const CONFERENCE_ABBREVIATIONS = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

export const CONFERENCE_TITLES = {
  SUNVIEW: "Sunview",
  HICKORY_HOTEL: "Hickory Hotel",
} as const;

export const STANDINGS_TYPES = {
  OVERALL: "overall",
  CONFERENCE: "conference",
  WILDCARD: "wildcard",
  PLAYOFF: "playoff",
} as const;

export const OVERALL_SEED_FIELDS = [
  "OneSeed",
  "TwoSeed",
  "ThreeSeed",
  "FourSeed",
  "FiveSeed",
  "SixSeed",
  "SevenSeed",
  "EightSeed",
  "NineSeed",
  "TenSeed",
  "ElevenSeed",
  "TwelveSeed",
  "ThirteenSeed",
  "FourteenSeed",
  "FifteenSeed",
  "SixteenSeed",
] as const;

export const CONFERENCE_SEED_FIELDS = [
  "OneConf",
  "TwoConf",
  "ThreeConf",
  "FourConf",
  "FiveConf",
  "SixConf",
  "SevenConf",
  "EightConf",
] as const;

export const WILDCARD_FIELDS = [
  "PlayoffsPer",
  "LoserPer",
  "SFPer",
  "FinalPer",
  "CupPer",
] as const;

export const LOSERS_TOURNEY_FIELDS = [
  "1stPickPer",
  "3rdPickPer",
  "4thPickPer",
  "8thPickPer",
] as const;

/**
 * Groups teams based on standings type
 */
export const groupTeamsByStandingsType = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  standingsType: string,
): StandingsGroup[] => {
  switch (standingsType) {
    case STANDINGS_TYPES.OVERALL:
      return [
        {
          title: "Overall",
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
            .sort(
              (a, b) =>
                +(a.seasonStats?.overallRk ?? 0) -
                +(b.seasonStats?.overallRk ?? 0),
            ),
        },
      ];

    case STANDINGS_TYPES.CONFERENCE:
      return [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.SUNVIEW,
          ).sort(
            (a, b) =>
              +(a.seasonStats?.conferenceRk ?? 0) -
              +(b.seasonStats?.conferenceRk ?? 0),
          ),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          ).sort(
            (a, b) =>
              +(a.seasonStats?.conferenceRk ?? 0) -
              +(b.seasonStats?.conferenceRk ?? 0),
          ),
        },
      ];

    case STANDINGS_TYPES.WILDCARD:
      return [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.SUNVIEW,
          )
            .sort(
              (a, b) =>
                +(a.seasonStats?.conferenceRk ?? 0) -
                +(b.seasonStats?.conferenceRk ?? 0),
            )
            .slice(0, 3),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          )
            .sort(
              (a, b) =>
                +(a.seasonStats?.conferenceRk ?? 0) -
                +(b.seasonStats?.conferenceRk ?? 0),
            )
            .slice(0, 3),
        },
        {
          title: "Wildcard",
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
            .filter(
              (a) =>
                a.seasonStats?.wildcardRk !== null &&
                a.seasonStats?.wildcardRk !== undefined,
            )
            .sort(
              (a, b) =>
                +(a.seasonStats?.wildcardRk ?? 0) -
                +(b.seasonStats?.wildcardRk ?? 0),
            )
            .slice(0, 2),
        },
        {
          title: "Out of the Playoffs",
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
            .filter(
              (a) =>
                a.seasonStats?.wildcardRk !== null &&
                a.seasonStats?.wildcardRk !== undefined,
            )
            .sort(
              (a, b) =>
                +(a.seasonStats?.wildcardRk ?? 0) -
                +(b.seasonStats?.wildcardRk ?? 0),
            )
            .slice(2),
        },
      ];

    default:
      return [];
  }
};

/**
 * Filters teams by conference abbreviation
 */
export const filterTeamsByConference = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  conferenceAbbr: string,
): (GSHLTeam & { seasonStats?: TeamSeasonStatLine })[] => {
  return teams
    .filter((team) => team.confAbbr === conferenceAbbr)
    .map((team) => {
      const stat = stats.find((s) => s.gshlTeamId === team.id);
      return {
        ...team,
        seasonStats: stat ? { ...stat } : undefined,
      };
    });
};

/**
 * Gets ordinal suffix for position numbers (1st, 2nd, 3rd, 4th, etc.)
 */
export const getOrdinalSuffix = (num: number): string => {
  if (num === 1) return "st";
  if (num === 2) return "nd";
  if (num === 3) return "rd";
  return "th";
};

/**
 * Calculates rounded percentage from probability value
 */
export const calculatePercentage = (probability: number): string => {
  return Math.round(probability * 1000) / 10 + "%";
};

/**
 * Formats seed position with ordinal suffix
 */
export const formatSeedPosition = (index: number, suffix: string): string => {
  const position = index + 1;
  return position + getOrdinalSuffix(position) + " " + suffix;
};

export const formatOrdinal = (value: number): string => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

export const formatStandingsRank = (rank: unknown): string => {
  const num = Number(rank);
  return Number.isFinite(num) && num > 0 ? `(${formatOrdinal(num)})` : "";
};

export const compareNumeric = (
  left: number | null | undefined,
  right: number | null | undefined,
): number => {
  const leftValue = left ?? -Infinity;
  const rightValue = right ?? -Infinity;
  return rightValue - leftValue;
};

export const compareNumericAsc = (
  left: number | null | undefined,
  right: number | null | undefined,
): number => {
  const leftValue = left ?? Infinity;
  const rightValue = right ?? Infinity;
  return leftValue - rightValue;
};

export const formatStandingsDetailStat = (
  value: unknown,
  fallback = "-",
): string | number => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return fallback;
};

export const formatStandingsGaa = (value: unknown): string => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
};

export const formatStandingsSvp = (value: unknown): string => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(3).slice(1) : "-";
};

export function buildStandingsCategories(
  teamId: string,
  seasonStats: TeamSeasonStatLine | undefined,
  allTeamsStats?: TeamSeasonStatLine[],
) {
  const categories: Array<{
    label: string;
    value: number | null | undefined;
    rank: number | null;
  }> = [];

  const add = (
    label: string,
    value: number | null | undefined,
    rank: number | null,
  ) => {
    categories.push({ label, value, rank });
  };

  if (!seasonStats) {
    return categories;
  }

  if (Array.isArray(allTeamsStats) && allTeamsStats.length > 0) {
    const rankMapDesc = (key: keyof TeamSeasonStatLine) => {
      const sorted = [...allTeamsStats].sort((left, right) =>
        compareNumeric(
          left[key] as unknown as number,
          right[key] as unknown as number,
        ),
      );
      const map = new Map<string, number>();
      sorted.forEach((row, index) => map.set(row.gshlTeamId, index + 1));
      return map;
    };

    const rankMapAsc = (key: keyof TeamSeasonStatLine) => {
      const sorted = [...allTeamsStats].sort((left, right) =>
        compareNumericAsc(
          left[key] as unknown as number,
          right[key] as unknown as number,
        ),
      );
      const map = new Map<string, number>();
      sorted.forEach((row, index) => map.set(row.gshlTeamId, index + 1));
      return map;
    };

    const rankG = rankMapDesc("G");
    const rankA = rankMapDesc("A");
    const rankP = rankMapDesc("P");
    const rankPPP = rankMapDesc("PPP");
    const rankSOG = rankMapDesc("SOG");
    const rankHIT = rankMapDesc("HIT");
    const rankBLK = rankMapDesc("BLK");
    const rankW = rankMapDesc("W");
    const rankGAA = rankMapAsc("GAA");
    const rankSVP = rankMapDesc("SVP");

    add("G", seasonStats.G, rankG.get(teamId) ?? null);
    add("A", seasonStats.A, rankA.get(teamId) ?? null);
    add("P", seasonStats.P, rankP.get(teamId) ?? null);
    add("PPP", seasonStats.PPP, rankPPP.get(teamId) ?? null);
    add("SOG", seasonStats.SOG, rankSOG.get(teamId) ?? null);
    add("HIT", seasonStats.HIT, rankHIT.get(teamId) ?? null);
    add("BLK", seasonStats.BLK, rankBLK.get(teamId) ?? null);
    add("W", seasonStats.W, rankW.get(teamId) ?? null);
    add("GAA", seasonStats.GAA, rankGAA.get(teamId) ?? null);
    add("SV%", seasonStats.SVP, rankSVP.get(teamId) ?? null);
    return categories;
  }

  add("G", seasonStats.G ?? null, null);
  add("A", seasonStats.A ?? null, null);
  add("P", seasonStats.P ?? null, null);
  add("PPP", seasonStats.PPP ?? null, null);
  add("SOG", seasonStats.SOG ?? null, null);
  add("HIT", seasonStats.HIT ?? null, null);
  add("BLK", seasonStats.BLK ?? null, null);
  add("W", seasonStats.W ?? null, null);
  add("GAA", seasonStats.GAA ?? null, null);
  add("SV%", seasonStats.SVP ?? null, null);

  return categories;
}

export function buildStandingsOpponentLookup(
  allTeams: Array<{ id: string; name: string; logoUrl: string }> | undefined,
): Map<string, { name: string; logoUrl: string }> {
  const byId = new Map<string, { name: string; logoUrl: string }>();

  if (!Array.isArray(allTeams)) {
    return byId;
  }

  allTeams.forEach((team) =>
    byId.set(team.id, { name: team.name, logoUrl: team.logoUrl }),
  );

  return byId;
}

export function getStandingsMatchupWindow(
  teamId: string,
  matchups: Matchup[],
  weeks: Week[],
) {
  const weekNumById = new Map<string, number>();
  weeks.forEach((week) => weekNumById.set(week.id, week.weekNum));

  const teamMatchups = matchups
    .filter((matchup) => matchup.homeTeamId === teamId || matchup.awayTeamId === teamId)
    .map((matchup) => ({
      matchup,
      weekNum: weekNumById.get(matchup.weekId) ?? null,
    }))
    .filter((entry) => entry.weekNum !== null)
    .sort((left, right) => (left.weekNum ?? 0) - (right.weekNum ?? 0));

  const today = new Date().toISOString().split("T")[0] ?? "";
  const activeWeekId = weeks.find(
    (week) => week.startDate <= today && week.endDate >= today,
  )?.id;
  const firstUpcomingIndex = teamMatchups.findIndex(
    (entry) => entry.matchup.weekId === activeWeekId,
  );
  const pivotIndex =
    firstUpcomingIndex === -1 ? teamMatchups.length : firstUpcomingIndex;

  return teamMatchups.slice(Math.max(0, pivotIndex - 4), pivotIndex + 2);
}
