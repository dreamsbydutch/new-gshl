import type {
  Franchise,
  GSHLTeam,
  Matchup,
  Season,
  TeamSeasonStatLine,
  TeamWeekStatLine,
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

export interface PowerRankingEntry {
  team: GSHLTeam;
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

export interface PowerRankingsViewModel {
  entries: PowerRankingEntry[];
  chartData: PowerRankingChartPoint[];
  series: PowerRankingSeries[];
  latestWeek: Week | null;
}

export interface PowerRankingsProps {
  season: Season | null;
  rankings: PowerRankingsViewModel;
}

export interface PowerRankingsHomeCardProps {
  seasonId?: string;
}

export type PowerRankingWeeklyStat = Pick<
  TeamWeekStatLine,
  "gshlTeamId" | "weekId" | "powerRating" | "powerRk"
>;

export type PowerRankingSeasonStat = Pick<
  TeamSeasonStatLine,
  "gshlTeamId" | "powerRk"
>;

export interface BuildPowerRankingsOptions {
  teams: GSHLTeam[];
  weeks: Week[];
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
