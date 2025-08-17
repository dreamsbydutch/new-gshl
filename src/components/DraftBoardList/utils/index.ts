import { RosterPosition, PositionGroup, type Player } from "@gshl-types";
export * from "./types";

// Allow for legacy single-position string as well as current array form
export type DraftBoardPlayer = Player & {
  nhlPos: RosterPosition[] | RosterPosition; // broaden for defensive checks
};

/**
 * Type guard / helper to determine if a player has a given roster position.
 */
function hasRosterPosition(
  player: Pick<DraftBoardPlayer, "nhlPos">,
  pos: RosterPosition,
): boolean {
  return Array.isArray(player.nhlPos)
    ? player.nhlPos.includes(pos)
    : player.nhlPos === pos;
}

export function matchesFilter(
  player: Pick<DraftBoardPlayer, "posGroup" | "nhlPos">,
  selectedType: string | null,
): boolean {
  if (!selectedType || selectedType === "all") return true;
  switch (selectedType) {
    case "forward":
      return player.posGroup === PositionGroup.F;
    case "defense":
      return player.posGroup === PositionGroup.D;
    case "goalie":
      return player.posGroup === PositionGroup.G;
    case "center":
      return hasRosterPosition(player, RosterPosition.C);
    case "leftwing":
      return hasRosterPosition(player, RosterPosition.LW);
    case "rightwing":
      return hasRosterPosition(player, RosterPosition.RW);
    default:
      return false;
  }
}

export const draftBoardFilters = { matchesFilter };
