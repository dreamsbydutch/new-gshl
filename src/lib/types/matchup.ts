import type {
  GSHLTeam,
  Player,
  PlayerCareerSplitStatLine,
  PlayerCareerTotalStatLine,
  PlayerDayStatLine,
  PlayerNHLStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
} from "./database";

export interface MatchupPageProps {
  params: Promise<{
    matchupId: string;
  }>;
}

export interface MatchupDetailsContentProps {
  matchupId: string;
  seasonId: string;
  weekId: string;
}

export type PlayerStatLine =
  | PlayerDayStatLine
  | PlayerWeekStatLine
  | PlayerSplitStatLine
  | PlayerTotalStatLine
  | PlayerCareerSplitStatLine
  | PlayerCareerTotalStatLine
  | PlayerNHLStatLine;

type PlayerStatSharedFields = Partial<
  Pick<
    PlayerDayStatLine,
    | "playerId"
    | "gshlTeamId"
    | "nhlPos"
    | "posGroup"
    | "dailyPos"
    | "nhlTeam"
    | "date"
    | "opp"
    | "score"
    | "GP"
    | "GS"
    | "G"
    | "A"
    | "P"
    | "PM"
    | "PIM"
    | "PPP"
    | "SOG"
    | "HIT"
    | "BLK"
    | "W"
    | "GA"
    | "GAA"
    | "SV"
    | "SA"
    | "SVP"
    | "SO"
    | "Rating"
  >
> &
  Partial<Pick<PlayerWeekStatLine, "days">>;

export type PlayerStatRow = Pick<PlayerDayStatLine, "id"> &
  PlayerStatSharedFields &
  Partial<Player>;

export type MatchupPlayerStat = PlayerWeekStatLine & Partial<Player>;

export interface CategoryResult {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  winner: "home" | "away" | "tie";
}

export type StarPlayer = MatchupPlayerStat & {
  starRank: 1 | 2 | 3;
  team: GSHLTeam | null;
  numericRating: number;
};

export type PlayerStatCategoryKey =
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PIM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "GA"
  | "GAA"
  | "SV"
  | "SA"
  | "SVP"
  | "SO";

export type PlayerStatContextKey =
  | "nhlTeam"
  | "date"
  | "opp"
  | "score"
  | "days"
  | "GP"
  | "GS"
  | "Rating";

export type PlayerStatColumnKey =
  | "player"
  | "pos"
  | PlayerStatContextKey
  | PlayerStatCategoryKey;

export interface PlayerStatColumn {
  key: PlayerStatColumnKey;
  label: string;
  className?: string;
}
