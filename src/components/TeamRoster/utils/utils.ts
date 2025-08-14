import { type Player, RosterPosition } from "@gshl-types";

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
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.LW) ?? null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.C) ?? null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.RW) ?? null,
        ],
        [
          currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.LW)[1] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.C)[1] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.RW)[1] ?? null,
        ],
        [
          null,
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.Util) ?? null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.D) ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[1] ?? null,
          null,
        ],
        [
          null,
          null,
          currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[2] ?? null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          null,
          currentRoster?.find((obj) => obj.lineupPos === RosterPosition.G) ?? null,
          null,
          null,
        ],
      ],
    ];
  }

  return [
    [
      [
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.LW) ?? null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.C) ?? null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.RW) ?? null,
      ],
      [
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.LW)[1] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.C)[1] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.RW)[1] ?? null,
      ],
    ],
    [
      [
        null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.D) ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[1] ?? null,
        null,
      ],
      [
        null,
        currentRoster?.filter((obj) => obj.lineupPos === RosterPosition.D)[2] ?? null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.Util) ?? null,
        null,
      ],
    ],
    [
      [
        null,
        null,
        currentRoster?.find((obj) => obj.lineupPos === RosterPosition.G) ?? null,
        null,
        null,
      ],
    ],
  ];
};
