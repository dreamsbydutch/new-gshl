import type { AwardsList } from "./enums";
import type {
  GSHLTeam,
  Player,
  PlayerAward,
  PlayerTotalStatLine,
  Season,
  TeamAward,
} from "./database";
import type {
  AwardCatalogEntry,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "./team-ui";

export type AllStarAwardKey = Extract<
  AwardsList,
  "firstAS" | "secondAS" | "playoffAS"
>;

export interface SeasonAwardWinnerCard {
  id: string;
  award: TeamAward;
  catalog: AwardCatalogEntry;
  winnerName: string;
  winnerDetail: string | null;
  logoUrl: string | null;
}

export interface AllStarWinner {
  playerId: string;
  playerName: string;
  positions: string;
  teamName: string | null;
  teamLogoUrl: string | null;
}

export interface AllStarTeamCard {
  awardKey: AllStarAwardKey;
  title: string;
  winners: AllStarWinner[];
}

export interface SeasonAwardsProps {
  playerAwards: PlayerAward[];
  teamAwards: TeamAward[];
  players: Player[];
  playerTotals: PlayerTotalStatLine[];
  season: Season | null;
  teams: GSHLTeam[];
}

export interface AwardsShowcaseProps {
  playerAwards: PlayerAward[];
  teamAwards: TeamAward[];
  players: Player[];
  teams: GSHLTeam[];
}

export type BuildTrophyCaseDataInput = TrophyCaseProps;

export interface BuildTrophyCaseDataResult {
  cards: TrophyCaseCard[];
  summaryLines: TrophyCaseSummaryLine[];
}
