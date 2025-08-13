import { Player, RosterPosition } from "@gshl-types";

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
    ?.filter((obj) => obj.lineupPos === "Util")[0]
    ?.nhlPos.includes("D" as RosterPosition);

  if (isUtilDefender) {
    return [
      [
        [
          currentRoster?.filter((obj) => obj.lineupPos === "LW")[0] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === "C")[0] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === "RW")[0] ?? null,
        ],
        [
          currentRoster?.filter((obj) => obj.lineupPos === "LW")[1] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === "C")[1] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === "RW")[1] ?? null,
        ],
        [
          null,
          null,
          currentRoster?.filter((obj) => obj.lineupPos === "Util")[0] ?? null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          currentRoster?.filter((obj) => obj.lineupPos === "D")[0] ?? null,
          currentRoster?.filter((obj) => obj.lineupPos === "D")[1] ?? null,
          null,
        ],
        [
          null,
          null,
          currentRoster?.filter((obj) => obj.lineupPos === "D")[2] ?? null,
          null,
          null,
        ],
      ],
      [
        [
          null,
          null,
          currentRoster?.filter((obj) => obj.lineupPos === "G")[0] ?? null,
          null,
          null,
        ],
      ],
    ];
  }

  return [
    [
      [
        currentRoster?.filter((obj) => obj.lineupPos === "LW")[0] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "C")[0] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "RW")[0] ?? null,
      ],
      [
        currentRoster?.filter((obj) => obj.lineupPos === "LW")[1] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "C")[1] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "RW")[1] ?? null,
      ],
    ],
    [
      [
        null,
        currentRoster?.filter((obj) => obj.lineupPos === "D")[0] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "D")[1] ?? null,
        null,
      ],
      [
        null,
        currentRoster?.filter((obj) => obj.lineupPos === "D")[2] ?? null,
        currentRoster?.filter((obj) => obj.lineupPos === "Util")[0] ?? null,
        null,
      ],
    ],
    [
      [
        null,
        null,
        currentRoster?.filter((obj) => obj.lineupPos === "G")[0] ?? null,
        null,
        null,
      ],
    ],
  ];
};
