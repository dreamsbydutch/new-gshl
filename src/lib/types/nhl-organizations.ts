export interface NhlOrganizationPlayer {
  nhlPlayerId: number;
  playerName: string;
  position: "F" | "D" | "G";
  membership: "nhl-roster" | "organization";
}
export interface NhlOrganizationTeam {
  abbr: string;
  name: string;
  roster: NhlOrganizationPlayer[];
}
export interface NhlOrganizations {
  seasonId: number;
  updatedAt: number;
  teams: NhlOrganizationTeam[];
}
