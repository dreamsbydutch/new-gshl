import { type Player, RosterPosition } from "@gshl-types";
import { CAP_CEILING } from "./contract-table";
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

export const getRatingColorClass = (seasonRk: number | null) => {
  const rank = seasonRk ?? 500;
  if (rank < 15) return "bg-emerald-400";
  if (rank < 64) return "bg-emerald-200";
  if (rank < 156) return "bg-yellow-200";
  if (rank < 216) return "bg-orange-200";
  return "bg-rose-200";
};

export const buildTeamLineup = (
  currentRoster: Player[] | undefined,
): (Player | null)[][][] => {
  if (!currentRoster) return [];

  const isUtilDefender = !currentRoster
    ?.find((obj) => obj.lineupPos === RosterPosition.Util)
    ?.nhlPos.includes("D" as RosterPosition);

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
