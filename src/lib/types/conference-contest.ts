import type { GSHLTeam } from "./database";

export interface ConferenceContestConferenceInfo {
  id: string;
  name: string;
  abbr: string | null;
  logoUrl: string | null;
}

export interface ConferenceContestRecord {
  wins: number;
  losses: number;
}

export interface ConferenceContestSeasonViewModel {
  seasonId: string;
  seasonName: string;
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;
  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;
  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export interface ConferenceContestOverallViewModel {
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;
  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;
  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export type ConferenceContestWinner = "home" | "away" | "tie" | "unknown";
