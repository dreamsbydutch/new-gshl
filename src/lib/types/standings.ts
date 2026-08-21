import type {
  Franchise,
  GSHLTeam,
  Matchup,
  Season,
  TeamSeasonStatLine,
  Week,
} from "./database";

export type StandingsType = "overall" | "conference" | "wildcard";

export type StandingsOption =
  | "Overall"
  | "Conference"
  | "Wildcard"
  | "LosersTourney";

export interface StandingsGroup {
  title: string;
  teams: (GSHLTeam & {
    franchise?: Franchise;
    seasonStats?: TeamSeasonStatLine;
  })[];
}

export type StandingsStatView = "standings" | "skaters" | "goalies" | "roster";

export type StandingsTeamRow = StandingsGroup["teams"][number];

export interface StandingsCategoryRank {
  label: string;
  value: number | string | null | undefined;
  rank: number | null;
}

export interface StandingsTeamGameContext {
  id: string;
  isComplete: boolean;
  opponentLogoUrl: string | null;
  opponentName: string;
  resultLabel: string;
  resultTone: "win" | "loss" | "tie" | "upcoming";
  weekLabel: string;
}

export interface StandingsTopPlayer {
  id: string;
  name: string;
  position: string;
  ratingLabel: string;
  statLabel: string;
}

export interface StandingsTeamCardViewModel {
  categoryRanks: StandingsCategoryRank[];
  conferenceLabel: string;
  ownerName: string;
  powerRank: number | null;
  previousGames: StandingsTeamGameContext[];
  topPlayers: StandingsTopPlayer[];
  upcomingGames: StandingsTeamGameContext[];
}

export interface StandingsTeamCardProps {
  seasonId: string;
  teamId: string;
}

export interface UseStandingsTeamDetailOptions {
  seasonId?: string | null;
  teamId?: string | null;
  enabled?: boolean;
}

export interface StandingsGameListProps {
  emptyLabel: string;
  games: StandingsTeamGameContext[];
  title: string;
}

export interface StandingsCategoryRanksProps {
  categories: StandingsCategoryRank[];
}

export interface StandingsTopPlayersProps {
  players: StandingsTopPlayer[];
}

export interface StandingsGroupTableProps {
  group: StandingsGroup;
  season: Season;
  standingsType: string;
}

export interface StandingsTableProps {
  groups: StandingsGroup[];
  selectedSeason: Season | null;
  standingsType: string;
}

export interface StandingsTableColumn {
  key: keyof TeamSeasonStatLine | "record" | "standingsPoints";
  label: string;
  description: string;
  format?: "gaa" | "svp" | "rating";
}

export type StandingsSortDirection = "asc" | "desc";

export type StandingsSortState = {
  key: keyof TeamSeasonStatLine;
  direction: StandingsSortDirection;
} | null;

export interface StandingsContainerProps {
  standingsType: string;
}

export interface StandingsItemProps {
  team: GSHLTeam & { franchise?: Franchise; seasonStats?: TeamSeasonStatLine };
  season: Season;
  standingsType: string;
  matchups?: Matchup[];
  weeks?: Week[];
}

export interface StandingsTeamInfoProps {
  teamProb: PlayoffProbType;
  standingsType: StandingsOption;
}

export type PowerRankingTeam = Pick<
  GSHLTeam,
  "id" | "name" | "abbr" | "logoUrl" | "ownerId"
>;

export type PowerRankingWeek = Pick<
  Week,
  "id" | "weekNum" | "weekType" | "startDate"
>;

export interface PowerRankingEntry {
  team: PowerRankingTeam;
  rank: number;
  rating: number | null;
  previousRank: number | null;
  rankChange: number | null;
  color: string;
}

export type PowerRankingChartPoint = {
  weekId: string;
  weekNum: number;
  label: string;
} & Record<string, string | number>;

export interface PowerRankingSeries {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
  currentRank: number;
}

export interface PowerRankingColorSource {
  teamId: string;
  logoUrl: string | null;
  fallbackColor: string;
}

export type PowerRankingPaletteMap = Record<string, string[]>;
export type PowerRankingColorMap = Record<string, string>;

export interface PowerRankingsViewModel {
  entries: PowerRankingEntry[];
  chartData: PowerRankingChartPoint[];
  series: PowerRankingSeries[];
  latestWeek: PowerRankingWeek | null;
}

export interface PowerRankingsProps {
  season: Season | null;
  rankings: PowerRankingsViewModel;
}

export interface PowerRankingsHomeCardProps {
  seasonId?: string;
}

export interface PowerRankingPreviewEntry {
  team: Pick<GSHLTeam, "id" | "name" | "abbr" | "logoUrl">;
  rank: number;
  rating: number | null;
  rankChange: number | null;
  color: string;
}

export interface PowerRankingsPreview {
  season: Pick<Season, "id" | "name" | "isActive">;
  latestWeek: Pick<Week, "weekNum"> | null;
  entries: PowerRankingPreviewEntry[];
}

export interface PowerRankingWeeklyStat {
  gshlTeamId: string;
  weekId: string;
  powerRating?: number | null;
  powerRk?: number | null;
}

export type PowerRankingSeasonStat = Pick<
  TeamSeasonStatLine,
  "gshlTeamId" | "powerRk"
>;

export interface StandingsPowerHistory {
  weeks: PowerRankingWeek[];
  weeklyStats: PowerRankingWeeklyStat[];
}

export interface BuildPowerRankingsOptions {
  teams: PowerRankingTeam[];
  weeks: PowerRankingWeek[];
  weeklyStats: PowerRankingWeeklyStat[];
  seasonStats: PowerRankingSeasonStat[];
}

export interface PlayoffProbType {
  OneSeed: number;
  TwoSeed: number;
  ThreeSeed: number;
  FourSeed: number;
  FiveSeed: number;
  SixSeed: number;
  SevenSeed: number;
  EightSeed: number;
  NineSeed: number;
  TenSeed: number;
  ElevenSeed: number;
  TwelveSeed: number;
  ThirteenSeed: number;
  FourteenSeed: number;
  FifteenSeed: number;
  SixteenSeed: number;
  OneConf: number;
  TwoConf: number;
  ThreeConf: number;
  FourConf: number;
  FiveConf: number;
  SixConf: number;
  SevenConf: number;
  EightConf: number;
  PlayoffsPer: number;
  LoserPer: number;
  SFPer: number;
  FinalPer: number;
  CupPer: number;
  "1stPickPer": number;
  "3rdPickPer": number;
  "4thPickPer": number;
  "8thPickPer": number;
}
