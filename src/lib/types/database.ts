// Core database model types
import type {
  RosterPosition,
  PositionGroup,
  SeasonType,
  MatchupType,
  EventType,
  ContractType,
  ContractStatus,
  AwardsList,
  ResignableStatus,
} from "./enums";

// Core model types
export interface Season {
  id: string;
  year: number;
  name: string;
  categories: string[];
  rosterSpots: string[];
  startDate: string;
  endDate: string;
  isActive: boolean;
  signingEndDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conference {
  id: string;
  name: string;
  logoUrl: string;
  abbr: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Week {
  id: string;
  seasonId: string;
  weekNum: number;
  weekType: SeasonType;
  gameDays: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isPlayoffs: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Matchup {
  id: string;
  seasonId: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: MatchupType;
  homeRank?: number | null;
  awayRank?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeWin?: boolean | null;
  awayWin?: boolean | null;
  tie?: boolean | null;
  isComplete: boolean;
  rating?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  seasonId: string;
  name: string;
  description: string;
  date: string;
  type: EventType;
  createdAt: Date;
  updatedAt: Date;
}

export interface Owner {
  id: string;
  firstName: string;
  lastName: string;
  nickName: string;
  email?: string | null;
  owing: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Franchise {
  id: string;
  ownerId: string;
  name: string;
  abbr: string;
  logoUrl: string;
  confId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface NHLTeam {
  id: string;
  fullName: string;
  abbreviation: string;
  logoUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  seasonId: string;
  franchiseId: string;
  yahooId: string;
  confId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface GSHLTeam {
  id: string;
  seasonId: string;
  franchiseId: string;
  name: string | null;
  abbr: string | null;
  logoUrl: string | null;
  isActive: boolean;
  yahooId: string | null;
  confId: string | null;
  confName: string | null;
  confAbbr: string | null;
  confLogoUrl: string | null;
  ownerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerNickname: string | null;
  ownerEmail: string | null;
  ownerOwing: number | null;
  ownerIsActive: boolean;
}

export interface Player {
  id: string;
  yahooId?: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  isActive: boolean;
  isSignable: boolean;
  isResignable: ResignableStatus | null;
  preDraftRk?: number | null;
  seasonRk?: number | null;
  seasonRating?: number | null;
  overallRk?: number | null;
  overallRating?: number | null;
  salary?: number | null;
  age?: number | null;
  birthday?: string | null;
  country?: string | null;
  handedness?: string | null;
  jerseyNum?: number | null;
  weight?: number | null;
  height?: number | null;
  lineupPos?: RosterPosition | null;
  gshlTeamId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contract {
  id: string;
  playerId: string;
  signingFranchiseId: string;
  currentFranchiseId: string;
  seasonId: string;
  contractType: ContractType[];
  contractLength: number;
  contractSalary: number;
  signingDate: string;
  startDate: string;
  signingStatus: ContractStatus;
  expiryStatus: ContractStatus;
  expiryDate: string;
  capHit: number;
  capHitEndDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Awards {
  id: string;
  seasonId: string;
  winnerId: string;
  nomineeIds: string[];
  award: AwardsList;
  createdAt: Date;
  updatedAt: Date;
}
export interface DraftPick {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  originalTeamId?: string | null;
  round: string;
  pick: string;
  playerId?: string | null;
  isTraded: boolean;
  isSigning: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Player stat line types
export interface PlayerDayStatLine {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  date: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  dailyPos: RosterPosition;
  bestPos: RosterPosition;
  fullPos: RosterPosition;
  opp: string;
  score: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  TOI: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerWeekStatLine {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string; // matches sheets config casing
  GS: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  TOI: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerSplitStatLine {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  seasonType: SeasonType;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  TOI: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerTotalStatLine {
  id: string;
  seasonId: string;
  gshlTeamIds: string[]; // Note: plural in sheets config
  playerId: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  seasonType: SeasonType;
  days: string;
  GP: string;
  MG: string;
  IR: string;
  IRplus: string;
  GS: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  TOI: string;
  Rating: string;
  ADD: string;
  MS: string;
  BS: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerNHLStatLine {
  id: string;
  seasonId: string;
  playerId: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  age: string;
  GP: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  QS: string;
  RBS: string;
  TOI: string;
  seasonRating: string; // lowercase from sheets config
  overallRating: string; // lowercase from sheets config
  salary: string; // lowercase from sheets config
  createdAt: Date;
  updatedAt: Date;
}

// Archived stat line types
export interface ArchivedSkaterDayStatLine {
  id: string;
  originalId: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  date: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  dailyPos: RosterPosition;
  bestPos: RosterPosition;
  fullPos: RosterPosition;
  opp: string;
  score: string;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArchivedGoalieDayStatLine {
  id: string;
  originalId: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  date: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  dailyPos: RosterPosition;
  bestPos: RosterPosition;
  fullPos: RosterPosition;
  opp: string;
  score: string;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
  createdAt: Date;
  updatedAt: Date;
}

// Team stat line types
export interface TeamDayStatLine {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  date: string;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamWeekStatLine {
  id: string;
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  days: number;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  yearToDateRating: number;
  powerRating: number;
  powerRk: number;
  ADD: number;
  MS: number;
  BS: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSeasonStatLine {
  id: string;
  seasonId: string;
  seasonType: SeasonType;
  gshlTeamId: string;
  days: number;
  GP: number;
  MG: number;
  IR: number;
  IRplus: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  GAA: number;
  SV: number;
  SA: number;
  SVP: number;
  SO: number;
  TOI: number;
  Rating: number;
  ADD: number;
  MS: number;
  BS: number;

  streak: string;
  powerRk: number;
  powerRating: number;
  prevPowerRk: number;
  prevPowerRating: number;
  teamW: number;
  teamHW: number;
  teamHL: number;
  teamL: number;
  teamCCW: number;
  teamCCHW: number;
  teamCCHL: number;
  teamCCL: number;
  overallRk: number;
  conferenceRk: number;
  wildcardRk?: number | null;
  playersUsed: number;
  norrisRating?: number | null;
  norrisRk?: number | null;
  vezinaRating?: number | null;
  vezinaRk?: number | null;
  calderRating?: number | null;
  calderRk?: number | null;
  jackAdamsRating?: number | null;
  jackAdamsRk?: number | null;
  GMOYRating?: number | null;
  GMOYRk?: number | null;

  createdAt: Date;
  updatedAt: Date;
}
