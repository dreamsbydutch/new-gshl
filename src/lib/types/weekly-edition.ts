export type WeeklyEditionGenerationMode =
  | "template"
  | "openai"
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
  | "primary_article"
  | "standard_article"
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
  | "season_predictions"
  | "league_notebook";

export interface WeeklyEditionLink {
  label: string;
  href: string;
}

export type WeeklyEditionAuthorScope = "league" | "conference" | "team";

export interface WeeklyEditionAuthor {
  name: string;
  position: string;
  scope: WeeklyEditionAuthorScope;
  teamId?: string;
  teamName?: string;
  conferenceId?: string;
  conferenceName?: string;
}

export interface WeeklyEditionStoryPitchScores {
  consequence: number;
  readerInterest: number;
  evidenceStrength: number;
  freshness: number;
}

export interface WeeklyEditionStoryPitch {
  pitchId: string;
  leadCandidateId: string;
  supportingCandidateIds: string[];
  proposedHeadline: string;
  angle: string;
  scores: WeeklyEditionStoryPitchScores;
}

export interface WeeklyEditionStorySubmission {
  author: WeeklyEditionAuthor;
  pitches: WeeklyEditionStoryPitch[];
}

export interface WeeklyEditionStoryAssignment extends WeeklyEditionStoryPitch {
  id: `article_${1 | 2 | 3 | 4 | 5 | 6}`;
  kind: "primary_article" | "standard_article";
  author: WeeklyEditionAuthor;
  editorialScore: number;
}

export interface WeeklyEditionSection {
  id: string;
  kind: WeeklyEditionSectionKind;
  eyebrow: string;
  headline: string;
  body: string;
  links: WeeklyEditionLink[];
  author?: WeeklyEditionAuthor;
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
  talentRating?: number;
  logoUrl?: string;
  conferenceId?: string;
  conferenceName?: string;
  conferenceLogoUrl?: string;
  beatWriter?: string;
  leadReporter?: string;
}

export interface WeeklyEditionMatchupFact {
  matchupId: string;
  gameType?: string;
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
  talentRating?: number;
}

export interface WeeklyEditionActivityFact {
  id: string;
  kind: "add" | "drop" | "signing" | "trade";
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
  gameType?: string;
  homeTeamName: string;
  awayTeamName: string;
  homeRank?: number;
  awayRank?: number;
}

export type WeeklyEditionEditorialCandidateKind =
  | "matchup"
  | "player_performance"
  | "team_performance"
  | "record"
  | "milestone"
  | "award_race"
  | "award"
  | "transaction"
  | "contract"
  | "cap"
  | "ufa"
  | "draft"
  | "gm_ranking"
  | "activity"
  | "performance"
  | "missed_start";

export type WeeklyEditionEditorialCandidateScope =
  | "day"
  | "week"
  | "season"
  | "career"
  | "franchise"
  | "league";

export interface WeeklyEditionEditorialMetric {
  key: string;
  label: string;
  value: number;
  previousValue?: number;
  threshold?: number;
}

export interface WeeklyEditionEditorialCandidate {
  id: string;
  kind: WeeklyEditionEditorialCandidateKind;
  scope: WeeklyEditionEditorialCandidateScope;
  importance: number;
  occurredAt?: string;
  headlineHint: string;
  summary: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  franchiseId?: string;
  franchiseName?: string;
  metrics: WeeklyEditionEditorialMetric[];
  links: WeeklyEditionLink[];
}

export interface WeeklyEditionPerformanceFact {
  id: string;
  entityType: "player" | "team";
  scope: "day" | "week" | "season";
  occurredAt?: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  rating: number;
  stats: Record<string, number>;
}

export interface WeeklyEditionRecordFact {
  id: string;
  entityType: "player" | "team";
  recordScope: "franchise" | "league";
  period: "day" | "week" | "season" | "career";
  playerId?: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  franchiseId?: string;
  franchiseName?: string;
  metric: WeeklyEditionEditorialMetric;
}

export interface WeeklyEditionMilestoneFact {
  id: string;
  teamId?: string;
  teamName: string;
  franchiseId: string;
  franchiseName: string;
  milestone:
    | "all_time_wins"
    | "conference_wins"
    | "playoff_wins"
    | "playoff_appearances";
  metric: WeeklyEditionEditorialMetric;
}

export interface WeeklyEditionAwardFact {
  id: string;
  awardKey: string;
  awardName: string;
  status: "race" | "won";
  leaderId: string;
  leaderName: string;
  leaderType: "player" | "team";
  nomineeNames: string[];
}

export interface WeeklyEditionRecordObservation {
  id: string;
  entityType: "player" | "team";
  period: "day" | "week" | "season" | "career";
  periodId: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  franchiseId?: string;
  franchiseName?: string;
  metrics: Record<string, number>;
  deltaMetrics?: Record<string, number>;
}

export interface WeeklyEditionAchievementSnapshot {
  id: string;
  teamId?: string;
  teamName: string;
  franchiseId: string;
  franchiseName: string;
  metrics: Record<
    | "all_time_wins"
    | "conference_wins"
    | "playoff_wins"
    | "playoff_appearances",
    number
  >;
  deltaMetrics: Record<
    | "all_time_wins"
    | "conference_wins"
    | "playoff_wins"
    | "playoff_appearances",
    number
  >;
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
  editorialCandidates: WeeklyEditionEditorialCandidate[];
  issueType: WeeklyEditionIssueType;
  issueLabel: string;
  milestone?: WeeklyEditionMilestoneFacts;
}

export interface WeeklyEditionContractFact {
  contractId: string;
  playerName: string;
  teamName: string;
  salary: number;
  signingStatus?: string;
  expiryStatus: string;
  expiryDate: string;
  updatedSalary?: number;
  signedAt?: string;
  canBeReSigned?: boolean;
  requiredReSigningSalary?: number;
  returnsToDraft?: boolean;
  playerRating?: number;
}

export interface WeeklyEditionSummerUfaFact {
  playerId: string;
  playerName: string;
  previousTeamName?: string;
  updatedSalary: number;
  requiredUfaSalary: number;
  rosterTalent?: number;
}

export interface WeeklyEditionBuyoutFact {
  contractId: string;
  playerName: string;
  teamName: string;
  capHit: number;
  capHitEndDate: string;
}

export interface WeeklyEditionGmRankingFact {
  rank: number;
  gmName: string;
  teamName?: string;
  rating: number;
  rankChange: number;
  overallWins: number;
  overallLosses: number;
  playoffAppearances: number;
  cups: number;
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
  draftSelectionsConsumed?: number;
}

export interface WeeklyEditionDraftPickFact {
  pickId: string;
  teamName: string;
  round: number;
  pick?: number;
  selectedPlayerName?: string;
  selectedPlayerRating?: number;
}

export interface WeeklyEditionMilestoneFacts {
  triggerDate: string;
  analysisSeasonId: string;
  analysisSeasonName: string;
  analysisSeasonSigningEndDate?: string;
  analysisSeasonDraftStartAt?: string;
  salaryCap: number;
  teamOutlooks: WeeklyEditionTeamOutlookFact[];
  expiringContracts: WeeklyEditionContractFact[];
  recentSignings: WeeklyEditionContractFact[];
  signedPlayers?: WeeklyEditionContractFact[];
  summerUfas?: WeeklyEditionSummerUfaFact[];
  buyoutCharges?: WeeklyEditionBuyoutFact[];
  gmRankings?: WeeklyEditionGmRankingFact[];
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
  isHomeActive?: boolean;
  inactiveSectionIds?: string[];
}

export interface WeeklyEditionHeroTeamBrand {
  teamId: string;
  logoUrl: string;
}

export interface WeeklyEditionHomeSummary {
  id: string;
  issueLabel: string;
  headline: string;
  heroTeams: WeeklyEditionHeroTeamBrand[];
}

export type WeeklyEditionReaderTeam = Pick<
  WeeklyEditionTeamFact,
  | "teamId"
  | "name"
  | "logoUrl"
  | "conferenceId"
  | "conferenceName"
  | "conferenceLogoUrl"
>;

export interface WeeklyEditionReaderDetail {
  issueType: WeeklyEditionIssueType;
  issueLabel: string;
  seasonName: string;
  startDate: number;
  endDate: number;
  scheduledFor: number;
  content: WeeklyEditionContent;
  facts: {
    teams: WeeklyEditionReaderTeam[];
  };
}

export interface WeeklyEditionArchiveSummary {
  id: string;
  seasonName: string;
  issueLabel: string;
  headline: string;
  deck: string;
}

export interface WeeklyEditionNewsroomSummary {
  id: string;
  seasonName: string;
  issueLabel: string;
  generationMode: WeeklyEditionGenerationMode;
  status: WeeklyEditionStatus;
  isHomeActive?: boolean;
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

export interface WeeklyEditionRevisionSummary {
  id: string;
  generationMode: WeeklyEditionGenerationMode;
  createdAt: number;
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
  talentRating?: unknown;
}

export interface WeeklyEditionContractSeasonSource {
  id: string;
  year: string | number;
  startDate?: string | number | null;
  endDate?: string | number | null;
}

export interface WeeklyEditionContractCoverageSource {
  seasonId: string;
  contractLength?: string | number | null;
  startDate?: string | number | null;
  expiryDate?: string | number | null;
  capHitEndDate?: string | number | null;
  contractType?: string | string[] | null;
  expiryStatus?: string | null;
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
  performances?: WeeklyEditionPerformanceFact[];
  records?: WeeklyEditionRecordFact[];
  milestones?: WeeklyEditionMilestoneFact[];
  awards?: WeeklyEditionAwardFact[];
}

export interface BuildMilestoneEditionFactPacketInput {
  issueType: Exclude<WeeklyEditionIssueType, "weekly">;
  issueLabel: string;
  triggerDate: string;
  analysisSeason: {
    id: string;
    name: string;
    signingEndDate?: string;
    draftStartAt?: string;
  };
  season: WeeklyEditionFactPacket["season"];
  week: WeeklyEditionFactPacket["week"];
  teams: WeeklyEditionTeamFact[];
  matchups?: Omit<WeeklyEditionMatchupFact, "rankUpset">[];
  stars?: WeeklyEditionSourcePlayer[];
  power?: WeeklyEditionSourcePower[];
  teamOutlooks: WeeklyEditionTeamOutlookFact[];
  expiringContracts: WeeklyEditionContractFact[];
  recentSignings: WeeklyEditionContractFact[];
  signedPlayers?: WeeklyEditionContractFact[];
  summerUfas?: WeeklyEditionSummerUfaFact[];
  buyoutCharges?: WeeklyEditionBuyoutFact[];
  gmRankings?: WeeklyEditionGmRankingFact[];
  draftPicks: WeeklyEditionDraftPickFact[];
  editorialCandidates?: WeeklyEditionEditorialCandidate[];
}

export interface BuildWeeklyEditionCategoryMarginsInput {
  categories: string[];
  homeTeamName: string;
  awayTeamName: string;
  homeStats: Record<string, unknown>;
  awayStats: Record<string, unknown>;
}

export interface WeeklyEditionPageProps {
  editionId: string;
}

export interface WeeklyEditionRouteProps {
  params: Promise<{ editionId: string }>;
}

export interface WeeklyEditionArticleProps {
  edition: WeeklyEditionReaderDetail;
  preview?: boolean;
  modal?: boolean;
  onClose?: () => void;
}

export interface WeeklyEditionEditorProps {
  content: WeeklyEditionContent;
  disabled?: boolean;
  onChange: (content: WeeklyEditionContent) => void;
}

export interface WeeklyEditionSectionCardProps {
  section: WeeklyEditionSection;
  featured?: boolean;
  teams?: WeeklyEditionReaderTeam[];
}

export interface WeeklyEditionQueryState<T> {
  data: T | undefined;
  isLoading: boolean;
}

export interface WeeklyEditionAiStatus {
  configured: boolean;
  model: string;
}

export interface WeeklyEditionAiGenerationResult {
  state: "inserted" | "updated";
  model: string;
  edition: WeeklyEdition;
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
