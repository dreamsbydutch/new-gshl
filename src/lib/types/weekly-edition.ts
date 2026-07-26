export type WeeklyEditionGenerationMode =
  | "template"
  | "chatgpt_import"
  | "manual";

export type WeeklyEditionStatus = "published" | "hidden";

export type WeeklyEditionIssueType =
  | "weekly"
  | "final_recap"
  | "resigning_outlook"
  | "offseason_market"
  | "pre_draft"
  | "preseason";

export type WeeklyEditionSectionKind =
  | "biggest_story"
  | "matchup_roundup"
  | "three_stars"
  | "power_movers"
  | "transaction_wire"
  | "missed_start"
  | "next_week"
  | "season_recap"
  | "expiring_contracts"
  | "cap_space"
  | "roster_outlook"
  | "ufa_market"
  | "draft_capital"
  | "season_predictions";

export interface WeeklyEditionLink {
  label: string;
  href: string;
}

export interface WeeklyEditionSection {
  id: string;
  kind: WeeklyEditionSectionKind;
  eyebrow: string;
  headline: string;
  body: string;
  links: WeeklyEditionLink[];
}

export interface WeeklyEditionContent {
  headline: string;
  deck: string;
  sections: WeeklyEditionSection[];
}

export interface WeeklyEditionTeamFact {
  teamId: string;
  name: string;
  abbr: string;
  logoUrl?: string;
}

export interface WeeklyEditionMatchupFact {
  matchupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homeRank?: number;
  awayRank?: number;
  competitiveRating?: number;
  winnerTeamId?: string;
  winnerTeamName?: string;
  loserTeamId?: string;
  loserTeamName?: string;
  rankUpset: number;
  categoryMargins: WeeklyEditionCategoryMarginFact[];
}

export interface WeeklyEditionCategoryMarginFact {
  category: string;
  homeValue: number;
  awayValue: number;
  winnerTeamName?: string;
  margin: number;
  inverse: boolean;
}

export interface WeeklyEditionStarFact {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  rating: number;
  points: number;
  wins: number;
}

export interface WeeklyEditionPowerMoverFact {
  teamId: string;
  teamName: string;
  currentRank: number;
  previousRank: number;
  rankChange: number;
  currentElo?: number;
  eloChange?: number;
}

export interface WeeklyEditionActivityFact {
  id: string;
  kind: "add" | "drop" | "signing";
  date: string;
  playerName: string;
  teamName: string;
  detail?: string;
}

export interface WeeklyEditionMissedStartFact {
  id: string;
  date: string;
  playerName: string;
  teamName: string;
  count: number;
}

export interface WeeklyEditionNextMatchupFact {
  matchupId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeRank?: number;
  awayRank?: number;
}

export interface WeeklyEditionFactPacket {
  version: 1;
  season: {
    id: string;
    name: string;
    year: string;
    endDate?: string;
    signingEndDate?: string;
    draftStartAt?: string;
  };
  week: {
    id: string;
    number: number;
    startDate: string;
    endDate: string;
  };
  teams: WeeklyEditionTeamFact[];
  matchups: WeeklyEditionMatchupFact[];
  heroMatchupId?: string;
  stars: WeeklyEditionStarFact[];
  powerMovers: WeeklyEditionPowerMoverFact[];
  activity: WeeklyEditionActivityFact[];
  missedStarts: WeeklyEditionMissedStartFact[];
  nextMatchups: WeeklyEditionNextMatchupFact[];
  knownEntityNames: string[];
  allowedNames: string[];
  allowedNumbers: string[];
  issueType: WeeklyEditionIssueType;
  issueLabel: string;
  milestone?: WeeklyEditionMilestoneFacts;
}

export interface WeeklyEditionContractFact {
  contractId: string;
  playerName: string;
  teamName: string;
  salary: number;
  expiryStatus: string;
  expiryDate: string;
}

export interface WeeklyEditionTeamOutlookFact {
  teamId: string;
  teamName: string;
  capSpace: number;
  committedSalary: number;
  rosterSize: number;
  rosterTalent: number;
  expiringCount: number;
  draftPickCount: number;
  firstRoundPickCount: number;
}

export interface WeeklyEditionDraftPickFact {
  pickId: string;
  teamName: string;
  round: number;
  pick?: number;
  selectedPlayerName?: string;
}

export interface WeeklyEditionMilestoneFacts {
  triggerDate: string;
  salaryCap: number;
  teamOutlooks: WeeklyEditionTeamOutlookFact[];
  expiringContracts: WeeklyEditionContractFact[];
  recentSignings: WeeklyEditionContractFact[];
  draftPicks: WeeklyEditionDraftPickFact[];
}

export interface WeeklyEdition {
  id: string;
  seasonId: string;
  weekId: string;
  editionKey: string;
  issueType: WeeklyEditionIssueType;
  issueLabel: string;
  seasonName: string;
  weekNum: number;
  startDate: number;
  endDate: number;
  status: WeeklyEditionStatus;
  generationMode: WeeklyEditionGenerationMode;
  content: WeeklyEditionContent;
  facts: WeeklyEditionFactPacket;
  sourceHash: string;
  publishedAt: number;
  scheduledFor: number;
  createdAt: number;
  updatedAt: number;
  editedBy?: string;
}

export interface WeeklyEditionRevision {
  id: string;
  editionId: string;
  generationMode: WeeklyEditionGenerationMode;
  content: WeeklyEditionContent;
  sourceHash: string;
  createdAt: number;
  editedBy?: string;
}

export interface WeeklyEditionValidationResult {
  valid: boolean;
  errors: string[];
  content?: WeeklyEditionContent;
}

export interface WeeklyEditionSourcePlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  rating: unknown;
  points: unknown;
  wins: unknown;
}

export interface WeeklyEditionSourcePower {
  teamId: string;
  teamName: string;
  currentRank: unknown;
  previousRank: unknown;
  currentElo?: unknown;
  previousElo?: unknown;
}

export interface BuildWeeklyEditionFactPacketInput {
  season: WeeklyEditionFactPacket["season"];
  week: WeeklyEditionFactPacket["week"];
  teams: WeeklyEditionTeamFact[];
  matchups: Omit<WeeklyEditionMatchupFact, "rankUpset">[];
  players: WeeklyEditionSourcePlayer[];
  power: WeeklyEditionSourcePower[];
  activity: WeeklyEditionActivityFact[];
  missedStarts: WeeklyEditionMissedStartFact[];
  nextMatchups: WeeklyEditionNextMatchupFact[];
  knownEntityNames: string[];
}

export interface BuildMilestoneEditionFactPacketInput {
  issueType: Exclude<WeeklyEditionIssueType, "weekly">;
  issueLabel: string;
  triggerDate: string;
  season: WeeklyEditionFactPacket["season"];
  week: WeeklyEditionFactPacket["week"];
  teams: WeeklyEditionTeamFact[];
  matchups?: Omit<WeeklyEditionMatchupFact, "rankUpset">[];
  stars?: WeeklyEditionSourcePlayer[];
  power?: WeeklyEditionSourcePower[];
  teamOutlooks: WeeklyEditionTeamOutlookFact[];
  expiringContracts: WeeklyEditionContractFact[];
  recentSignings: WeeklyEditionContractFact[];
  draftPicks: WeeklyEditionDraftPickFact[];
  knownEntityNames: string[];
}

export interface BuildWeeklyEditionCategoryMarginsInput {
  categories: string[];
  homeTeamName: string;
  awayTeamName: string;
  homeStats: Record<string, unknown>;
  awayStats: Record<string, unknown>;
}

export interface WeeklyEditionHomeCardProps {
  seasonId?: string;
}

export interface WeeklyEditionPageProps {
  editionId: string;
}

export interface WeeklyEditionRouteProps {
  params: Promise<{ editionId: string }>;
}

export interface WeeklyEditionArticleProps {
  edition: WeeklyEdition;
  preview?: boolean;
}

export interface WeeklyEditionEditorProps {
  content: WeeklyEditionContent;
  disabled?: boolean;
  onChange: (content: WeeklyEditionContent) => void;
}

export interface WeeklyEditionSectionCardProps {
  section: WeeklyEditionSection;
  featured?: boolean;
}

export interface WeeklyEditionQueryState<T> {
  data: T | undefined;
  isLoading: boolean;
}

export interface WeeklyEditionMilestoneScheduleInput {
  finalWeekEnd: string;
  signingEndDate?: string;
  draftStartAt?: string;
}

export interface WeeklyEditionMilestoneScheduleEntry {
  issueType: Exclude<WeeklyEditionIssueType, "weekly">;
  issueLabel: string;
  scheduledFor: string;
}
