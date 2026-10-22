export type NhlRosterTalentPosition = "F" | "D" | "G";

export interface NhlRosterTalentPlayer {
  id: string;
  nhlPlayerId: number | null;
  playerName: string;
  position: string;
  gar: number | null;
  status: "qualified" | "research" | "unavailable";
}

export interface NhlRosterTalentTeam {
  id: string;
  name: string;
  abbr: string;
  roster: readonly NhlRosterTalentPlayer[];
  unallocated?: readonly Pick<NhlRosterTalentPlayer, "id" | "playerName">[];
  populationComplete?: boolean;
}
