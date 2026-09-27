import type { PlayerInjury } from "./injuries";

export type EditionInjuryObservation = PlayerInjury & {
  playerId: string;
  teamId: string;
  teamName: string;
  observedAt: number;
};

export type EditionInjurySnapshot = {
  fetchedAt: number;
  sourceUpdatedAt: string;
  observations: EditionInjuryObservation[];
};

export type EditionInjuryContext = {
  players: {
    playerId: string;
    name: string;
    nhlTeams: string[];
    teamId: string;
    teamName: string;
    rating: number | null;
    latestPlayedDate: string | null;
  }[];
  previous: EditionInjurySnapshot | null;
};
