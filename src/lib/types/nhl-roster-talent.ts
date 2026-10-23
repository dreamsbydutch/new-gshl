export type NhlRosterTalentPosition = "F" | "D" | "G";

export interface NhlRosterTalentPlayer {
  id: string;
  nhlPlayerId: number | null;
  playerName: string;
  position: string;
  gar: number | null;
  status: "qualified" | "research" | "unavailable";
  ratePer60?: number;
  minutesPerTeamGame?: number;
}

export interface NhlRosterTalentTeam {
  id: string;
  name: string;
  abbr: string;
  roster: readonly NhlRosterTalentPlayer[];
  unallocated?: readonly Pick<NhlRosterTalentPlayer, "id" | "playerName">[];
  populationComplete?: boolean;
}

export interface NhlConditionalRosterTalentTeam
  extends Omit<NhlRosterTalentTeam, "roster"> {
  roster: readonly (Omit<NhlRosterTalentPlayer, "gar" | "ratePer60"> & {
    ratePer60: number | null;
  })[];
}
