import type { TeamWeekStatLine } from "./database";

export type OwnerPowerRankingStat = Pick<
  TeamWeekStatLine,
  "seasonId" | "weekId" | "gshlTeamId" | "powerRk"
>;

export interface OwnerRankingRecord {
  wins: number;
  losses: number;
  ties: number;
  games: number;
  winPercentage: number;
}

export interface OwnerRankingOwnerSummary {
  id: string;
}

export interface OwnerRankingTeamSummary {
  name: string | null;
  logoUrl: string | null;
}

export interface OwnerRankingEntry {
  owner: OwnerRankingOwnerSummary;
  rank: number;
  previousRank: number;
  rankChange: number;
  displayName: string;
  isActive: boolean;
  primaryTeam: OwnerRankingTeamSummary | null;
  seasonsPlayed: number;
  rating: number;
  elo: number;
  seedRating: number;
  matchupDelta: number;
  performanceAdjustment: number;
  achievementBonus: number;
  powerRankingAdjustment: number;
  powerWeeksRanked: number;
  weeksAtNumberOne: number;
  weeksInTopThree: number;
  weeksInBottomThree: number;
  weeksInLastPlace: number;
  overallRecord: OwnerRankingRecord;
  conferenceRecord: OwnerRankingRecord;
  playoffRecord: OwnerRankingRecord;
  playoffAppearances: number;
  finalsAppearances: number;
  cups: number;
  totalAwards: number;
  coachAwards: number;
  gmAwards: number;
  otherAwards: number;
  brophyAwards: number;
}

export interface OwnerLadderBattle {
  matchupId: string;
  seasonId: string;
  seasonName: string;
  gameType: string;
  homeOwnerId: string;
  awayOwnerId: string;
  homeOwnerName: string;
  awayOwnerName: string;
  homeScore: number;
  awayScore: number;
  homeDelta: number;
  awayDelta: number;
  winnerOwnerId: string | null;
}

export interface OwnerRankingsViewModel {
  rankings: OwnerRankingEntry[];
  recentBattles: OwnerLadderBattle[];
  latestSeasonId: string | null;
  latestSeasonName: string | null;
  activeOwnerCount: number;
  inactiveOwnerCount: number;
}

export type OwnerRankingBrowserEntry = Pick<
  OwnerRankingEntry,
  | "owner"
  | "rank"
  | "rankChange"
  | "displayName"
  | "primaryTeam"
  | "seasonsPlayed"
  | "rating"
  | "weeksAtNumberOne"
  | "weeksInTopThree"
  | "weeksInBottomThree"
  | "weeksInLastPlace"
  | "overallRecord"
  | "conferenceRecord"
  | "playoffRecord"
  | "playoffAppearances"
  | "finalsAppearances"
  | "cups"
  | "coachAwards"
  | "gmAwards"
  | "otherAwards"
  | "brophyAwards"
>;

export interface OwnerRankingsBrowserViewModel {
  rankings: OwnerRankingBrowserEntry[];
}
