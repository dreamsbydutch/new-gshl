import type { Contract, GSHLTeam, Player } from "@gshl-types";
import { ContractStatus, RosterPosition } from "../domain/constants";
import { CAP_CEILING } from "./contract-table";
import { toNumber } from "../core";
import type {
  TeamRosterProps,
  PlayerCardProps,
  BenchPlayersProps,
  RosterLineupProps,
  RosterCapSpaceDisplayProps,
} from "@gshl-types";

// Re-export for backward compatibility
export { CAP_CEILING };
export type {
  TeamRosterProps,
  PlayerCardProps,
  BenchPlayersProps,
  RosterLineupProps,
  RosterCapSpaceDisplayProps as CapSpaceDisplayProps,
};

export const RATING_RANGES = [
  { range: "Superstar", class: "bg-emerald-400" },
  { range: "Star", class: "bg-emerald-200" },
  { range: "Starter", class: "bg-yellow-200" },
  { range: "Bench", class: "bg-orange-200" },
  { range: "Waivers", class: "bg-rose-200" },
] as const;

/**
 * Returns rating color class.
 *
 * @param seasonRk - The season rk to use.
 */
export const getRatingColorClass = (seasonRk: number | null) => {
  const rank = seasonRk ?? 500;
  if (rank < 15) return "bg-emerald-400";
  if (rank < 64) return "bg-emerald-200";
  if (rank < 156) return "bg-yellow-200";
  if (rank < 216) return "bg-orange-200";
  return "bg-rose-200";
};

/**
 * Returns roster rating class.
 *
 * @param seasonRk - The season rk to use.
 */
export function getRosterRatingClass(seasonRk: Player["seasonRk"]) {
  return typeof seasonRk === "number" && Number.isFinite(seasonRk)
    ? getRatingColorClass(seasonRk)
    : "bg-gray-200 text-gray-700";
}

const RFA_SALARY_MULTIPLIER = 1.15;
const SALARY_ROUNDING_INCREMENT = 50_000;

/**
 * Returns displayed roster salary.
 *
 * @param salary - The salary to use.
 * @param contract - The contract to use.
 * @returns The requested displayed roster salary.
 */
export function getDisplayedRosterSalary(
  salary: number,
  contract?: Contract,
): number {
  if (contract?.expiryStatus !== ContractStatus.RFA) {
    return salary;
  }

  return (
    Math.round((salary * RFA_SALARY_MULTIPLIER) / SALARY_ROUNDING_INCREMENT) *
    SALARY_ROUNDING_INCREMENT
  );
}

/**
 * Normalizes mixed-value player fields into the shape expected by roster and
 * lineup presentation logic.
 */
export function normalizeRosterPlayer(player: Player): Player {
  return {
    ...player,
    nhlPos: Array.isArray(player.nhlPos)
      ? player.nhlPos
      : player.nhlPos
        ? [player.nhlPos]
        : [],
    nhlTeam: Array.isArray(player.nhlTeam)
      ? String(player.nhlTeam[0] ?? "")
      : String(player.nhlTeam ?? ""),
    seasonRk: toNullableNumber(player.seasonRk),
    seasonRating: toNullableNumber(player.seasonRating),
    overallRk: toNullableNumber(player.overallRk),
    overallRating: toNullableNumber(player.overallRating),
    salary: toNullableNumber(player.salary),
  };
}

/**
 * Builds a sorted roster for the current franchise team.
 */
export function buildCurrentRoster(
  players: Player[] | undefined,
  currentTeam: GSHLTeam | undefined,
): Player[] {
  if (!players || !currentTeam) {
    return [];
  }

  return players
    .filter(
      (player) =>
        String(player.gshlTeamId ?? "") === String(currentTeam.franchiseId),
    )
    .map((player) => normalizeRosterPlayer(player))
    .sort((a, b) => {
      const overallDelta = (b.overallRating ?? 0) - (a.overallRating ?? 0);
      if (overallDelta !== 0) {
        return overallDelta;
      }
      return (b.seasonRating ?? 0) - (a.seasonRating ?? 0);
    });
}

/**
 * Returns bench players from a normalized roster.
 */
export function getBenchPlayers(currentRoster: Player[]): Player[] {
  return currentRoster.filter(
    (player) => player.lineupPos === RosterPosition.BN,
  );
}

/**
 * Calculates the total cap hit for a contract collection.
 */
export function calculateTotalCapHit(
  contracts: Contract[] | undefined,
): number {
  if (!contracts) {
    return 0;
  }

  return contracts.reduce(
    (total, contract) => total + toNumber(contract.capHit, 0),
    0,
  );
}

/**
 * Builds team lineup.
 *
 * @param currentRoster - The current roster to use.
 * @returns The assembled team lineup.
 */
export const buildTeamLineup = (
  currentRoster: Player[] | undefined,
): (Player | null)[][][] => {
  if (!currentRoster) return [];

  const isUtilDefender = !currentRoster
    ?.find((obj) => obj.lineupPos === RosterPosition.Util)
    ?.nhlPos.includes("D");

  if (isUtilDefender) {
    return [
      [
        [
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.LW) ??
            null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.C) ??
            null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.RW) ??
            null,
        ],
        [
          currentRoster?.filter(
            (obj) => obj.lineupPos === RosterPosition.LW,
          )[1] ?? null,
          currentRoster?.filter(
            (obj) => obj.lineupPos === RosterPosition.C,
          )[1] ?? null,
          currentRoster?.filter(
            (obj) => obj.lineupPos === RosterPosition.RW,
          )[1] ?? null,
        ],
        [
          null,
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.Util) ??
            null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.D) ??
            null,
          currentRoster?.filter(
            (obj) => obj.lineupPos === RosterPosition.D,
          )[1] ?? null,
          null,
        ],
        [
          null,
          null,
          currentRoster?.filter(
            (obj) => obj.lineupPos === RosterPosition.D,
          )[2] ?? null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.G) ??
            null,
          null,
          null,
        ],
      ],
    ];
  }

  return [
    [
      [
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.LW) ??
          null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.C) ??
          null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.RW) ??
          null,
      ],
      [
        currentRoster?.filter(
          (obj) => obj.lineupPos === RosterPosition.LW,
        )[1] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.C)[1] ??
          null,
        currentRoster?.filter(
          (obj) => obj.lineupPos === RosterPosition.RW,
        )[1] ?? null,
      ],
    ],
    [
      [
        null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.D) ??
          null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[1] ??
          null,
        null,
      ],
      [
        null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[2] ??
          null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.Util) ??
          null,
        null,
      ],
    ],
    [
      [
        null,
        null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.G) ??
          null,
        null,
        null,
      ],
    ],
  ];
};

/**
 * Converts nullable numeric inputs into finite numbers or null.
 */
function toNullableNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}
