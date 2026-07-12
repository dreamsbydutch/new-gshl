import type { AwardsList } from "./enums";
import type {
  Awards,
  GSHLTeam,
  NHLTeam,
  Player,
  PlayerTotalStatLine,
  Season,
} from "./database";
import type {
  AwardCatalogEntry,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "./ui-components";

export type AllStarAwardKey =
  | AwardsList.FIRST_AS
  | AwardsList.SECOND_AS
  | AwardsList.PLAYOFF_AS;

export interface SeasonAwardWinnerCard {
  id: string;
  award: Awards;
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
  awards: Awards[];
  players: Player[];
  playerTotals: PlayerTotalStatLine[];
  season: Season | null;
  teams: GSHLTeam[];
}

export interface AllStarCountLine {
  awardKey: AllStarAwardKey;
  label: string;
  count: number;
}

export interface AllStarRowData {
  awardKey: AllStarAwardKey;
  seasonId: string;
  seasonYear: number | string;
  playerId: string;
  playerName: string;
  playerTotal: PlayerTotalStatLine;
  nhlTeam: NHLTeam | undefined;
}

export type BuildTrophyCaseDataInput = TrophyCaseProps;

export interface BuildTrophyCaseDataResult {
  cards: TrophyCaseCard[];
  summaryLines: TrophyCaseSummaryLine[];
  allStarCounts: AllStarCountLine[];
  allStarRows: AllStarRowData[];
}
