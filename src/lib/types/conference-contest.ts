import type { GSHLTeam, TeamAward } from "./database";

export type ConferenceContestRatingMode = "current" | "allTime";

export interface ConferenceContestConferenceInfo {
  id: string;
  name: string;
  abbr: string | null;
  logoUrl: string | null;
}

export interface ConferenceContestRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface ConferenceContestRatingComponents {
  headToHead: number;
  playoffs: number;
  cups: number;
  awards: number;
}

export type ConferenceContestComponentKey =
  keyof ConferenceContestRatingComponents;

export interface ConferenceContestRating {
  ratingByConferenceId: Record<string, number>;
  componentsByConferenceId: Record<
    string,
    ConferenceContestRatingComponents
  >;
}

export interface ConferenceContestAwardSummary {
  awardsByConferenceId: Record<string, TeamAward[]>;
  awardPointsByConferenceId: Record<string, number>;
  coachAwardsByConferenceId: Record<string, TeamAward[]>;
  gmAwardsByConferenceId: Record<string, TeamAward[]>;
}

export interface ConferenceContestSeasonViewModel
  extends ConferenceContestAwardSummary,
    ConferenceContestRating {
  seasonId: string;
  seasonName: string;
  seasonYear: number;
  isActive: boolean;
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;
  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;
  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export interface ConferenceContestTrendPoint {
  seasonId: string;
  seasonName: string;
  seasonYear: number;
  ratingByConferenceId: Record<string, number>;
}

export interface ConferenceContestOverallViewModel
  extends ConferenceContestAwardSummary {
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;
  currentRating: ConferenceContestRating;
  allTimeRating: ConferenceContestRating;
  trend: ConferenceContestTrendPoint[];
  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;
  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export type ConferenceContestWinner = "home" | "away" | "tie" | "unknown";
