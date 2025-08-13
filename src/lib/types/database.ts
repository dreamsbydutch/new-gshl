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
} from "./enums";

// Core model types
export interface Season {
  id: number;
  year: number;
  name: string;
  categories: string[];
  rosterSpots: string[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  signingEndDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conference {
  id: number;
  name: string;
  logoUrl: string;
  abbr: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Week {
  id: number;
  seasonId: number;
  weekNum: number;
  weekType: SeasonType;
  gameDays: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isPlayoffs: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Matchup {
  id: number;
  seasonId: number;
  weekId: number;
  homeTeamId: number;
  awayTeamId: number;
  gameType: MatchupType;
  homeRank?: number | null;
  awayRank?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeWin?: boolean | null;
  awayWin?: boolean | null;
  tie?: boolean | null;
  isCompleted: boolean;
  rating?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: number;
  seasonId: number;
  name: string;
  description: string;
  date: Date;
  type: EventType;
  createdAt: Date;
  updatedAt: Date;
}

export interface Owner {
  id: number;
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
  id: number;
  ownerId: number;
  name: string;
  abbr: string;
  logoUrl: string;
  confId: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: number;
  seasonId: number;
  franchiseId: number;
  confId: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface GSHLTeam {
  id: number;
  seasonId: number;
  franchiseId: number;
  name: string | null;
  abbr: string | null;
  logoUrl: string | null;
  isActive: boolean;
  confName: string | null;
  confAbbr: string | null;
  confLogoUrl: string | null;
  ownerId: number | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerNickname: string | null;
  ownerEmail: string | null;
  ownerOwing: number | null;
  ownerIsActive: boolean;
}

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  isActive: boolean;
  isSignable: boolean;
  seasonRk?: number | null;
  seasonRating?: number | null;
  overallRk?: number | null;
  overallRating?: number | null;
  salary?: number | null;
  age?: number | null;
  lineupPos?: RosterPosition | null;
  gshlTeamId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contract {
  id: number;
  playerId: number;
  signingFranchiseId: number;
  currentFranchiseId: number;
  seasonId: number;
  contractType: ContractType[];
  contractLength: number;
  contractSalary: number;
  signingDate: Date;
  startDate: Date;
  signingStatus: ContractStatus;
  expiryStatus: ContractStatus;
  expiryDate: Date;
  capHit: number;
  capHitEndDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Awards {
  id: number;
  seasonId: number;
  winnerId: number;
  nomineeIds: number[];
  award: AwardsList;
  createdAt: Date;
  updatedAt: Date;
}
export interface DraftPick {
  id: number;
  seasonId: number;
  gshlTeamId: number;
  originalTeamId?: number | null;
  round: number;
  pick: number;
  playerId?: number | null;
  isTraded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Player stat line types
export interface PlayerDayStatLine {
  id: number;
  seasonId: number;
  gshlTeamId: number;
  playerId: number;
  weekId: number;
  date: Date;
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
export interface PlayerWeekStatLine {
  id: number;
  seasonId: number;
  gshlTeamId: number;
  playerId: number;
  weekId: number;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  days: number;
  GP: number;
  MG: number;
  IR: number;
  IRPlus: number; // matches sheets config casing
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
export interface PlayerSplitStatLine {
  id: number;
  seasonId: number;
  gshlTeamId: number;
  playerId: number;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  seasonType: SeasonType;
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
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerTotalStatLine {
  id: number;
  seasonId: number;
  gshlTeamIds: number[]; // Note: plural in sheets config
  playerId: number;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  seasonType: SeasonType;
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
  createdAt: Date;
  updatedAt: Date;
}
export interface PlayerNHLStatLine {
  id: number;
  seasonId: number;
  playerId: number;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeam: string;
  age: number;
  GP: number;
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
  QS: number;
  RBS: number;
  TOI: number;
  seasonRating: number; // lowercase from sheets config
  overallRating: number; // lowercase from sheets config
  salary: number; // lowercase from sheets config
  createdAt: Date;
  updatedAt: Date;
}

// Archived stat line types
export interface ArchivedSkaterDayStatLine {
  id: number;
  originalId: number;
  seasonId: number;
  gshlTeamId: number;
  playerId: number;
  weekId: number;
  date: Date;
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
  id: number;
  originalId: number;
  seasonId: number;
  gshlTeamId: number;
  playerId: number;
  weekId: number;
  date: Date;
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
  id: number;
  seasonId: number;
  gshlTeamId: number;
  weekId: number;
  date: Date;
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
  id: number;
  seasonId: number;
  gshlTeamId: number;
  weekId: number;
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
  id: number;
  seasonId: number;
  seasonType: SeasonType;
  gshlTeamId: number;
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
  overallRk: number;
  conferenceRk: number;
  wildcardRk?: number | null;
  losersTournRk?: number | null;
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
