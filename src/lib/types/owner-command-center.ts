export interface OwnerCommandCenterTeam {
  id: string;
  name: string | null;
  abbr: string | null;
  logoUrl: string | null;
}

export interface OwnerCommandCenterRosterPlayer {
  id: string;
  fullName: string;
  nhlPos: string[];
  posGroup: string;
  nhlTeam: string | string[];
  lineupPos?: string | null;
  overallRating?: number | string | null;
}

export interface OwnerCommandCenterContract {
  id: string;
  playerId: string;
  ownerId: string;
  seasonId: string;
  contractType: string | string[];
  contractLength: number | string;
  contractSalary: number | string;
  signingDate: string;
  startDate: string;
  signingStatus?: string | null;
  expiryStatus?: string | null;
  expiryDate: string;
  capHit?: number | string | null;
  capHitEndDate?: string | null;
}

export interface OwnerCommandCenterDraftPick {
  id: string;
  seasonId: string;
  seasonName: string;
  round: string;
  pick: string | null;
  isTraded: boolean;
  originalTeamId: string | null;
}

export interface OwnerCommandCenterPendingOffer {
  id: string;
  playerId: string;
  playerName: string;
  seasonId: string;
  contractLength: number;
  salary: number;
  deadlineAt: string;
  groupStatus: string;
}

export interface OwnerCommandCenterListedPlayer {
  listingId: string;
  playerId: string;
  playerName: string;
  note: string | null;
  updatedAt: string;
}

export interface OwnerCommandCenterTradeActivity {
  id: string;
  listingId: string;
  playerName: string;
  teamName: string;
  occurredAt: string;
}

export interface OwnerCommandCenterMatchup {
  id: string;
  weekId: string;
  weekNum: number | string | null;
  weekStartDate: string | null;
  weekEndDate: string | null;
  gameType: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeWin: boolean | null;
  awayWin: boolean | null;
  tie: boolean | null;
  opponent: OwnerCommandCenterTeam | null;
}

export interface OwnerCommandCenterSeason {
  id: string;
  year: number;
  name: string;
  rosterSpots: string[];
  startDate: string;
  endDate: string;
  signingEndDate: string;
  isActive: boolean;
}

export interface OwnerCommandCenterData {
  ownerId: string;
  ownerName: string;
  season: OwnerCommandCenterSeason | null;
  seasons: OwnerCommandCenterSeason[];
  team: OwnerCommandCenterTeam | null;
  roster: OwnerCommandCenterRosterPlayer[];
  contracts: OwnerCommandCenterContract[];
  draftPicks: OwnerCommandCenterDraftPick[];
  pendingOffers: OwnerCommandCenterPendingOffer[];
  listedPlayers: OwnerCommandCenterListedPlayer[];
  nextMatchup: OwnerCommandCenterMatchup | null;
  recentMatchups: OwnerCommandCenterMatchup[];
  tradeActivity: OwnerCommandCenterTradeActivity[];
}

export interface OwnerCommandCenterActivityItem {
  id: string;
  kind: "trade" | "ufa";
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
}
