export interface BuilderTeam {
  id: string;
  ownerId: string;
  conferenceId: string;
  name: string;
}

export interface PairHistory {
  a: string;
  b: string;
  games: number;
  aHome: number;
}

export interface BuilderGame {
  week: number;
  home: string;
  away: string;
}
