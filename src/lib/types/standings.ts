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
