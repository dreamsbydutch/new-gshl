import {
  type Player,
  RosterPosition,
  type Contract,
  type GSHLTeam,
} from "@gshl-types";

export const RATING_RANGES = [
  { range: "1 - 14", class: "bg-emerald-400" },
  { range: "15 - 56", class: "bg-emerald-200" },
  { range: "57 - 140", class: "bg-yellow-200" },
  { range: "141 - 210", class: "bg-orange-200" },
  { range: "211 +", class: "bg-rose-200" },
] as const;

export const CAP_CEILING = 25000000;

export interface TeamRosterProps {
  players: Player[] | undefined;
  contracts: Contract[] | undefined;
  currentTeam: GSHLTeam | undefined;
}

export interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
}

export interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export interface RosterLineupProps {
  teamLineup: (Player | null)[][][];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export interface CapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export const getRatingColorClass = (seasonRk: number | null) => {
  const rank = seasonRk ?? 0;
  if (rank < 15) return "bg-emerald-400";
  if (rank < 57) return "bg-emerald-200";
  if (rank < 141) return "bg-yellow-200";
  if (rank < 211) return "bg-orange-200";
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
