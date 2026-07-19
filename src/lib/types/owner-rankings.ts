import type { GSHLTeam, Owner } from "./database";

export interface OwnerRankingRecord {
  wins: number;
  losses: number;
  ties: number;
  games: number;
  winPercentage: number;
}

export interface OwnerRankingEntry {
  owner: Owner;
  rank: number;
  previousRank: number;
  rankChange: number;
  displayName: string;
  isActive: boolean;
  primaryTeam: GSHLTeam | null;
  seasonsPlayed: number;
  rating: number;
  elo: number;
  seedRating: number;
  matchupDelta: number;
  performanceAdjustment: number;
  achievementBonus: number;
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
