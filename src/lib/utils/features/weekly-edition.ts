import { z } from "zod";
import type {
  BuildWeeklyEditionFactPacketInput,
  BuildWeeklyEditionCategoryMarginsInput,
  BuildMilestoneEditionFactPacketInput,
  WeeklyEditionContractFact,
  WeeklyEditionContractCoverageSource,
  WeeklyEditionContractSeasonSource,
  WeeklyEditionContent,
  WeeklyEditionEditorialCandidate,
  WeeklyEditionEditorialMetric,
  WeeklyEditionFactPacket,
  WeeklyEditionAchievementSnapshot,
  WeeklyEditionArticleCount,
  WeeklyEditionAuthor,
  WeeklyEditionMatchupFact,
  WeeklyEditionMilestoneScheduleEntry,
  WeeklyEditionMilestoneScheduleInput,
  WeeklyEdition,
  WeeklyEditionArchiveSummary,
  WeeklyEditionHomeSummary,
  WeeklyEditionNewsroomSummary,
  WeeklyEditionReaderDetail,
  WeeklyEditionRevision,
  WeeklyEditionRevisionSummary,
  WeeklyEditionSection,
  WeeklyEditionSectionKind,
  WeeklyEditionStoryAssignment,
  WeeklyEditionStorySubmission,
  WeeklyEditionRecordFact,
  WeeklyEditionRecordObservation,
  WeeklyEditionValidationResult,
} from "@gshl-types";
import { normalizeDateOnlyValue } from "../core/date";
import { ContractStatus, ContractType } from "../domain/constants";
import {
  buildWeeklyEditionArticleSlots,
  DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
  MAX_WEEKLY_EDITION_ARTICLE_COUNT,
  MIN_WEEKLY_EDITION_ARTICLE_COUNT,
  parseWeeklyEditionArticleCount,
  weeklyEditionArticleSlot,
} from "./weekly-edition-articles";

export const WEEKLY_EDITION_SECTION_KINDS = [
  "primary_article",
  "standard_article",
  "biggest_story",
  "matchup_roundup",
  "three_stars",
  "power_movers",
  "transaction_wire",
  "missed_start",
  "next_week",
  "season_recap",
  "expiring_contracts",
  "cap_space",
  "roster_outlook",
  "ufa_market",
  "draft_capital",
  "season_predictions",
  "league_notebook",
] as const satisfies readonly WeeklyEditionSectionKind[];

export const WEEKLY_EDITION_ISSUE_LABELS = {
  weekly: "Weekly Recap",
  final_recap: "Final Recap",
  resigning_outlook: "Re-signing Outlook",
  offseason_market: "Offseason Market",
  pre_draft: "Pre-Draft Issue",
  preseason: "Preseason Preview",
} as const;

/**
 * Keeps links stored in published editions intact while identifying Matchup
 * navigation as originating from the Press Box. Existing query values and
 * fragments are retained, and any stale source is replaced deterministically.
 */
export function buildWeeklyEditionCtaHref(href: string): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = hrefWithoutHash.indexOf("?");
  const pathname =
    queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;

  if (!/^\/matchup\/[^/?#]+\/?$/.test(pathname)) return href;

  const params = new URLSearchParams(
    queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "",
  );
  params.set("from", "headlines");

  return `${pathname}?${params.toString()}${hash}`;
}

export function buildWeeklyEditionHomeSummary(
  edition: Pick<WeeklyEdition, "id" | "issueLabel" | "content" | "facts">,
): WeeklyEditionHomeSummary {
  const heroMatchup = edition.facts.matchups.find(
    (matchup) => matchup.matchupId === edition.facts.heroMatchupId,
  );
  const heroTeamIds = heroMatchup
    ? [heroMatchup.awayTeamId, heroMatchup.homeTeamId]
    : [];

  return {
    id: edition.id,
    issueLabel: edition.issueLabel,
    headline: edition.content.headline,
    heroTeams: heroTeamIds.flatMap((teamId) => {
      const team = edition.facts.teams.find(
        (candidate) => candidate.teamId === teamId,
      );
      return team?.logoUrl
        ? [{ teamId: team.teamId, logoUrl: team.logoUrl }]
        : [];
    }),
  };
}

/** Projects a published issue to the exact fields rendered by the reader. */
export function buildWeeklyEditionReaderDetail(
  edition: Pick<
    WeeklyEdition,
    | "issueType"
    | "issueLabel"
    | "seasonName"
    | "startDate"
    | "endDate"
    | "scheduledFor"
    | "content"
    | "facts"
    | "inactiveSectionIds"
  >,
): WeeklyEditionReaderDetail {
  return {
    issueType: edition.issueType,
    issueLabel: edition.issueLabel,
    seasonName: edition.seasonName,
    startDate: edition.startDate,
    endDate: edition.endDate,
    scheduledFor: edition.scheduledFor,
    content: filterWeeklyEditionContent(
      edition.content,
      edition.inactiveSectionIds ?? [],
    ),
    facts: {
      teams: edition.facts.teams.map((team) => ({
        teamId: team.teamId,
        name: team.name,
        ...(team.logoUrl === undefined ? {} : { logoUrl: team.logoUrl }),
        ...(team.conferenceId === undefined
          ? {}
          : { conferenceId: team.conferenceId }),
        ...(team.conferenceName === undefined
          ? {}
          : { conferenceName: team.conferenceName }),
        ...(team.conferenceLogoUrl === undefined
          ? {}
          : { conferenceLogoUrl: team.conferenceLogoUrl }),
      })),
    },
  };
}

export function buildWeeklyEditionArchiveSummary(
  edition: Pick<WeeklyEdition, "id" | "seasonName" | "issueLabel" | "content">,
): WeeklyEditionArchiveSummary {
  return {
    id: edition.id,
    seasonName: edition.seasonName,
    issueLabel: edition.issueLabel,
    headline: edition.content.headline,
    deck: edition.content.deck,
  };
}

export function buildWeeklyEditionNewsroomSummary(
  edition: Pick<
    WeeklyEdition,
    | "id"
    | "seasonName"
    | "issueLabel"
    | "generationMode"
    | "status"
    | "isHomeActive"
  >,
): WeeklyEditionNewsroomSummary {
  return {
    id: edition.id,
    seasonName: edition.seasonName,
    issueLabel: edition.issueLabel,
    generationMode: edition.generationMode,
    status: edition.status,
    ...(edition.isHomeActive === undefined
      ? {}
      : { isHomeActive: edition.isHomeActive }),
  };
}

export function buildWeeklyEditionRevisionSummary(
  revision: Pick<WeeklyEditionRevision, "id" | "generationMode" | "createdAt">,
): WeeklyEditionRevisionSummary {
  return {
    id: revision.id,
    generationMode: revision.generationMode,
    createdAt: revision.createdAt,
  };
}

function shiftEditionDate(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildWeeklyEditionMilestoneSchedule({
  finalWeekEnd,
  signingEndDate,
  draftStartAt,
}: WeeklyEditionMilestoneScheduleInput): WeeklyEditionMilestoneScheduleEntry[] {
  const draftDate = String(draftStartAt ?? "").slice(0, 10);
  return [
    {
      issueType: "final_recap" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.final_recap,
      scheduledFor: finalWeekEnd.slice(0, 10),
    },
    {
      issueType: "resigning_outlook" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.resigning_outlook,
      scheduledFor: shiftEditionDate(finalWeekEnd, 7),
    },
    {
      issueType: "offseason_market" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.offseason_market,
      scheduledFor: String(signingEndDate ?? "").slice(0, 10),
    },
    {
      issueType: "pre_draft" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.pre_draft,
      scheduledFor: shiftEditionDate(draftDate, -7),
    },
    {
      issueType: "preseason" as const,
      issueLabel: WEEKLY_EDITION_ISSUE_LABELS.preseason,
      scheduledFor: shiftEditionDate(draftDate, 1),
    },
  ].filter((item) => item.scheduledFor);
}

const sectionKindSchema = z.enum(WEEKLY_EDITION_SECTION_KINDS);
const linkSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    href: z.string().trim().min(1).max(200),
  })
  .strict();
const authorSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    position: z.string().trim().min(1).max(100),
    scope: z.enum(["league", "conference", "team"]),
    teamId: z.string().trim().min(1).max(80).optional(),
    teamName: z.string().trim().min(1).max(100).optional(),
    conferenceId: z.string().trim().min(1).max(80).optional(),
    conferenceName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    kind: sectionKindSchema,
    eyebrow: z.string().trim().min(1).max(50),
    headline: z.string().trim().min(1).max(90),
    body: z.string().trim().min(1).max(1000),
    links: z.array(linkSchema).max(4),
    author: authorSchema.optional(),
  })
  .strict();
const contentSchema = z
  .object({
    headline: z.string().trim().min(1).max(90),
    deck: z.string().trim().min(1).max(220),
    sections: z
      .array(sectionSchema)
      .min(MIN_WEEKLY_EDITION_ARTICLE_COUNT)
      .max(MAX_WEEKLY_EDITION_ARTICLE_COUNT),
  })
  .strict();

const numberValue = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const INVERSE_CATEGORIES = new Set(["GAA"]);
const NON_PLAYING_CONTRACT_STATUSES = new Set<string>([
  String(ContractStatus.BUYOUT),
  String(ContractStatus.RETIRED),
  String(ContractStatus.INJURED),
]);

export function isWeeklyEditionPlayingContract(
  contract: WeeklyEditionContractCoverageSource,
) {
  if (NON_PLAYING_CONTRACT_STATUSES.has(String(contract.expiryStatus))) {
    return false;
  }
  const types = Array.isArray(contract.contractType)
    ? contract.contractType.map(String)
    : [String(contract.contractType)];
  return types.some(
    (type) =>
      type === String(ContractType.STANDARD) ||
      type === String(ContractType.EXTENSION),
  );
}

export function weeklyEditionContractAffectsSeason(
  contract: WeeklyEditionContractCoverageSource,
  season: WeeklyEditionContractSeasonSource,
  seasons: WeeklyEditionContractSeasonSource[],
) {
  const seasonStart = normalizeDateOnlyValue(season.startDate);
  const seasonEnd = normalizeDateOnlyValue(season.endDate);
  const contractStart = normalizeDateOnlyValue(contract.startDate);
  const contractEnd = normalizeDateOnlyValue(
    contract.capHitEndDate ?? contract.expiryDate,
  );
  if (seasonStart && seasonEnd && contractStart && contractEnd) {
    return contractStart <= seasonEnd && contractEnd >= seasonStart;
  }

  const ordered = [...seasons].sort(
    (left, right) =>
      numberValue(left.year) - numberValue(right.year) ||
      left.id.localeCompare(right.id),
  );
  const signingIndex = ordered.findIndex(
    (candidate) => candidate.id === contract.seasonId,
  );
  const seasonIndex = ordered.findIndex(
    (candidate) => candidate.id === season.id,
  );
  const length = numberValue(contract.contractLength);
  return (
    signingIndex >= 0 &&
    seasonIndex > signingIndex &&
    seasonIndex <= signingIndex + length
  );
}

export function buildWeeklyEditionCategoryMargins({
  categories,
  homeTeamName,
  awayTeamName,
  homeStats,
  awayStats,
}: BuildWeeklyEditionCategoryMarginsInput) {
  return categories
    .map((category) => {
      const homeValue = optionalNumber(homeStats[category]);
      const awayValue = optionalNumber(awayStats[category]);
      if (homeValue === undefined || awayValue === undefined) return null;
      const inverse = INVERSE_CATEGORIES.has(category.toUpperCase());
      const homeWon = inverse ? homeValue < awayValue : homeValue > awayValue;
      const awayWon = inverse ? awayValue < homeValue : awayValue > homeValue;
      return {
        category,
        homeValue,
        awayValue,
        winnerTeamName: homeWon
          ? homeTeamName
          : awayWon
            ? awayTeamName
            : undefined,
        margin: Math.abs(homeValue - awayValue),
        inverse,
      };
    })
    .filter((item) => item !== null)
    .sort(
      (left, right) =>
        right.margin - left.margin ||
        left.category.localeCompare(right.category),
    );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value?.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function hashWeeklyEditionSource(value: unknown) {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function winnerForMatchup(
  matchup: Omit<WeeklyEditionMatchupFact, "rankUpset">,
): WeeklyEditionMatchupFact {
  const homeWon = matchup.homeScore > matchup.awayScore;
  const awayWon = matchup.awayScore > matchup.homeScore;
  const winnerTeamId = homeWon
    ? matchup.homeTeamId
    : awayWon
      ? matchup.awayTeamId
      : undefined;
  const winnerTeamName = homeWon
    ? matchup.homeTeamName
    : awayWon
      ? matchup.awayTeamName
      : undefined;
  const loserTeamId = homeWon
    ? matchup.awayTeamId
    : awayWon
      ? matchup.homeTeamId
      : undefined;
  const loserTeamName = homeWon
    ? matchup.awayTeamName
    : awayWon
      ? matchup.homeTeamName
      : undefined;
  const winnerRank = homeWon ? matchup.homeRank : matchup.awayRank;
  const loserRank = homeWon ? matchup.awayRank : matchup.homeRank;
  const rankUpset =
    winnerRank !== undefined && loserRank !== undefined
      ? Math.max(0, winnerRank - loserRank)
      : 0;
  return {
    ...matchup,
    winnerTeamId,
    winnerTeamName,
    loserTeamId,
    loserTeamName,
    rankUpset,
  };
}

function selectHeroMatchup(matchups: WeeklyEditionMatchupFact[]) {
  return [...pressBoxMatchups(matchups)].sort((left, right) => {
    const stageDifference =
      playoffMatchupPriority(right) - playoffMatchupPriority(left);
    if (stageDifference !== 0) return stageDifference;
    if (right.rankUpset !== left.rankUpset)
      return right.rankUpset - left.rankUpset;
    const ratingDifference =
      (right.competitiveRating ?? 0) - (left.competitiveRating ?? 0);
    if (ratingDifference !== 0) return ratingDifference;
    const leftMargin = Math.abs(left.homeScore - left.awayScore);
    const rightMargin = Math.abs(right.homeScore - right.awayScore);
    if (leftMargin !== rightMargin) return leftMargin - rightMargin;
    return left.matchupId.localeCompare(right.matchupId);
  })[0];
}

function playoffMatchupPriority(matchup: WeeklyEditionMatchupFact) {
  return playoffGameTypePriority(matchup.gameType);
}

function playoffGameTypePriority(gameType?: string) {
  if (gameType === "F") return 3;
  if (gameType === "SF") return 2;
  if (gameType === "QF") return 1;
  return 0;
}

function pressBoxMatchups(matchups: WeeklyEditionMatchupFact[]) {
  return matchups.filter((matchup) => matchup.gameType !== "LT");
}

function pressBoxNextMatchups(
  matchups: WeeklyEditionFactPacket["nextMatchups"],
) {
  return matchups
    .filter((matchup) => matchup.gameType !== "LT")
    .sort(
      (left, right) =>
        playoffGameTypePriority(right.gameType) -
        playoffGameTypePriority(left.gameType),
    );
}

function pressBoxEditorialCandidates(packet: WeeklyEditionFactPacket) {
  const loserTournamentCandidateIds = new Set(
    packet.matchups
      .filter((matchup) => matchup.gameType === "LT")
      .map((matchup) => `matchup:${matchup.matchupId}`),
  );
  return (packet.editorialCandidates ?? []).filter(
    (candidate) => !loserTournamentCandidateIds.has(candidate.id),
  );
}

const metricText = (metric: WeeklyEditionEditorialMetric) =>
  `${metric.label}: ${metric.value}${
    metric.previousValue === undefined
      ? ""
      : ` (previous record ${metric.previousValue})`
  }`;

const candidateImportance = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

function recordFact(
  observation: WeeklyEditionRecordObservation,
  recordScope: "franchise" | "league",
  key: string,
  label: string,
  value: number,
  previousValue: number,
): WeeklyEditionRecordFact {
  return {
    id: `${observation.id}:${recordScope}:${key}`,
    entityType: observation.entityType,
    recordScope,
    period: observation.period,
    playerId: observation.playerId,
    playerName: observation.playerName,
    teamId: observation.teamId,
    teamName: observation.teamName,
    franchiseId: observation.franchiseId,
    franchiseName: observation.franchiseName,
    metric: { key, label, value, previousValue },
  };
}

export function buildWeeklyEditionPeriodRecordFacts({
  current,
  historical,
  metricLabels,
}: {
  current: WeeklyEditionRecordObservation[];
  historical: WeeklyEditionRecordObservation[];
  metricLabels: Record<string, string>;
}) {
  const records: WeeklyEditionRecordFact[] = [];
  for (const observation of current) {
    for (const [key, label] of Object.entries(metricLabels)) {
      const value = observation.metrics[key] ?? 0;
      if (value <= 0) continue;
      const comparable = historical.filter(
        (row) =>
          row.entityType === observation.entityType &&
          row.period === observation.period,
      );
      const leaguePrevious = Math.max(
        0,
        ...comparable.map((row) => row.metrics[key] ?? 0),
      );
      const delta = observation.deltaMetrics?.[key];
      const crossedLeagueRecord =
        delta === undefined || value - delta <= leaguePrevious;
      if (leaguePrevious > 0 && value > leaguePrevious && crossedLeagueRecord) {
        records.push(
          recordFact(observation, "league", key, label, value, leaguePrevious),
        );
        continue;
      }
      if (!observation.franchiseId) continue;
      const franchisePrevious = Math.max(
        0,
        ...comparable
          .filter((row) => row.franchiseId === observation.franchiseId)
          .map((row) => row.metrics[key] ?? 0),
      );
      const crossedFranchiseRecord =
        delta === undefined || value - delta <= franchisePrevious;
      if (
        franchisePrevious > 0 &&
        value > franchisePrevious &&
        crossedFranchiseRecord
      ) {
        records.push(
          recordFact(
            observation,
            "franchise",
            key,
            label,
            value,
            franchisePrevious,
          ),
        );
      }
    }
  }
  return records;
}

export function buildWeeklyEditionCareerRecordFacts({
  snapshots,
  metricLabels,
  recordScopes = ["league", "franchise"],
}: {
  snapshots: WeeklyEditionRecordObservation[];
  metricLabels: Record<string, string>;
  recordScopes?: Array<"league" | "franchise">;
}) {
  const records: WeeklyEditionRecordFact[] = [];
  for (const snapshot of snapshots) {
    for (const [key, label] of Object.entries(metricLabels)) {
      const value = snapshot.metrics[key] ?? 0;
      const delta = snapshot.deltaMetrics?.[key] ?? 0;
      if (value <= 0 || delta <= 0) continue;
      const before = value - delta;
      const peers = snapshots.filter(
        (row) =>
          row.entityType === snapshot.entityType && row.id !== snapshot.id,
      );
      const leagueAfter = Math.max(
        0,
        ...peers.map((row) => row.metrics[key] ?? 0),
      );
      const leagueBefore = Math.max(
        0,
        ...peers.map(
          (row) => (row.metrics[key] ?? 0) - (row.deltaMetrics?.[key] ?? 0),
        ),
      );
      if (
        recordScopes.includes("league") &&
        leagueAfter > 0 &&
        value > leagueAfter &&
        before <= leagueBefore
      ) {
        records.push(
          recordFact(snapshot, "league", key, label, value, leagueBefore),
        );
        continue;
      }
      if (!recordScopes.includes("franchise") || !snapshot.franchiseId) {
        continue;
      }
      const franchisePeers = peers.filter(
        (row) => row.franchiseId === snapshot.franchiseId,
      );
      const franchiseAfter = Math.max(
        0,
        ...franchisePeers.map((row) => row.metrics[key] ?? 0),
      );
      const franchiseBefore = Math.max(
        0,
        ...franchisePeers.map(
          (row) => (row.metrics[key] ?? 0) - (row.deltaMetrics?.[key] ?? 0),
        ),
      );
      if (
        franchiseAfter > 0 &&
        value > franchiseAfter &&
        before <= franchiseBefore
      ) {
        records.push(
          recordFact(snapshot, "franchise", key, label, value, franchiseBefore),
        );
      }
    }
  }
  return records;
}

export function buildWeeklyEditionMilestoneFacts(
  snapshots: WeeklyEditionAchievementSnapshot[],
) {
  const intervals = {
    all_time_wins: 10,
    conference_wins: 10,
    playoff_wins: 5,
    playoff_appearances: 5,
  } as const;
  const labels = {
    all_time_wins: "All-time wins",
    conference_wins: "Conference wins",
    playoff_wins: "Playoff wins",
    playoff_appearances: "Playoff appearances",
  } as const;
  return snapshots.flatMap((snapshot) =>
    (Object.keys(intervals) as Array<keyof typeof intervals>).flatMap((key) => {
      const value = snapshot.metrics[key];
      const delta = snapshot.deltaMetrics[key];
      const previousValue = value - delta;
      const interval = intervals[key];
      const threshold =
        key === "playoff_appearances" && previousValue === 0 && value === 1
          ? 1
          : Math.floor(value / interval) * interval;
      if (
        delta <= 0 ||
        threshold <= 0 ||
        previousValue >= threshold ||
        value < threshold
      ) {
        return [];
      }
      return [
        {
          id: `${snapshot.id}:${key}:${threshold}`,
          teamId: snapshot.teamId,
          teamName: snapshot.teamName,
          franchiseId: snapshot.franchiseId,
          franchiseName: snapshot.franchiseName,
          milestone: key,
          metric: {
            key,
            label: labels[key],
            value,
            previousValue,
            threshold,
          },
        },
      ];
    }),
  );
}

export function buildWeeklyEditionEditorialCandidates(
  input: BuildWeeklyEditionFactPacketInput,
  matchups: WeeklyEditionMatchupFact[],
): WeeklyEditionEditorialCandidate[] {
  const candidates: WeeklyEditionEditorialCandidate[] = [];
  for (const matchup of pressBoxMatchups(matchups)) {
    const playoffWeight =
      matchup.gameType === "F"
        ? 100
        : matchup.gameType === "SF"
          ? 94
          : matchup.gameType === "QF"
            ? 90
            : 0;
    const importance = Math.max(
      playoffWeight,
      candidateImportance(
        58 +
          matchup.rankUpset * 5 +
          Math.min(matchup.competitiveRating ?? 0, 20),
      ),
    );
    candidates.push({
      id: `matchup:${matchup.matchupId}`,
      kind: "matchup",
      scope: "week",
      importance,
      headlineHint:
        matchup.gameType === "F" && matchup.winnerTeamName
          ? `${matchup.winnerTeamName} wins the GSHL Final`
          : matchup.gameType === "SF" && matchup.winnerTeamName
            ? `${matchup.winnerTeamName} advances through the semifinal`
            : matchup.gameType === "QF" && matchup.winnerTeamName
              ? `${matchup.winnerTeamName} wins its quarterfinal`
              : matchup.winnerTeamName
                ? `${matchup.winnerTeamName} defeats ${matchup.loserTeamName}`
                : `${matchup.homeTeamName} and ${matchup.awayTeamName} finish level`,
      summary: matchupSummary(matchup),
      teamId: matchup.winnerTeamId,
      teamName: matchup.winnerTeamName,
      metrics: [
        {
          key: "homeScore",
          label: matchup.homeTeamName,
          value: matchup.homeScore,
        },
        {
          key: "awayScore",
          label: matchup.awayTeamName,
          value: matchup.awayScore,
        },
        ...(matchup.rankUpset > 0
          ? [
              {
                key: "rankUpset",
                label: "Ranking places overcome",
                value: matchup.rankUpset,
              },
            ]
          : []),
      ],
      links: [
        {
          label: "Open matchup",
          href: `/matchup/${matchup.matchupId}`,
        },
      ],
    });
  }

  const performances = [...(input.performances ?? [])];
  const existingPlayerWeekIds = new Set(
    performances
      .filter(
        (performance) =>
          performance.entityType === "player" && performance.scope === "week",
      )
      .map((performance) => performance.playerId),
  );
  performances.push(
    ...input.players
      .filter((player) => !existingPlayerWeekIds.has(player.playerId))
      .map((player) => ({
        id: `weekly-star:${player.playerId}`,
        entityType: "player" as const,
        scope: "week" as const,
        playerId: player.playerId,
        playerName: player.playerName,
        teamId: player.teamId,
        teamName: player.teamName,
        rating: numberValue(player.rating),
        stats: {
          P: numberValue(player.points),
          W: numberValue(player.wins),
        },
      }))
      .sort(
        (left, right) =>
          right.rating - left.rating ||
          left.playerName.localeCompare(right.playerName),
      )
      .filter((performance, index) => performance.rating >= 85 || index < 3),
  );
  for (const performance of performances) {
    const ratingBonus =
      performance.rating >= 95
        ? 98
        : performance.rating >= 90
          ? 93
          : performance.rating >= 85
            ? 88
            : performance.scope === "season"
              ? 76
              : 70;
    const metrics = [
      {
        key: "Rating",
        label: "Rating",
        value: performance.rating,
      },
      ...Object.entries(performance.stats)
        .filter(([, value]) => value !== 0)
        .slice(0, 6)
        .map(([key, value]) => ({ key, label: key, value })),
    ];
    const entityName =
      performance.entityType === "player"
        ? performance.playerName
        : performance.teamName;
    const statSummary = metrics.slice(1).map(metricText).join(", ");
    candidates.push({
      id: `performance:${performance.id}`,
      kind:
        performance.entityType === "player"
          ? "player_performance"
          : "team_performance",
      scope: performance.scope,
      importance: ratingBonus,
      occurredAt: performance.occurredAt,
      headlineHint: `${entityName ?? "GSHL standout"} posts a ${performance.rating.toFixed(1)} rating`,
      summary: `${entityName ?? "GSHL standout"} produced a ${performance.rating.toFixed(1)} ${performance.scope} rating.${statSummary ? ` ${statSummary}.` : ""}`,
      playerId: performance.playerId,
      playerName: performance.playerName,
      teamId: performance.teamId,
      teamName: performance.teamName,
      metrics,
      links: [],
    });
  }

  for (const record of input.records ?? []) {
    const subjectName =
      record.entityType === "player" ? record.playerName : record.teamName;
    candidates.push({
      id: `record:${record.id}`,
      kind: "record",
      scope: record.recordScope,
      importance:
        record.recordScope === "league"
          ? record.period === "career"
            ? 100
            : 97
          : record.period === "career"
            ? 96
            : 92,
      headlineHint: `${subjectName ?? "A GSHL standout"} sets a ${record.recordScope} ${record.period} record`,
      summary: `${subjectName ?? "A GSHL standout"} set a new ${record.recordScope} ${record.period} record in ${record.metric.label}: ${record.metric.value}, passing ${record.metric.previousValue ?? 0}.`,
      playerId: record.playerId,
      playerName: record.playerName,
      teamId: record.teamId,
      teamName: record.teamName,
      franchiseId: record.franchiseId,
      franchiseName: record.franchiseName,
      metrics: [record.metric],
      links: [],
    });
  }

  for (const milestone of input.milestones ?? []) {
    const label = milestone.milestone.replaceAll("_", " ");
    candidates.push({
      id: `milestone:${milestone.id}`,
      kind: "milestone",
      scope: "franchise",
      importance: milestone.milestone === "playoff_appearances" ? 91 : 89,
      headlineHint: `${milestone.franchiseName} reaches ${milestone.metric.value} ${label}`,
      summary: `${milestone.franchiseName} reached ${milestone.metric.value} ${label}, crossing the ${milestone.metric.threshold ?? milestone.metric.value} milestone.`,
      teamId: milestone.teamId,
      teamName: milestone.teamName,
      franchiseId: milestone.franchiseId,
      franchiseName: milestone.franchiseName,
      metrics: [milestone.metric],
      links: [],
    });
  }

  for (const award of input.awards ?? []) {
    candidates.push({
      id: `award:${award.id}`,
      kind: award.status === "won" ? "award" : "award_race",
      scope: "season",
      importance: award.status === "won" ? 95 : 78,
      headlineHint:
        award.status === "won"
          ? `${award.leaderName} wins the ${award.awardName}`
          : `${award.leaderName} leads the ${award.awardName} race`,
      summary:
        award.status === "won"
          ? `${award.leaderName} won the ${award.awardName}.`
          : `${award.leaderName} leads the ${award.awardName} race ahead of ${award.nomineeNames.join(", ") || "the field"}.`,
      playerId: award.leaderType === "player" ? award.leaderId : undefined,
      playerName: award.leaderType === "player" ? award.leaderName : undefined,
      teamId: award.leaderType === "team" ? award.leaderId : undefined,
      teamName: award.leaderType === "team" ? award.leaderName : undefined,
      metrics: [],
      links: [],
    });
  }

  for (const activity of input.activity) {
    const activityTeam = input.teams.find(
      (team) => team.name === activity.teamName,
    );
    const importance =
      activity.kind === "trade"
        ? 82
        : activity.kind === "signing"
          ? 72
          : activity.kind === "add"
            ? 55
            : 48;
    candidates.push({
      id: `transaction:${activity.id}`,
      kind: "transaction",
      scope: "week",
      importance,
      occurredAt: activity.date,
      headlineHint: `${activity.teamName} ${activity.kind === "trade" ? "acquires" : activity.kind === "drop" ? "drops" : "adds"} ${activity.playerName}`,
      summary: `${activity.teamName} recorded a ${activity.kind} involving ${activity.playerName}${activity.detail ? ` (${activity.detail})` : ""}.`,
      playerName: activity.playerName,
      teamId: activityTeam?.teamId,
      teamName: activity.teamName,
      metrics: [],
      links: [],
    });
  }

  for (const missed of input.missedStarts) {
    const missedStartTeam = input.teams.find(
      (team) => team.name === missed.teamName,
    );
    candidates.push({
      id: `missed-start:${missed.id}`,
      kind: "missed_start",
      scope: "week",
      importance: candidateImportance(42 + missed.count * 5),
      occurredAt: missed.date,
      headlineHint: `${missed.teamName} leaves ${missed.count} start${missed.count === 1 ? "" : "s"} unused`,
      summary: `${missed.playerName} accounted for ${missed.count} missed start${missed.count === 1 ? "" : "s"} for ${missed.teamName}.`,
      playerName: missed.playerName,
      teamId: missedStartTeam?.teamId,
      teamName: missed.teamName,
      metrics: [
        {
          key: "missedStarts",
          label: "Missed starts",
          value: missed.count,
        },
      ],
      links: [],
    });
  }

  for (const mover of input.power) {
    const currentRank = numberValue(mover.currentRank);
    const previousRank = numberValue(mover.previousRank);
    const rankChange = previousRank - currentRank;
    if (rankChange === 0) continue;
    candidates.push({
      id: `power:${mover.teamId}`,
      kind: "team_performance",
      scope: "week",
      importance: candidateImportance(60 + Math.abs(rankChange) * 4),
      headlineHint: `${mover.teamName} ${rankChange > 0 ? "climbs" : "slides"} ${Math.abs(rankChange)} power-ranking spot${Math.abs(rankChange) === 1 ? "" : "s"}`,
      summary: `${mover.teamName} moved from No. ${previousRank} to No. ${currentRank} in the weekly power rankings.`,
      teamId: mover.teamId,
      teamName: mover.teamName,
      metrics: [
        {
          key: "powerRank",
          label: "Power rank",
          value: currentRank,
          previousValue: previousRank,
        },
      ],
      links: [],
    });
  }

  return candidates
    .sort(
      (left, right) =>
        right.importance - left.importance || left.id.localeCompare(right.id),
    )
    .slice(0, 40);
}

export function buildWeeklyEditionFactPacket(
  input: BuildWeeklyEditionFactPacketInput,
): WeeklyEditionFactPacket {
  const matchups = input.matchups.map(winnerForMatchup);
  const hero = selectHeroMatchup(matchups);
  if (matchups.length === 0) throw new Error("A completed matchup is required");

  const stars = input.players
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      teamId: player.teamId,
      teamName: player.teamName,
      rating: numberValue(player.rating),
      points: numberValue(player.points),
      wins: numberValue(player.wins),
    }))
    .sort(
      (left, right) =>
        right.rating - left.rating ||
        right.points - left.points ||
        right.wins - left.wins ||
        left.playerName.localeCompare(right.playerName),
    )
    .slice(0, 3);

  const powerMovers = input.power
    .map((team) => {
      const currentRank = numberValue(team.currentRank);
      const previousRank = numberValue(team.previousRank);
      const currentElo = optionalNumber(team.currentElo);
      const previousElo = optionalNumber(team.previousElo);
      const talentRating = optionalNumber(team.talentRating);
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
        talentRating,
        eloChange:
          currentElo !== undefined && previousElo !== undefined
            ? currentElo - previousElo
            : undefined,
      };
    })
    .filter((team) => team.currentRank > 0 && team.previousRank > 0)
    .sort(
      (left, right) =>
        Math.abs(right.rankChange) - Math.abs(left.rankChange) ||
        right.rankChange - left.rankChange ||
        left.teamName.localeCompare(right.teamName),
    )
    .slice(0, 4);

  return {
    version: 1 as const,
    season: input.season,
    week: input.week,
    teams: [...input.teams].sort((a, b) => a.name.localeCompare(b.name)),
    matchups,
    heroMatchupId: hero?.matchupId,
    stars,
    powerMovers,
    activity: [...input.activity].sort((a, b) => a.date.localeCompare(b.date)),
    missedStarts: [...input.missedStarts].sort(
      (a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName),
    ),
    nextMatchups: input.nextMatchups,
    editorialCandidates: buildWeeklyEditionEditorialCandidates(input, matchups),
    issueType: "weekly" as const,
    issueLabel: `Week ${input.week.number}`,
  };
}

function weeklyEditionMoney(value: number) {
  const amount = Math.abs(value) / 1_000_000;
  const formatted = amount.toFixed(2).replace(/\.?0+$/, "") || "0";
  return `${value < 0 ? "-" : ""}$${formatted}M`;
}

function buildMilestoneEditorialCandidates(
  input: BuildMilestoneEditionFactPacketInput,
) {
  if (input.issueType === "final_recap") {
    const matchups = (input.matchups ?? []).map(winnerForMatchup);
    const candidates = buildWeeklyEditionEditorialCandidates(
      {
        season: input.season,
        week: input.week,
        teams: input.teams,
        matchups: input.matchups ?? [],
        players: input.stars ?? [],
        power: input.power ?? [],
        activity: [],
        missedStarts: [],
        nextMatchups: [],
      },
      matchups,
    );
    const finalPower = (input.power ?? []).map((team) => {
      const finalRank = numberValue(team.currentRank);
      const talentRating = optionalNumber(team.talentRating);
      return {
        id: `final-power:${team.teamId}`,
        kind: "team_performance" as const,
        scope: "season" as const,
        importance: candidateImportance(78 - Math.min(finalRank * 2, 20)),
        headlineHint: `${team.teamName} finishes No. ${finalRank} in the power rankings`,
        summary: `${team.teamName} finished No. ${finalRank} in the final power rankings${talentRating === undefined ? "" : ` with a ${talentRating.toFixed(1)} roster-talent rating`}.`,
        teamId: team.teamId,
        teamName: team.teamName,
        metrics: [
          {
            key: "finalPowerRank",
            label: "Final power rank",
            value: finalRank,
          },
        ],
        links: [],
      };
    });
    return [...candidates, ...finalPower]
      .filter(
        (candidate, index, rows) =>
          rows.findIndex((row) => row.id === candidate.id) === index,
      )
      .sort(
        (left, right) =>
          right.importance - left.importance || left.id.localeCompare(right.id),
      );
  }
  const candidates: WeeklyEditionEditorialCandidate[] = [];
  const teamIdByName = new Map(
    input.teams.map((team) => [team.name, team.teamId]),
  );
  const teamCandidateKind: WeeklyEditionEditorialCandidate["kind"] =
    input.issueType === "pre_draft"
      ? "draft"
      : input.issueType === "preseason"
        ? "team_performance"
        : "cap";
  for (const team of input.teamOutlooks) {
    const draftDetail = `${team.draftPickCount} draft pick${team.draftPickCount === 1 ? "" : "s"}, including ${team.firstRoundPickCount} in the first round`;
    const rosterDetail = `${team.rosterSize} players and a ${team.rosterTalent.toFixed(1)} roster-talent rating`;
    const capDetail = `${weeklyEditionMoney(team.capSpace)} in cap space with ${team.expiringCount} expiring contract${team.expiringCount === 1 ? "" : "s"}`;
    const summary =
      input.issueType === "pre_draft"
        ? `${team.teamName} enters the draft with ${rosterDetail} plus ${draftDetail}.`
        : input.issueType === "preseason"
          ? `${team.teamName} enters the season with ${rosterDetail}; its draft consumed ${team.draftSelectionsConsumed ?? 0} selections.`
          : `${team.teamName} has ${capDetail}, ${rosterDetail}, and ${draftDetail}.`;
    candidates.push({
      id: `outlook:${input.issueType}:${team.teamId}`,
      kind: teamCandidateKind,
      scope: "season",
      importance: candidateImportance(
        58 +
          Math.min(team.expiringCount * 3, 18) +
          Math.min(team.firstRoundPickCount * 5, 15) +
          Math.min(Math.abs(team.rosterTalent - 75) / 2, 12),
      ),
      headlineHint: `${team.teamName}'s ${input.issueLabel.toLowerCase()} outlook`,
      summary,
      teamId: team.teamId,
      teamName: team.teamName,
      metrics: [
        { key: "capSpace", label: "Cap space", value: team.capSpace },
        {
          key: "rosterTalent",
          label: "Roster talent",
          value: team.rosterTalent,
        },
        { key: "rosterSize", label: "Roster size", value: team.rosterSize },
        {
          key: "expiringCount",
          label: "Expiring contracts",
          value: team.expiringCount,
        },
        {
          key: "firstRoundPickCount",
          label: "First-round picks",
          value: team.firstRoundPickCount,
        },
      ],
      links: [],
    });
  }

  if (input.issueType === "resigning_outlook") {
    for (const contract of input.expiringContracts.slice(0, 24)) {
      candidates.push({
        id: `contract:expiry:${contract.contractId}`,
        kind: "contract",
        scope: "season",
        importance: candidateImportance(
          64 +
            Math.min(contract.salary / 500_000, 18) +
            (contract.returnsToDraft ? 10 : 0),
        ),
        occurredAt: contract.expiryDate,
        headlineHint: `${contract.teamName} faces a decision on ${contract.playerName}`,
        summary: `${contract.playerName}'s ${weeklyEditionMoney(contract.salary)} contract with ${contract.teamName} expires ${contract.expiryDate}. Expiry status is ${contract.expiryStatus}; ${contract.returnsToDraft ? "the player returns to the draft" : contract.canBeReSigned ? (contract.requiredReSigningSalary === undefined ? "the player may be re-signed, but the packet does not supply the required salary" : `the player may be re-signed at ${weeklyEditionMoney(contract.requiredReSigningSalary)}`) : "the packet does not mark the player as eligible to re-sign"}.`,
        playerName: contract.playerName,
        teamId: teamIdByName.get(contract.teamName),
        teamName: contract.teamName,
        metrics: [
          { key: "salary", label: "Current salary", value: contract.salary },
          ...(contract.requiredReSigningSalary === undefined
            ? []
            : [
                {
                  key: "requiredReSigningSalary",
                  label: "Required re-signing salary",
                  value: contract.requiredReSigningSalary,
                },
              ]),
        ],
        links: [],
      });
    }
  }

  if (input.issueType === "offseason_market") {
    for (const contract of input.recentSignings.slice(0, 20)) {
      candidates.push({
        id: `contract:signing:${contract.contractId}`,
        kind: "transaction",
        scope: "season",
        importance: candidateImportance(
          68 + Math.min(contract.salary / 500_000, 22),
        ),
        occurredAt: contract.signedAt,
        headlineHint: `${contract.teamName} signs ${contract.playerName}`,
        summary: `${contract.teamName} signed ${contract.playerName} for ${weeklyEditionMoney(contract.salary)}${contract.signedAt ? ` on ${contract.signedAt}` : ""}.`,
        playerName: contract.playerName,
        teamId: teamIdByName.get(contract.teamName),
        teamName: contract.teamName,
        metrics: [
          { key: "salary", label: "Salary", value: contract.salary },
          ...(contract.playerRating === undefined
            ? []
            : [
                {
                  key: "playerRating",
                  label: "Player rating",
                  value: contract.playerRating,
                },
              ]),
        ],
        links: [],
      });
    }
    for (const ufa of (input.summerUfas ?? []).slice(0, 20)) {
      candidates.push({
        id: `ufa:${ufa.playerId}`,
        kind: "ufa",
        scope: "season",
        importance: candidateImportance(
          70 + Math.min((ufa.rosterTalent ?? 0) / 10, 12),
        ),
        headlineHint: `${ufa.playerName} reaches the summer market`,
        summary: `${ufa.playerName} is a summer UFA at an updated salary of ${weeklyEditionMoney(ufa.updatedSalary)} and a required UFA salary of ${weeklyEditionMoney(ufa.requiredUfaSalary)}${ufa.previousTeamName ? ` after playing for ${ufa.previousTeamName}` : ""}.`,
        playerId: ufa.playerId,
        playerName: ufa.playerName,
        teamId: ufa.previousTeamName
          ? teamIdByName.get(ufa.previousTeamName)
          : undefined,
        teamName: ufa.previousTeamName,
        metrics: [
          {
            key: "updatedSalary",
            label: "Updated salary",
            value: ufa.updatedSalary,
          },
          {
            key: "requiredUfaSalary",
            label: "Required UFA salary",
            value: ufa.requiredUfaSalary,
          },
        ],
        links: [],
      });
    }
  }

  if (
    input.issueType === "resigning_outlook" ||
    input.issueType === "offseason_market"
  ) {
    for (const buyout of (input.buyoutCharges ?? []).slice(0, 12)) {
      candidates.push({
        id: `cap:buyout:${buyout.contractId}`,
        kind: "cap",
        scope: "season",
        importance: candidateImportance(
          58 + Math.min(buyout.capHit / 250_000, 20),
        ),
        headlineHint: `${buyout.teamName} carries a buyout charge for ${buyout.playerName}`,
        summary: `${buyout.teamName} carries a ${weeklyEditionMoney(buyout.capHit)} buyout charge for ${buyout.playerName} through ${buyout.capHitEndDate}.`,
        playerName: buyout.playerName,
        teamId: teamIdByName.get(buyout.teamName),
        teamName: buyout.teamName,
        metrics: [
          { key: "capHit", label: "Buyout cap hit", value: buyout.capHit },
        ],
        links: [],
      });
    }
  }

  if (input.issueType === "pre_draft" || input.issueType === "preseason") {
    for (const pick of input.draftPicks.slice(0, 24)) {
      const teamId = teamIdByName.get(pick.teamName);
      candidates.push({
        id: `draft:${pick.pickId}`,
        kind: "draft",
        scope: "season",
        importance: candidateImportance(
          88 -
            Math.min((pick.round - 1) * 6, 30) +
            (pick.selectedPlayerRating === undefined
              ? 0
              : Math.min(pick.selectedPlayerRating / 10, 10)),
        ),
        headlineHint: pick.selectedPlayerName
          ? `${pick.teamName} selects ${pick.selectedPlayerName}`
          : `${pick.teamName} holds a Round ${pick.round} selection`,
        summary: pick.selectedPlayerName
          ? `${pick.teamName} used its Round ${pick.round}${pick.pick ? `, pick ${pick.pick}` : ""} selection on ${pick.selectedPlayerName}${pick.selectedPlayerRating === undefined ? "" : `, rated ${pick.selectedPlayerRating}`}.`
          : `${pick.teamName} owns a Round ${pick.round}${pick.pick ? `, pick ${pick.pick}` : ""} selection.`,
        playerName: pick.selectedPlayerName,
        teamId,
        teamName: pick.teamName,
        metrics: [
          { key: "round", label: "Round", value: pick.round },
          ...(pick.pick === undefined
            ? []
            : [{ key: "pick", label: "Pick", value: pick.pick }]),
          ...(pick.selectedPlayerRating === undefined
            ? []
            : [
                {
                  key: "selectedPlayerRating",
                  label: "Selected player rating",
                  value: pick.selectedPlayerRating,
                },
              ]),
        ],
        links: [],
      });
    }
  }

  if (input.issueType === "preseason") {
    for (const ranking of (input.gmRankings ?? []).slice(0, 12)) {
      candidates.push({
        id: `gm-ranking:${ranking.rank}:${ranking.gmName}`,
        kind: "gm_ranking",
        scope: "career",
        importance: candidateImportance(
          90 -
            Math.min(ranking.rank * 2, 24) +
            Math.min(Math.abs(ranking.rankChange) * 2, 10),
        ),
        headlineHint: `${ranking.gmName} enters at No. ${ranking.rank} on the GM Ladder`,
        summary: `${ranking.gmName}${ranking.teamName ? ` of ${ranking.teamName}` : ""} ranks No. ${ranking.rank} with a ${ranking.rating.toFixed(1)} GM rating, ${ranking.overallWins} wins, ${ranking.playoffAppearances} playoff appearances, and ${ranking.cups} cups.`,
        teamId: ranking.teamName
          ? teamIdByName.get(ranking.teamName)
          : undefined,
        teamName: ranking.teamName,
        metrics: [
          { key: "gmRank", label: "GM rank", value: ranking.rank },
          { key: "gmRating", label: "GM rating", value: ranking.rating },
          {
            key: "rankChange",
            label: "Rank change",
            value: ranking.rankChange,
          },
        ],
        links: [],
      });
    }
  }

  return candidates
    .filter(
      (candidate, index) =>
        candidates.findIndex((row) => row.id === candidate.id) === index,
    )
    .sort(
      (left, right) =>
        right.importance - left.importance || left.id.localeCompare(right.id),
    )
    .slice(0, 80);
}

export function buildMilestoneEditionFactPacket(
  input: BuildMilestoneEditionFactPacketInput,
): WeeklyEditionFactPacket {
  const matchups = (input.matchups ?? []).map(winnerForMatchup);
  const hero = matchups.length > 0 ? selectHeroMatchup(matchups) : undefined;
  const stars = (input.stars ?? [])
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      teamId: player.teamId,
      teamName: player.teamName,
      rating: numberValue(player.rating),
      points: numberValue(player.points),
      wins: numberValue(player.wins),
    }))
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 3);
  const powerMovers = (input.power ?? [])
    .map((team) => {
      const currentRank = numberValue(team.currentRank);
      const previousRank = numberValue(team.previousRank);
      const currentElo = optionalNumber(team.currentElo);
      const previousElo = optionalNumber(team.previousElo);
      const talentRating = optionalNumber(team.talentRating);
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
        talentRating,
        eloChange:
          currentElo !== undefined && previousElo !== undefined
            ? currentElo - previousElo
            : undefined,
      };
    })
    .sort((left, right) => left.currentRank - right.currentRank);
  const editorialCandidates = [
    ...(input.editorialCandidates ?? []),
    ...buildMilestoneEditorialCandidates(input),
  ].filter(
    (candidate, index, rows) =>
      rows.findIndex((row) => row.id === candidate.id) === index,
  );
  return {
    version: 1 as const,
    season: input.season,
    week: input.week,
    teams: input.teams,
    matchups,
    heroMatchupId: hero?.matchupId,
    stars,
    powerMovers,
    activity: [],
    missedStarts: [],
    nextMatchups: [],
    editorialCandidates,
    issueType: input.issueType,
    issueLabel: input.issueLabel,
    milestone: {
      triggerDate: input.triggerDate,
      analysisSeasonId: input.analysisSeason.id,
      analysisSeasonName: input.analysisSeason.name,
      analysisSeasonSigningEndDate: input.analysisSeason.signingEndDate,
      analysisSeasonDraftStartAt: input.analysisSeason.draftStartAt,
      salaryCap: 25_000_000,
      teamOutlooks: [...input.teamOutlooks].sort(
        (left, right) =>
          right.rosterTalent - left.rosterTalent ||
          left.teamName.localeCompare(right.teamName),
      ),
      expiringContracts: [...input.expiringContracts].sort(
        (left, right) =>
          right.salary - left.salary ||
          left.playerName.localeCompare(right.playerName),
      ),
      recentSignings: [...input.recentSignings].sort(
        (left, right) =>
          right.salary - left.salary ||
          left.playerName.localeCompare(right.playerName),
      ),
      signedPlayers: [...(input.signedPlayers ?? [])].sort(
        (left, right) =>
          left.teamName.localeCompare(right.teamName) ||
          right.salary - left.salary ||
          left.playerName.localeCompare(right.playerName),
      ),
      summerUfas: [...(input.summerUfas ?? [])].sort(
        (left, right) =>
          (right.rosterTalent ?? 0) - (left.rosterTalent ?? 0) ||
          right.requiredUfaSalary - left.requiredUfaSalary ||
          left.playerName.localeCompare(right.playerName),
      ),
      buyoutCharges: [...(input.buyoutCharges ?? [])].sort(
        (left, right) =>
          right.capHit - left.capHit ||
          left.playerName.localeCompare(right.playerName),
      ),
      gmRankings: [...(input.gmRankings ?? [])].sort(
        (left, right) => left.rank - right.rank,
      ),
      draftPicks: [...input.draftPicks].sort(
        (left, right) =>
          left.round - right.round || (left.pick ?? 999) - (right.pick ?? 999),
      ),
    },
  };
}

function choose<T>(
  packet: WeeklyEditionFactPacket,
  values: readonly T[],
  salt: string,
) {
  const hash = Number.parseInt(
    hashWeeklyEditionSource(`${packet.season.id}:${packet.week.id}:${salt}`),
    16,
  );
  return values[hash % values.length]!;
}

function scoreline(matchup: WeeklyEditionMatchupFact) {
  return `${matchup.awayTeamName} ${matchup.awayScore}–${matchup.homeScore} ${matchup.homeTeamName}`;
}

function matchupStageLabel(matchup: WeeklyEditionMatchupFact) {
  return matchupStageLabelForGameType(matchup.gameType);
}

function matchupStageLabelForGameType(gameType?: string) {
  if (gameType === "F") return "Final";
  if (gameType === "SF") return "Semifinal";
  if (gameType === "QF") return "Quarterfinal";
  return undefined;
}

function matchupSummary(matchup: WeeklyEditionMatchupFact) {
  const stage = matchupStageLabel(matchup);
  const stagePrefix = stage ? `${stage}: ` : "";
  const categoryNote = matchup.categoryMargins.find(
    (category) => category.winnerTeamName === matchup.winnerTeamName,
  );
  const categorySentence = categoryNote
    ? ` ${categoryNote.winnerTeamName} created its widest category edge in ${categoryNote.category}, ${categoryNote.homeValue}–${categoryNote.awayValue}.`
    : "";
  if (!matchup.winnerTeamName) {
    return `${stagePrefix}${matchup.homeTeamName} and ${matchup.awayTeamName} finished level at ${matchup.homeScore}–${matchup.awayScore}.`;
  }
  return `${stagePrefix}${matchup.winnerTeamName} beat ${matchup.loserTeamName} ${Math.max(matchup.homeScore, matchup.awayScore)}–${Math.min(matchup.homeScore, matchup.awayScore)}.${categorySentence}`;
}

export const WEEKLY_EDITION_STAFF = {
  editorInChief: {
    name: "Graham MacIntyre",
    position: "Editor-in-Chief",
    scope: "league",
  },
  headOfAnalytics: {
    name: "Evan Soderberg",
    position: "Head of Analytics",
    scope: "league",
  },
  headInsider: {
    name: "Darren Leclair",
    position: "GSHL Head Insider",
    scope: "league",
  },
  insider: {
    name: "Mike Halvorsen",
    position: "GSHL Insider",
    scope: "league",
  },
  nationalReporter: {
    name: "Scott Bannerman",
    position: "National Reporter",
    scope: "league",
  },
  analyticsReporter: {
    name: "Nate Carlson",
    position: "Analytics Reporter",
    scope: "league",
  },
} as const satisfies Record<string, WeeklyEditionAuthor>;

const ANALYTICS_SECTION_KINDS = new Set<WeeklyEditionSectionKind>([
  "three_stars",
  "power_movers",
  "season_predictions",
]);
const INSIDER_SECTION_KINDS = new Set<WeeklyEditionSectionKind>([
  "transaction_wire",
  "expiring_contracts",
  "ufa_market",
]);

export function getWeeklyEditionFallbackAuthor(
  kind: WeeklyEditionSectionKind,
): WeeklyEditionAuthor {
  if (ANALYTICS_SECTION_KINDS.has(kind)) {
    return { ...WEEKLY_EDITION_STAFF.analyticsReporter };
  }
  if (INSIDER_SECTION_KINDS.has(kind)) {
    return { ...WEEKLY_EDITION_STAFF.insider };
  }
  return { ...WEEKLY_EDITION_STAFF.nationalReporter };
}

function referencedTeams(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const headline = item.headline.toLowerCase();
  const body = item.body.toLowerCase();
  return packet.teams
    .map((team) => {
      const name = team.name.toLowerCase();
      const headlineIndex = headline.indexOf(name);
      const bodyIndex = body.indexOf(name);
      return {
        team,
        index:
          headlineIndex >= 0
            ? headlineIndex
            : bodyIndex >= 0
              ? headline.length + bodyIndex
              : Number.POSITIVE_INFINITY,
      };
    })
    .filter((match) => Number.isFinite(match.index))
    .sort((left, right) => left.index - right.index);
}

function teamAuthor(
  team: WeeklyEditionFactPacket["teams"][number],
): WeeklyEditionAuthor | undefined {
  if (!team.beatWriter) return undefined;
  return {
    name: team.beatWriter,
    position: `${team.name} Beat Writer`,
    scope: "team",
    teamId: team.teamId,
    teamName: team.name,
  };
}

function conferenceAuthor(
  team: WeeklyEditionFactPacket["teams"][number],
): WeeklyEditionAuthor | undefined {
  if (!team.leadReporter || !team.conferenceId || !team.conferenceName) {
    return undefined;
  }
  return {
    name: team.leadReporter,
    position: `${team.conferenceName} Lead Reporter`,
    scope: "conference",
    conferenceId: team.conferenceId,
    conferenceName: team.conferenceName,
  };
}

function weeklyEditionAuthorProfile(author: WeeklyEditionAuthor) {
  if (author.name === WEEKLY_EDITION_STAFF.editorInChief.name) {
    return {
      scoutsFor:
        "Rare league-process, governance, rule-change, championship, or major institutional stories with consequences beyond one club.",
      passesOn:
        "Routine results, ordinary roster churn, and specialist stories that belong to a beat reporter.",
      voice:
        "Decisive and economical. Establish the league-wide consequence early, explain the governing detail precisely, and avoid grandstanding.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.headOfAnalytics.name) {
    return {
      scoutsFor:
        "The edition's most consequential performance, record, milestone, ranking shift, or data-led investigation.",
      passesOn:
        "Small samples without a baseline, leaderboards with no change, and number dumps that do not alter the league picture.",
      voice:
        "Analytical but readable. State the finding, compare it with the right baseline, then explain the hockey consequence without pretending correlation proves motive.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.analyticsReporter.name) {
    return {
      scoutsFor:
        "Standout player and team performances, category results, records, milestones, power movement, and statistical trends.",
      passesOn:
        "Isolated numbers with no comparison, material roster news, and broad claims the sample cannot support.",
      voice:
        "Concrete and curious. Lead with the number that changed, supply one useful comparison, and translate the result into league terms.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.headInsider.name) {
    return {
      scoutsFor:
        "The edition's biggest signing, trade, contract, cap, or roster-management decision and its league-wide chain reaction.",
      passesOn:
        "Routine adds and drops, speculative motives, and any supposed negotiation detail absent from the source packet.",
      voice:
        "Direct and sourced to the ledger. Separate what happened from what it changes, and never imitate anonymous-sourcing language or invent a motive.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.insider.name) {
    return {
      scoutsFor:
        "Signings, trades, adds, drops, expiring contracts, cap developments, and the next roster decision created by them.",
      passesOn:
        "Transaction lists with no consequence, unsupported market rumours, and performance stories with no roster angle.",
      voice:
        "Fast and specific. Put the move, amount, status, or deadline first, then follow the roster and cap consequences one step at a time.",
    };
  }
  if (author.name === WEEKLY_EDITION_STAFF.nationalReporter.name) {
    return {
      scoutsFor:
        "League-wide results, championship and season narratives, power structure, cross-conference comparisons, draft outlooks, and preseason forecasts.",
      passesOn:
        "A local development with no wider stakes and specialist cap or analytics stories better handled by those desks.",
      voice:
        "Broad without becoming vague. Connect two or more grounded developments, keep the hierarchy clear, and finish on the next pressure point rather than a moral.",
    };
  }
  if (author.scope === "team") {
    return {
      scoutsFor: `Results, roster moves, contracts, player performances, matchup trends, and decisions specifically centered on ${author.teamName ?? "the assigned team"}.`,
      passesOn:
        "League-wide stories where the assigned team is incidental, plus claims that require another club's private perspective.",
      voice:
        "Close to the beat, not promotional. Use the team-specific detail another desk might miss, acknowledge the opposing evidence, and explain the next local consequence.",
    };
  }
  return {
    scoutsFor: `Standings pressure, matchups, trends, and roster decisions centered on ${author.conferenceName ?? "the assigned conference"}, especially stories that connect more than one team.`,
    passesOn:
      "Single-team housekeeping with no conference consequence and developments centered outside the assigned conference.",
    voice:
      "Comparative and fair. Locate the story inside the conference race, contrast the relevant teams with specific evidence, and resist homer language.",
  };
}

export function buildWeeklyEditionAuthorRoster(
  packet: WeeklyEditionFactPacket,
) {
  return uniqueAuthors([
    ...Object.values(WEEKLY_EDITION_STAFF).map((author) => ({ ...author })),
    ...packet.teams.map(conferenceAuthor),
    ...packet.teams.map(teamAuthor),
  ]).map((author) => ({ author, ...weeklyEditionAuthorProfile(author) }));
}

function weeklyEditionAuthorKey(author: WeeklyEditionAuthor) {
  return author.name.trim().toLowerCase();
}

function sameWeeklyEditionAuthor(
  left: WeeklyEditionAuthor,
  right: WeeklyEditionAuthor,
) {
  return (
    left.name === right.name &&
    left.position === right.position &&
    left.scope === right.scope &&
    left.teamId === right.teamId &&
    left.teamName === right.teamName &&
    left.conferenceId === right.conferenceId &&
    left.conferenceName === right.conferenceName
  );
}

const ANALYTICS_CANDIDATE_KINDS = new Set<
  WeeklyEditionEditorialCandidate["kind"]
>([
  "player_performance",
  "team_performance",
  "record",
  "milestone",
  "award_race",
  "award",
  "gm_ranking",
  "performance",
  "matchup",
]);

const INSIDER_CANDIDATE_KINDS = new Set<
  WeeklyEditionEditorialCandidate["kind"]
>(["transaction", "contract", "cap", "ufa", "activity"]);

function weeklyEditionCandidateTeamIds(
  candidate: WeeklyEditionEditorialCandidate,
  packet: WeeklyEditionFactPacket,
) {
  const teamIds = new Set<string>();
  if (candidate.teamId) teamIds.add(candidate.teamId);
  if (candidate.kind === "matchup" && candidate.id.startsWith("matchup:")) {
    const matchup = packet.matchups.find(
      (row) => `matchup:${row.matchupId}` === candidate.id,
    );
    if (matchup) {
      teamIds.add(matchup.homeTeamId);
      teamIds.add(matchup.awayTeamId);
    }
  }
  return [...teamIds];
}

function writerCanLeadCandidate(
  author: WeeklyEditionAuthor,
  candidate: WeeklyEditionEditorialCandidate,
  packet: WeeklyEditionFactPacket,
) {
  const candidateTeamIds = weeklyEditionCandidateTeamIds(candidate, packet);
  if (author.scope === "team") {
    return Boolean(author.teamId && candidateTeamIds.includes(author.teamId));
  }
  if (author.scope === "conference") {
    return candidateTeamIds.some(
      (teamId) =>
        packet.teams.find((row) => row.teamId === teamId)?.conferenceId ===
        author.conferenceId,
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.editorInChief.name) {
    return candidate.importance >= 90;
  }
  if (author.name === WEEKLY_EDITION_STAFF.headOfAnalytics.name) {
    return (
      candidate.importance >= 90 &&
      ANALYTICS_CANDIDATE_KINDS.has(candidate.kind)
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.analyticsReporter.name) {
    return ANALYTICS_CANDIDATE_KINDS.has(candidate.kind);
  }
  if (author.name === WEEKLY_EDITION_STAFF.headInsider.name) {
    return (
      candidate.importance >= 80 && INSIDER_CANDIDATE_KINDS.has(candidate.kind)
    );
  }
  if (author.name === WEEKLY_EDITION_STAFF.insider.name) {
    return INSIDER_CANDIDATE_KINDS.has(candidate.kind);
  }
  return true;
}

export function buildWeeklyEditionStoryLedger(packet: WeeklyEditionFactPacket) {
  return pressBoxEditorialCandidates(packet).map((candidate) => {
    const team = packet.teams.find((row) => row.teamId === candidate.teamId);
    const relatedTeams = weeklyEditionCandidateTeamIds(candidate, packet).map(
      (teamId) => {
        const relatedTeam = packet.teams.find((row) => row.teamId === teamId);
        return {
          teamId,
          teamName: relatedTeam?.name,
          conferenceId: relatedTeam?.conferenceId,
          conferenceName: relatedTeam?.conferenceName,
        };
      },
    );
    return {
      ...candidate,
      conferenceId: team?.conferenceId,
      conferenceName: team?.conferenceName,
      relatedTeams,
    };
  });
}

function weeklyEditionPitchScore(
  candidate: WeeklyEditionEditorialCandidate,
  submission: WeeklyEditionStorySubmission["pitches"][number],
) {
  const { scores } = submission;
  return (
    candidate.importance +
    scores.consequence * 4 +
    scores.readerInterest * 3 +
    scores.evidenceStrength * 2 +
    scores.freshness
  );
}

export function selectWeeklyEditionStoryAssignments(
  packet: WeeklyEditionFactPacket,
  submissions: WeeklyEditionStorySubmission[],
  articleCount: WeeklyEditionArticleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
): WeeklyEditionStoryAssignment[] {
  const articleSlots = buildWeeklyEditionArticleSlots(articleCount);
  const roster = buildWeeklyEditionAuthorRoster(packet).map(
    ({ author }) => author,
  );
  const rosterByKey = new Map(
    roster.map((author) => [weeklyEditionAuthorKey(author), author]),
  );
  const submittedAuthors = new Set<string>();
  for (const submission of submissions) {
    const key = weeklyEditionAuthorKey(submission.author);
    const expected = rosterByKey.get(key);
    if (!expected || !sameWeeklyEditionAuthor(expected, submission.author)) {
      throw new Error(
        `The pitch desk used an unknown author: ${submission.author.name}`,
      );
    }
    if (submittedAuthors.has(key)) {
      throw new Error(
        `The pitch desk submitted ${submission.author.name} more than once`,
      );
    }
    submittedAuthors.add(key);
  }
  const missingAuthors = roster.filter(
    (author) => !submittedAuthors.has(weeklyEditionAuthorKey(author)),
  );
  if (missingAuthors.length > 0) {
    throw new Error(
      `The pitch desk skipped: ${missingAuthors.map((author) => author.name).join(", ")}`,
    );
  }

  const candidates = pressBoxEditorialCandidates(packet);
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const seenPitchIds = new Set<string>();
  const eligible = submissions.flatMap((submission) => {
    const author = rosterByKey.get(weeklyEditionAuthorKey(submission.author))!;
    return submission.pitches.flatMap((pitch) => {
      const pitchKey = `${weeklyEditionAuthorKey(author)}:${pitch.pitchId}`;
      const lead = candidatesById.get(pitch.leadCandidateId);
      const supportIds = [...new Set(pitch.supportingCandidateIds)].filter(
        (candidateId) => candidateId !== pitch.leadCandidateId,
      );
      const support = supportIds.map((candidateId) =>
        candidatesById.get(candidateId),
      );
      if (
        seenPitchIds.has(pitchKey) ||
        !lead ||
        support.some((candidate) => !candidate) ||
        !writerCanLeadCandidate(author, lead, packet) ||
        pitch.proposedHeadline.length > 120 ||
        pitch.angle.length > 600
      ) {
        return [];
      }
      seenPitchIds.add(pitchKey);
      return [
        {
          ...pitch,
          supportingCandidateIds: supportIds,
          author,
          lead,
          editorialScore: weeklyEditionPitchScore(lead, pitch),
        },
      ];
    });
  });
  eligible.sort(
    (left, right) =>
      right.editorialScore - left.editorialScore ||
      right.lead.importance - left.lead.importance ||
      left.pitchId.localeCompare(right.pitchId),
  );

  const selected: typeof eligible = [];
  const usedAuthors = new Set<string>();
  const usedLeadCandidates = new Set<string>();
  const teamCounts = new Map<string, number>();
  const kindCounts = new Map<WeeklyEditionEditorialCandidate["kind"], number>();
  const takePitches = (enforceMix: boolean) => {
    for (const pitch of eligible) {
      if (selected.length === articleSlots.length) break;
      const authorKey = weeklyEditionAuthorKey(pitch.author);
      const teamId = pitch.lead.teamId;
      const kind = pitch.lead.kind;
      if (
        usedAuthors.has(authorKey) ||
        usedLeadCandidates.has(pitch.leadCandidateId) ||
        (enforceMix && teamId && (teamCounts.get(teamId) ?? 0) >= 2) ||
        (enforceMix && (kindCounts.get(kind) ?? 0) >= 2)
      ) {
        continue;
      }
      selected.push(pitch);
      usedAuthors.add(authorKey);
      usedLeadCandidates.add(pitch.leadCandidateId);
      if (teamId) teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
  };
  takePitches(true);
  takePitches(false);
  if (selected.length < articleSlots.length) {
    throw new Error(
      `The pitch desk found only ${selected.length} distinct, eligible stories; ${articleCount} are required`,
    );
  }

  return articleSlots.map((slot, index) => {
    const pitch = selected[index]!;
    return {
      ...slot,
      author: pitch.author,
      pitchId: pitch.pitchId,
      leadCandidateId: pitch.leadCandidateId,
      supportingCandidateIds: pitch.supportingCandidateIds,
      proposedHeadline: pitch.proposedHeadline,
      angle: pitch.angle,
      scores: pitch.scores,
      editorialScore: Math.round(pitch.editorialScore * 10) / 10,
    };
  });
}

function teamFocusForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  if (item.kind === "biggest_story") {
    const leadCandidate = pressBoxEditorialCandidates(packet)[0];
    if (leadCandidate?.teamId) {
      return packet.teams.find((team) => team.teamId === leadCandidate.teamId);
    }
  }
  if (item.kind === "season_recap") {
    const leadCandidate = pressBoxEditorialCandidates(packet)[0];
    const hero = packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    );
    const teamId = leadCandidate?.teamId ?? hero?.winnerTeamId;
    if (teamId) {
      return packet.teams.find((team) => team.teamId === teamId);
    }
  }
  if (item.kind === "missed_start") {
    return referencedTeams(item, packet).find((match) =>
      item.headline.toLowerCase().includes(match.team.name.toLowerCase()),
    )?.team;
  }
  return undefined;
}

function uniqueAuthors(authors: Array<WeeklyEditionAuthor | undefined>) {
  const seen = new Set<string>();
  return authors.filter((author): author is WeeklyEditionAuthor => {
    if (!author) return false;
    const key = author.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rotateAuthors(
  authors: WeeklyEditionAuthor[],
  packet: WeeklyEditionFactPacket,
  item: WeeklyEditionSection,
  salt: string,
) {
  return [...authors].sort((left, right) => {
    const leftHash = hashWeeklyEditionSource(
      `${packet.season.id}:${packet.week.id}:${packet.issueType}:${item.id}:${salt}:${left.name}`,
    );
    const rightHash = hashWeeklyEditionSource(
      `${packet.season.id}:${packet.week.id}:${packet.issueType}:${item.id}:${salt}:${right.name}`,
    );
    return (
      leftHash.localeCompare(rightHash) || left.name.localeCompare(right.name)
    );
  });
}

function contextualAuthors(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const matches = referencedTeams(item, packet);
  if (matches.length === 0) return [];
  const primary = matches[0]!.team;
  const focusedTeam = teamFocusForSection(item, packet);
  const teamAuthors = focusedTeam ? [teamAuthor(focusedTeam)] : [];
  const conferenceAuthors = matches.map((match) =>
    conferenceAuthor(match.team),
  );
  const authors =
    item.kind === "matchup_roundup" &&
    matches.length > 1 &&
    matches.every((match) => match.team.conferenceId === primary.conferenceId)
      ? [...conferenceAuthors, ...teamAuthors]
      : [...teamAuthors, ...conferenceAuthors];
  return rotateAuthors(
    uniqueAuthors(authors),
    packet,
    item,
    "contextual-reporters",
  );
}

function isMajorAnalyticsAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    (isPrimary &&
      (item.kind === "three_stars" ||
        item.kind === "power_movers" ||
        item.kind === "season_predictions")) ||
    (item.kind === "biggest_story" &&
      (leadCandidate?.kind === "player_performance" ||
        leadCandidate?.kind === "team_performance" ||
        leadCandidate?.kind === "record" ||
        leadCandidate?.kind === "milestone") &&
      (leadCandidate.importance ?? 0) >= 90)
  );
}

function isAnalyticsAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    ANALYTICS_SECTION_KINDS.has(item.kind) ||
    (item.kind === "biggest_story" &&
      (leadCandidate?.kind === "player_performance" ||
        leadCandidate?.kind === "team_performance" ||
        leadCandidate?.kind === "record" ||
        leadCandidate?.kind === "milestone"))
  );
}

function isMajorInsiderAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    (isPrimary && INSIDER_SECTION_KINDS.has(item.kind)) ||
    (item.kind === "biggest_story" &&
      leadCandidate?.kind === "transaction" &&
      (leadCandidate.importance ?? 0) >= 80)
  );
}

function isInsiderAssignment(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
) {
  const leadCandidate = pressBoxEditorialCandidates(packet)[0];
  return (
    INSIDER_SECTION_KINDS.has(item.kind) ||
    (item.kind === "biggest_story" && leadCandidate?.kind === "transaction")
  );
}

function specialistAuthors(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  if (packet.issueType === "resigning_outlook" && item.kind === "next_week") {
    return [{ ...WEEKLY_EDITION_STAFF.editorInChief }];
  }
  if (isMajorAnalyticsAssignment(item, packet, isPrimary)) {
    return [
      { ...WEEKLY_EDITION_STAFF.headOfAnalytics },
      { ...WEEKLY_EDITION_STAFF.analyticsReporter },
    ];
  }
  if (isAnalyticsAssignment(item, packet)) {
    return [{ ...WEEKLY_EDITION_STAFF.analyticsReporter }];
  }
  if (isMajorInsiderAssignment(item, packet, isPrimary)) {
    return [
      { ...WEEKLY_EDITION_STAFF.headInsider },
      { ...WEEKLY_EDITION_STAFF.insider },
    ];
  }
  if (isInsiderAssignment(item, packet)) {
    return [{ ...WEEKLY_EDITION_STAFF.insider }];
  }
  return [];
}

function allAvailableAuthors(
  packet: WeeklyEditionFactPacket,
  item: WeeklyEditionSection,
) {
  const conferenceAuthors = packet.teams.map(conferenceAuthor);
  const standardStaff = Object.values(WEEKLY_EDITION_STAFF).filter(
    (author) => author.position !== "Editor-in-Chief",
  );
  return [
    ...rotateAuthors(
      uniqueAuthors([...conferenceAuthors, ...standardStaff]),
      packet,
      item,
      "full-newsroom",
    ),
    { ...WEEKLY_EDITION_STAFF.editorInChief },
  ];
}

function authorCandidatesForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
) {
  const specialists = specialistAuthors(item, packet, isPrimary);
  const contextual = contextualAuthors(item, packet);
  const general = rotateAuthors(
    uniqueAuthors([
      ...contextual,
      { ...WEEKLY_EDITION_STAFF.nationalReporter },
    ]),
    packet,
    item,
    "general-reporters",
  );
  return uniqueAuthors([
    ...specialists,
    ...general,
    ...allAvailableAuthors(packet, item),
  ]);
}

function authorForSection(
  item: WeeklyEditionSection,
  packet: WeeklyEditionFactPacket,
  isPrimary: boolean,
  usedAuthorNames: Set<string>,
): WeeklyEditionAuthor {
  const author = authorCandidatesForSection(item, packet, isPrimary).find(
    (candidate) => !usedAuthorNames.has(candidate.name.trim().toLowerCase()),
  );
  if (!author) {
    throw new Error("A unique reporter could not be assigned to every article");
  }
  return author;
}

function addTeamReporterPerspective(
  item: WeeklyEditionSection,
  author: WeeklyEditionAuthor,
) {
  if (author.scope !== "team" || !author.teamName) return item.body;
  const note = ` From the ${author.teamName} side of the story, that is the detail worth circling.`;
  return item.body.length + note.length <= 1000
    ? `${item.body}${note}`
    : item.body;
}

export function normalizeWeeklyEditionArticleGrid(
  content: WeeklyEditionContent,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const sections = content.sections.slice(0, 6);
  if (sections.length < 6) {
    const editorialCandidates = pressBoxEditorialCandidates(packet);
    const supporting = editorialCandidates
      .slice(1, 3)
      .map((candidate) => candidate.summary)
      .join(" ");
    const notebookId = sections.some((item) => item.id === "league_notebook")
      ? "league_notebook_extra"
      : "league_notebook";
    sections.push(
      section(
        "league_notebook",
        "Press Box Notebook",
        editorialCandidates[1]?.headlineHint ??
          "What else caught the Press Box eye",
        supporting ||
          "The next GSHL story is already taking shape across the standings, transaction wire and weekly performance board.",
        editorialCandidates[1]?.links ?? [],
        notebookId,
      ),
    );
  }
  return { ...content, sections };
}

function assignWeeklyEditionAuthors(
  content: WeeklyEditionContent,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const normalized = normalizeWeeklyEditionArticleGrid(content, packet);
  const usedAuthorNames = new Set<string>();
  return {
    ...normalized,
    sections: normalized.sections.map((item, index) => {
      const author = authorForSection(item, packet, index < 2, usedAuthorNames);
      usedAuthorNames.add(author.name.trim().toLowerCase());
      return {
        ...item,
        body: addTeamReporterPerspective(item, author),
        author,
      };
    }),
  };
}

function section(
  kind: WeeklyEditionSectionKind,
  eyebrow: string,
  headline: string,
  body: string,
  links: WeeklyEditionSection["links"],
  id: string = kind,
): WeeklyEditionSection {
  return { id, kind, eyebrow, headline, body, links };
}

export function buildTemplateWeeklyEdition(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  if (packet.issueType !== "weekly") {
    return buildMilestoneTemplateEdition(packet);
  }
  const roundupMatchups = pressBoxMatchups(packet.matchups);
  const previewMatchups = pressBoxNextMatchups(packet.nextMatchups);
  const hero =
    roundupMatchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    ) ?? roundupMatchups[0];
  const upsetHeadline =
    hero && hero.rankUpset > 0 && hero.winnerTeamName
      ? choose(
          packet,
          [
            `${hero.winnerTeamName} flips the script`,
            `${hero.winnerTeamName} delivers the week’s shock`,
            `Rankings meet reality: ${hero.winnerTeamName} wins`,
          ],
          "lead",
        )
      : hero
        ? choose(
            packet,
            [
              `${hero.homeTeamName} and ${hero.awayTeamName} own the spotlight`,
              `A week decided at the margins`,
              `${hero.winnerTeamName ?? hero.homeTeamName} headlines Week ${packet.week.number}`,
            ],
            "lead",
          )
        : `Week ${packet.week.number}: the main competition takes the week off`;
  const editorialCandidates = pressBoxEditorialCandidates(packet);
  const leadCandidate = editorialCandidates[0];
  const leadIsMatchup = leadCandidate?.kind === "matchup";
  const leadHeadline = leadCandidate?.headlineHint ?? upsetHeadline;
  const deckText =
    leadCandidate && !leadIsMatchup
      ? `${leadCandidate.summary} It leads a Week ${packet.week.number} edition built from ${editorialCandidates.length} verified story candidates.`
      : hero
        ? `${scoreline(hero)} led a Week ${packet.week.number} slate with ${roundupMatchups.length} completed main-competition matchup${roundupMatchups.length === 1 ? "" : "s"}.`
        : `Week ${packet.week.number} had no completed main-competition matchups, so the Press Box is looking elsewhere for the stories that matter.`;
  const deck =
    deckText.length <= 220 ? deckText : `${deckText.slice(0, 217).trim()}…`;
  const sections: WeeklyEditionSection[] = [
    section(
      "biggest_story",
      "Biggest Story",
      leadHeadline,
      leadCandidate && !leadIsMatchup
        ? leadCandidate.summary
        : hero
          ? `${matchupSummary(hero)} ${
              hero.rankUpset > 0
                ? `The winner entered ${hero.rankUpset} ranking spot${hero.rankUpset === 1 ? "" : "s"} behind the opposition, which is exactly why the standings never get the final word.`
                : "It was the week’s most competitive result, and neither side left much room for a comfortable Sunday night."
            }`
          : "Loser Tournament results remain available on the schedule, while the Press Box keeps its editorial focus on the main competition and the week’s player, team and league-wide developments.",
      leadCandidate?.links ??
        (hero
          ? [{ label: "Open matchup", href: `/matchup/${hero.matchupId}` }]
          : [{ label: "View schedule", href: "/schedule" }]),
    ),
    section(
      "matchup_roundup",
      "Matchup Roundup",
      choose(
        packet,
        ["Around the league", "The rest of the scores", "How the week was won"],
        "roundup",
      ),
      roundupMatchups.map(matchupSummary).join(" ") ||
        "The Loser Tournament results are recorded in the schedule, but the Press Box is keeping its attention on the main competition.",
      [{ label: "View schedule", href: "/schedule" }],
    ),
    section(
      "three_stars",
      "Three Stars",
      packet.stars.length > 0
        ? `${packet.stars[0]!.playerName} leads the weekly podium`
        : "The weekly podium",
      packet.stars.length > 0
        ? packet.stars
            .map(
              (star, index) =>
                `${index + 1}. ${star.playerName} (${star.teamName}) — ${star.rating.toFixed(2)} rating, ${star.points} points and ${star.wins} wins.`,
            )
            .join(" ")
        : "No eligible weekly player ratings were available.",
      [],
    ),
    section(
      "power_movers",
      "Power Movers",
      packet.powerMovers.some((mover) => mover.rankChange !== 0)
        ? "The ladder did not sit still"
        : "The ladder holds its shape",
      packet.powerMovers.length > 0
        ? packet.powerMovers
            .map((mover) => {
              const direction =
                mover.rankChange > 0
                  ? `up ${mover.rankChange}`
                  : mover.rankChange < 0
                    ? `down ${Math.abs(mover.rankChange)}`
                    : "unchanged";
              return `${mover.teamName} is No. ${mover.currentRank} (${direction}).`;
            })
            .join(" ")
        : "No week-over-week power ranking comparison was available.",
      [{ label: "View standings", href: "/standings" }],
    ),
  ];

  if (packet.activity.length > 0) {
    sections.push(
      section(
        "transaction_wire",
        "Transaction Wire",
        "The roster carousel keeps turning",
        packet.activity
          .slice(0, 8)
          .map(
            (event) =>
              `${event.teamName}: ${event.kind} ${event.playerName}${event.detail ? ` (${event.detail})` : ""}.`,
          )
          .join(" "),
        [],
      ),
    );
  }
  if (packet.missedStarts.length > 0) {
    const missed = packet.missedStarts[0]!;
    sections.push(
      section(
        "missed_start",
        "Missed-Start Moment",
        `${missed.teamName} leaves one on the bench`,
        `${missed.playerName} recorded ${missed.count} missed start${missed.count === 1 ? "" : "s"} for ${missed.teamName}. A gentle reminder that the best lineup is usually the one that gets submitted.`,
        [],
      ),
    );
  }
  sections.push(
    section(
      "next_week",
      "Next Week Preview",
      previewMatchups.length > 0
        ? `${previewMatchups[0]!.awayTeamName} meets ${previewMatchups[0]!.homeTeamName}`
        : "The next puck drop awaits",
      previewMatchups.length > 0
        ? previewMatchups
            .map((matchup) => {
              const stage = matchupStageLabelForGameType(matchup.gameType);
              return `${stage ? `${stage}: ` : ""}${matchup.awayTeamName} at ${matchup.homeTeamName}${matchup.awayRank && matchup.homeRank ? ` pairs No. ${matchup.awayRank} with No. ${matchup.homeRank}` : ""}.`;
            })
            .join(" ")
        : "The next slate has not been posted yet. Check the schedule when the matchups lock in.",
      [{ label: "See next week", href: "/schedule" }],
    ),
  );

  return assignWeeklyEditionAuthors(
    { headline: leadHeadline, deck, sections },
    packet,
  );
}

function money(value: number) {
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function normalizedExpiryStatus(contract: {
  expiryStatus: string;
  canBeReSigned?: boolean;
  returnsToDraft?: boolean;
}) {
  return contract.expiryStatus.trim().toUpperCase();
}

function contractCanBeReSigned(contract: {
  expiryStatus: string;
  canBeReSigned?: boolean;
  returnsToDraft?: boolean;
}) {
  return (
    contract.canBeReSigned ??
    normalizedExpiryStatus(contract) === String(ContractStatus.RFA)
  );
}

function contractReturnsToDraft(contract: {
  expiryStatus: string;
  canBeReSigned?: boolean;
  returnsToDraft?: boolean;
}) {
  return (
    contract.returnsToDraft ??
    normalizedExpiryStatus(contract) === String(ContractStatus.UFA)
  );
}

function requiredReSigningSalary(contract: {
  salary: number;
  updatedSalary?: number;
  requiredReSigningSalary?: number;
}) {
  return (
    contract.requiredReSigningSalary ??
    Math.round((contract.updatedSalary ?? contract.salary) * 1.15)
  );
}

function contractOutcomeSummary(contract: WeeklyEditionContractFact) {
  if (contractReturnsToDraft(contract)) {
    return `${contract.playerName}'s expiry status is UFA, so this contract is not renewable and the player returns to the draft instead of entering Summer Free Agency from this expiry.`;
  }
  if (contractCanBeReSigned(contract)) {
    return `${contract.playerName}'s expiry status is RFA, so the eligible current team may re-sign the player at ${money(requiredReSigningSalary(contract))}, exactly 115% of the updated ${money(contract.updatedSalary ?? contract.salary)} salary.`;
  }
  return `${contract.playerName}'s ${contract.expiryStatus || "contract"} expiry requires no re-signing projection from the Press Box.`;
}

function teamOutlookSummary(packet: WeeklyEditionFactPacket) {
  return (
    packet.milestone?.teamOutlooks
      .slice(0, 6)
      .map(
        (team) =>
          `${team.teamName}: ${money(team.capSpace)} in cap space, ${team.rosterSize} rostered players and a ${team.rosterTalent.toFixed(1)} talent rating.`,
      )
      .join(" ") ?? "Team outlook data is still being assembled."
  );
}

function buildMilestoneTemplateEditionCopy(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const facts = packet.milestone;
  if (!facts) throw new Error("Milestone facts are required");
  const topTeam = facts.teamOutlooks[0];
  const capLeader = [...facts.teamOutlooks].sort(
    (left, right) => right.capSpace - left.capSpace,
  )[0];
  const firstRoundPickByTeam = new Map<string, number>();
  for (const pick of facts.draftPicks) {
    if (pick.round !== 1 || pick.pick === undefined) continue;
    const current = firstRoundPickByTeam.get(pick.teamName);
    if (current === undefined || pick.pick < current) {
      firstRoundPickByTeam.set(pick.teamName, pick.pick);
    }
  }
  const draftLeader = facts.teamOutlooks
    .filter((team) => firstRoundPickByTeam.has(team.teamName))
    .sort(
      (left, right) =>
        (firstRoundPickByTeam.get(left.teamName) ?? Number.MAX_SAFE_INTEGER) -
          (firstRoundPickByTeam.get(right.teamName) ??
            Number.MAX_SAFE_INTEGER) ||
        left.teamName.localeCompare(right.teamName),
    )[0];
  const expiring = facts.expiringContracts.slice(0, 8);
  const signings = facts.recentSignings.slice(0, 8);
  const summerUfas = facts.summerUfas ?? [];
  const ufaFitSummary = [...facts.teamOutlooks]
    .sort((left, right) => right.capSpace - left.capSpace)
    .slice(0, 6)
    .map((team) => {
      const target = summerUfas.find(
        (player) => player.requiredUfaSalary <= team.capSpace,
      );
      if (!target) {
        return `${team.teamName} has ${money(team.capSpace)} in cap space, but no confirmed Summer UFA in the supplied market fits beneath that amount at the required 125% salary.`;
      }
      return `${team.teamName} has ${money(team.capSpace)} in cap space, enough for a possible offer to confirmed Summer UFA ${target.playerName} at ${money(target.requiredUfaSalary)}; the seven-day matching process means the destination is not guaranteed.`;
    })
    .join(" ");
  const draftPositionSummary = facts.teamOutlooks
    .filter((team) => firstRoundPickByTeam.has(team.teamName))
    .sort(
      (left, right) =>
        (firstRoundPickByTeam.get(left.teamName) ?? Number.MAX_SAFE_INTEGER) -
        (firstRoundPickByTeam.get(right.teamName) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(
      (team) =>
        `${team.teamName} holds first-round pick No. ${firstRoundPickByTeam.get(team.teamName)}.`,
    )
    .join(" ");
  const standingsLink = [{ label: "View standings", href: "/standings" }];

  if (packet.issueType === "final_recap") {
    const hero = packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    );
    const leadCandidate = pressBoxEditorialCandidates(packet)[0];
    const headline =
      leadCandidate && leadCandidate.kind !== "matchup"
        ? leadCandidate.headlineHint
        : hero?.winnerTeamName
          ? `${hero.winnerTeamName} puts the final stamp on ${packet.season.name}`
          : `${packet.season.name}: the final word`;
    return {
      headline,
      deck: `The season is complete. The GSHL Press Box looks back at the final results, standout players and the pecking order the league carries into the offseason.`,
      sections: [
        section(
          "season_recap",
          "Final Recap",
          headline,
          leadCandidate && leadCandidate.kind !== "matchup"
            ? leadCandidate.summary
            : hero
              ? `${matchupSummary(hero)} It was the closing result in a season that rarely followed the tidy version of the script.`
              : "The final week is in the books and the season ledger is closed.",
          leadCandidate && leadCandidate.kind !== "matchup"
            ? leadCandidate.links
            : hero
              ? [
                  {
                    label: "Open final matchup",
                    href: `/matchup/${hero.matchupId}`,
                  },
                ]
              : standingsLink,
        ),
        section(
          "three_stars",
          "Season Finishers",
          packet.stars[0]
            ? `${packet.stars[0].playerName} finishes in style`
            : "The last stars of the season",
          packet.stars
            .map(
              (star, index) =>
                `${index + 1}. ${star.playerName} (${star.teamName}) — ${star.rating.toFixed(2)} rating.`,
            )
            .join(" ") || "Final player ratings were unavailable.",
          [],
        ),
        section(
          "roster_outlook",
          "Where They Stand",
          topTeam
            ? `${topTeam.teamName} carries the strongest talent mark`
            : "The offseason starting line",
          teamOutlookSummary(packet),
          standingsLink,
        ),
        section(
          "expiring_contracts",
          "What Comes Next",
          `${facts.expiringContracts.length} expiring contract${facts.expiringContracts.length === 1 ? "" : "s"} shape the next chapter`,
          expiring
            .map(
              (contract) =>
                `${contract.teamName}: ${contractOutcomeSummary(contract)}`,
            )
            .join(" ") || "No expiring contracts were found.",
          [],
        ),
        section(
          "next_week",
          "Next Edition",
          "The re-signing questions are coming",
          "The GSHL Press Box returns one week after the final with a team-by-team look at expiring contracts, cap room and the decisions that will define the summer.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "resigning_outlook") {
    const lead = expiring[0];
    return {
      headline: lead
        ? `${lead.teamName} faces the summer’s first big call`
        : "The re-signing board is open",
      deck: `${facts.expiringContracts.length} expiring contracts meet a $25.0M hard cap as teams build for ${facts.analysisSeasonName}. Here are the decisions, pressure points and roster holes facing every front office.`,
      sections: [
        section(
          "expiring_contracts",
          "Re-signing Spotlight",
          lead
            ? `${lead.playerName} leads the decision list`
            : "The decision list",
          expiring
            .map(
              (contract) =>
                `${contract.teamName}: ${contractOutcomeSummary(contract)}`,
            )
            .join(" ") || "No expiring contracts were found.",
          [],
        ),
        section(
          "cap_space",
          "Cap Space",
          capLeader
            ? `${capLeader.teamName} has the most room to work`
            : "Every dollar has a destination",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName} has ${money(team.capSpace)} available with ${team.expiringCount} expiring contract${team.expiringCount === 1 ? "" : "s"}.`,
            )
            .join(" "),
          [],
        ),
        section(
          "roster_outlook",
          "Roster Pressure",
          "Who can afford to stand pat?",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "ufa_market",
          "Potential Market",
          "Expiry status decides the re-signing board",
          "An RFA expiry may be renewed by the eligible current team at 115% of the player's updated salary. A UFA expiry is not renewable and returns to the draft. Summer Free Agency is a separate pool formed from eligible players who remain unsigned after the late deadline.",
          [],
        ),
        section(
          "next_week",
          "Dates to Know",
          `The signing window closes ${facts.analysisSeasonSigningEndDate ?? facts.triggerDate}`,
          "When the deadline arrives, the newspaper will reset the board: completed RFA re-signings on one side, draft-bound UFAs and the teams with the most buying power on the other.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "offseason_market") {
    return {
      headline: capLeader
        ? `${capLeader.teamName} brings the most buying power to the draft`
        : "The offseason board is taking shape",
      deck: `The re-signing deadline has passed. Expired UFAs are headed to the draft, and cap space, completed RFA deals and open roster spots show which teams can shape ${facts.analysisSeasonName}.`,
      sections: [
        section(
          "ufa_market",
          "UFA Fits",
          "Cap space points toward possible Summer UFA offers",
          ufaFitSummary ||
            "No confirmed Summer UFA and cap-space pairings were available.",
          [],
        ),
        section(
          "cap_space",
          "Buying Power",
          capLeader
            ? `${capLeader.teamName} has the widest path through the board`
            : "Room is useful; roster fit decides what comes next",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName}: ${money(team.capSpace)} available against ${money(team.committedSalary)} committed.`,
            )
            .join(" "),
          [],
        ),
        section(
          "roster_outlook",
          "Early Contenders",
          topTeam
            ? `${topTeam.teamName} owns the early talent lead`
            : "The early roster picture",
          teamOutlookSummary(packet),
          standingsLink,
        ),
        section(
          "draft_capital",
          "Early Draft Position",
          draftLeader
            ? `${draftLeader.teamName} gets the first major decision`
            : "The early board is still taking shape",
          draftPositionSummary ||
            "First-round positions have not been confirmed yet.",
          [],
        ),
        section(
          "transaction_wire",
          "Deals Already Done",
          signings[0]
            ? `${signings[0].playerName} tops the completed business`
            : "The completed business",
          signings
            .map(
              (contract) =>
                `${contract.teamName} signed ${contract.playerName} at ${money(contract.salary)}.`,
            )
            .join(" ") || "No completed signings were found in this window.",
          [],
        ),
        section(
          "next_week",
          "Next Stop",
          "The draft board is waiting",
          "One week before draft night, the GSHL Press Box will examine early draft position, roster fit and the teams facing the most interesting choices.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "pre_draft") {
    const orderedTeams = [...facts.teamOutlooks].sort(
      (left, right) =>
        (firstRoundPickByTeam.get(left.teamName) ?? Number.MAX_SAFE_INTEGER) -
          (firstRoundPickByTeam.get(right.teamName) ??
            Number.MAX_SAFE_INTEGER) ||
        left.teamName.localeCompare(right.teamName),
    );
    return {
      headline: draftLeader
        ? `${draftLeader.teamName} owns the first pressure point of draft night`
        : "The GSHL draft board is set",
      deck: `The ${facts.analysisSeasonName} draft order is set. We break down early position, roster needs and the choices that can change how the first rounds unfold.`,
      sections: [
        section(
          "draft_capital",
          "Draft Position",
          draftLeader
            ? `${draftLeader.teamName} gets the earliest first-round decision`
            : "The early board takes shape",
          orderedTeams
            .map((team) => {
              const firstRoundPick = firstRoundPickByTeam.get(team.teamName);
              return firstRoundPick === undefined
                ? `${team.teamName}: first-round position is still unconfirmed.`
                : `${team.teamName}: first-round pick No. ${firstRoundPick}.`;
            })
            .join(" "),
          [],
        ),
        section(
          "roster_outlook",
          "Needs Board",
          "Picks are only useful when they answer a question",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "cap_space",
          "Post-Draft Flexibility",
          capLeader
            ? `${capLeader.teamName} can still shop after the podium`
            : "Cap room after the podium",
          teamOutlookSummary(packet),
          [],
        ),
        section(
          "ufa_market",
          "Trade Watch",
          "Position, fit and nerve create the options",
          "The intrigue comes from where a team selects, who remains available and whether a front office values certainty over waiting for its turn.",
          [],
        ),
        section(
          "next_week",
          "Draft Countdown",
          `The draft begins ${facts.analysisSeasonDraftStartAt ?? facts.triggerDate}`,
          "Once the board is complete, the preseason issue will grade the fully formed rosters and make the predictions everyone can screenshot for later.",
          [],
        ),
      ],
    };
  }

  return {
    headline: topTeam
      ? `${topTeam.teamName} opens as the team to catch`
      : "The new GSHL season takes shape",
    deck: `The ${facts.analysisSeasonName} draft is complete and the rosters are formed. Talent ratings, cap construction and team depth point to the contenders—and the teams ready to surprise.`,
    sections: [
      section(
        "season_predictions",
        "Preseason Predictions",
        topTeam
          ? `${topTeam.teamName} earns the opening favourite tag`
          : "The opening forecast",
        teamOutlookSummary(packet),
        standingsLink,
      ),
      section(
        "roster_outlook",
        "Roster Rankings",
        "Talent on paper, before the chaos begins",
        facts.teamOutlooks
          .map(
            (team, index) =>
              `${index + 1}. ${team.teamName} — ${team.rosterTalent.toFixed(1)} talent rating across ${team.rosterSize} players.`,
          )
          .join(" "),
        [],
      ),
      section(
        "draft_capital",
        "New Faces",
        "The picks that changed the depth chart",
        facts.draftPicks
          .filter((pick) => pick.selectedPlayerName)
          .slice(0, 10)
          .map(
            (pick) =>
              `${pick.teamName} selected ${pick.selectedPlayerName} in Round ${pick.round}.`,
          )
          .join(" ") || "Completed draft selections were not available.",
        [],
      ),
      section(
        "cap_space",
        "Flexibility",
        capLeader
          ? `${capLeader.teamName} keeps the largest cushion`
          : "Who kept room for the unexpected?",
        teamOutlookSummary(packet),
        [],
      ),
      section(
        "next_week",
        "Puck Drop",
        "Predictions end where the games begin",
        "The next edition returns after Week 1 with actual results, actual movement and the first opportunities to pretend the preseason predictions never happened.",
        [{ label: "View schedule", href: "/schedule" }],
      ),
    ],
  };
}

function buildMilestoneTemplateEdition(packet: WeeklyEditionFactPacket) {
  return assignWeeklyEditionAuthors(
    buildMilestoneTemplateEditionCopy(packet),
    packet,
  );
}

function allText(content: WeeklyEditionContent) {
  return [
    content.headline,
    content.deck,
    ...content.sections.flatMap((item) => [
      item.eyebrow,
      item.headline,
      item.body,
      ...item.links.map((link) => link.label),
    ]),
  ].join("\n");
}

function hasPlayerOutcomeClaim(
  sentence: string,
  playerName: string,
  outcomePattern: RegExp,
  playerNames: readonly string[],
) {
  const playerMentions = playerNames.flatMap((name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...sentence.matchAll(new RegExp(escapedName, "gi"))].map(
      (match) => ({ name, index: match.index }),
    );
  });
  const flags = outcomePattern.flags.includes("g")
    ? outcomePattern.flags
    : `${outcomePattern.flags}g`;

  return [...sentence.matchAll(new RegExp(outcomePattern.source, flags))].some(
    (outcomeMatch) => {
      const closestPlayer = playerMentions
        .filter((mention) => mention.index <= outcomeMatch.index)
        .sort((left, right) => right.index - left.index)[0];
      return closestPlayer?.name === playerName;
    },
  );
}

function validateWeeklyEditionRuleClaims(
  content: WeeklyEditionContent,
  packet: WeeklyEditionFactPacket,
) {
  const errors: string[] = [];
  const text = allText(content);
  const sentences = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (
    /115%\s+of\s+(?:the\s+)?(?:prior|previous|old|expiring|contract)\s+salary/i.test(
      text,
    )
  ) {
    errors.push(
      "RFA re-signing salary must be based on the updated GSHL salary, not the prior contract salary.",
    );
  }
  if (
    /(?:drafted|draft-selected)\s+players?.{0,45}(?:count|counts|counting)\s+against\s+the\s+(?:salary\s+)?cap/i.test(
      text,
    )
  ) {
    errors.push(
      "Drafted players do not count against the salary cap unless they later sign a GSHL contract.",
    );
  }
  if (
    sentences.some((sentence) =>
      /\brfa(?:\s+\w+){0,4}\s+(?:costs?|at|requires?|is|would\s+be)\s+125%/i.test(
        sentence,
      ),
    )
  ) {
    errors.push(
      "An RFA re-signing costs 115% of the updated GSHL salary, not 125%.",
    );
  }
  if (
    sentences.some((sentence) =>
      /summer\s+(?:ufa|free\s+agent|free\s+agency)(?:\s+\w+){0,5}\s+(?:costs?|at|requires?|is|would\s+be)\s+115%/i.test(
        sentence,
      ),
    )
  ) {
    errors.push(
      "A Summer UFA contract costs 125% of the updated GSHL salary, not 115%.",
    );
  }

  const expiringContracts = packet.milestone?.expiringContracts ?? [];
  const expiringPlayerNames = expiringContracts.map(
    (contract) => contract.playerName,
  );
  for (const contract of expiringContracts) {
    const name = contract.playerName.toLowerCase();
    const related = sentences.filter((sentence) =>
      sentence.toLowerCase().includes(name),
    );
    const expiryStatus = normalizedExpiryStatus(contract);
    for (const sentence of related) {
      if (
        expiryStatus === String(ContractStatus.RFA) &&
        hasPlayerOutcomeClaim(
          sentence,
          contract.playerName,
          /(?:cannot|can't|may not|not eligible to).{0,35}re-?sign|(?:must|will|automatically).{0,35}(?:return|go|head).{0,20}(?:the\s+)?draft|draft-bound/i,
          expiringPlayerNames,
        )
      ) {
        errors.push(
          `${contract.playerName} has an RFA expiry and cannot be described as ineligible to re-sign or automatically draft-bound.`,
        );
      }
      if (
        expiryStatus === String(ContractStatus.UFA) &&
        hasPlayerOutcomeClaim(
          sentence,
          contract.playerName,
          /(?:can|could|may|eligible to).{0,35}(?:be\s+)?re-?sign|(?:summer\s+ufa|summer\s+free\s+agency).{0,35}(?:target|option|fit|signing)|(?:target|option|fit).{0,35}(?:summer\s+ufa|summer\s+free\s+agency)/i,
          expiringPlayerNames,
        )
      ) {
        errors.push(
          `${contract.playerName} has a UFA expiry and must be treated as draft-bound, not re-signable or available in Summer Free Agency.`,
        );
      }

      const statedSigningStatus =
        /signed\s+(?:as|via|through)\s+(?:an?\s+)?(drafted|rfa|ufa)\b/i.exec(
          sentence,
        )?.[1];
      if (statedSigningStatus && contract.signingStatus) {
        const expected = contract.signingStatus.toLowerCase();
        const stated =
          statedSigningStatus.toLowerCase() === "drafted"
            ? "drafted"
            : statedSigningStatus.toLowerCase();
        if (expected !== stated) {
          errors.push(
            `${contract.playerName}'s signing status is ${contract.signingStatus}; signing status cannot be inferred from expiry status.`,
          );
        }
      }
    }
  }

  for (const player of packet.milestone?.summerUfas ?? []) {
    const related = sentences.filter((sentence) =>
      sentence.toLowerCase().includes(player.playerName.toLowerCase()),
    );
    if (
      related.some((sentence) =>
        /(?:will|is certain to|is guaranteed to)\s+sign\s+with|guaranteed\s+(?:destination|signing)/i.test(
          sentence,
        ),
      )
    ) {
      errors.push(
        `${player.playerName}'s Summer UFA destination cannot be guaranteed before the seven-day matching process and signing algorithm are complete.`,
      );
    }
  }

  return errors;
}

function formatZodErrors(error: z.ZodError) {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
  );
}

function weeklyEditionAvailableLinks(packet: WeeklyEditionFactPacket) {
  const links = [
    { label: "Open League Office", href: "/leagueoffice" },
    { label: "View schedule", href: "/schedule" },
    { label: "View standings", href: "/standings" },
    ...pressBoxMatchups(packet.matchups).map((matchup) => ({
      label: "Open matchup",
      href: `/matchup/${matchup.matchupId}`,
    })),
    ...pressBoxNextMatchups(packet.nextMatchups).map((matchup) => ({
      label: "Open matchup",
      href: `/matchup/${matchup.matchupId}`,
    })),
    ...pressBoxEditorialCandidates(packet).flatMap(
      (candidate) => candidate.links,
    ),
  ];
  return links.filter(
    (link, index) =>
      links.findIndex((candidate) => candidate.href === link.href) === index,
  );
}

export function validateWeeklyEditionContent(
  value: unknown,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionValidationResult {
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success)
    return { valid: false, errors: formatZodErrors(parsed.error) };

  const errors: string[] = [];
  const allowedAuthors = new Map(
    buildWeeklyEditionAuthorRoster(packet).map(({ author }) => [
      author.name.trim().toLowerCase(),
      author,
    ]),
  );
  const allowedHrefs = new Set(
    weeklyEditionAvailableLinks(packet).map((link) => link.href),
  );
  const content = parsed.data;
  const text = allText(content);
  if (/<\/?[a-z][^>]*>/i.test(text))
    errors.push("HTML is not allowed in edition copy.");
  errors.push(...validateWeeklyEditionRuleClaims(content, packet));

  const seen = new Set<string>();
  const seenAuthorNames = new Set<string>();
  for (const [index, item] of content.sections.entries()) {
    if (seen.has(item.id)) errors.push(`Duplicate section ID: ${item.id}.`);
    seen.add(item.id);
    if (item.author) {
      const authorKey = item.author.name.trim().toLowerCase();
      if (seenAuthorNames.has(authorKey)) {
        errors.push(
          `${item.author.name} cannot be assigned to more than one article.`,
        );
      }
      seenAuthorNames.add(authorKey);
      const allowedAuthor = allowedAuthors.get(authorKey);
      if (!allowedAuthor) {
        errors.push(`${item.author.name} is not an approved Press Box author.`);
      } else if (
        JSON.stringify(item.author) !== JSON.stringify(allowedAuthor)
      ) {
        errors.push(
          `Author details for ${item.author.name} must match the newsroom roster.`,
        );
      } else {
        const matches = referencedTeams(item, packet);
        if (
          allowedAuthor.scope === "team" &&
          !matches.some((match) => match.team.teamId === allowedAuthor.teamId)
        ) {
          errors.push(
            `${allowedAuthor.name} may write only an article specifically centered on ${allowedAuthor.teamName}.`,
          );
        }
      }
    } else {
      errors.push(`Article ${index + 1} must have an approved author.`);
    }
    for (const link of item.links) {
      if (!allowedHrefs.has(link.href)) {
        errors.push(
          `Link ${link.href} is not available in the verified fact packet.`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    content: errors.length === 0 ? content : undefined,
  };
}

export function validateWeeklyEditionImport(
  raw: string,
  packet: WeeklyEditionFactPacket,
): WeeklyEditionValidationResult {
  if (/<\/?[a-z][^>]*>/i.test(raw)) {
    return { valid: false, errors: ["HTML is not allowed in edition copy."] };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      errors: ["The response is not valid JSON. Paste only the JSON object."],
    };
  }
  return validateWeeklyEditionContent(
    normalizeWeeklyEditionImportLengths(value),
    packet,
  );
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortenImportedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text.length <= maximum) return text;

  const available = maximum - 1;
  const prefix = text.slice(0, available);
  const sentenceBreak = Math.max(
    prefix.lastIndexOf(". "),
    prefix.lastIndexOf("! "),
    prefix.lastIndexOf("? "),
  );
  const wordBreak = prefix.lastIndexOf(" ");
  const boundary =
    sentenceBreak >= Math.floor(maximum * 0.55)
      ? sentenceBreak + 1
      : wordBreak >= Math.floor(maximum * 0.7)
        ? wordBreak
        : available;
  return `${prefix.slice(0, boundary).trimEnd()}…`;
}

function normalizeWeeklyEditionImportLengths(value: unknown): unknown {
  if (!isUnknownRecord(value)) return value;
  const sections = Array.isArray(value.sections)
    ? value.sections.map((section: unknown, index: number) => {
        const slot = weeklyEditionArticleSlot(index);
        return isUnknownRecord(section) && slot
          ? {
              ...section,
              ...slot,
              headline: shortenImportedText(section.headline, 90),
              body: shortenImportedText(section.body, 1000),
            }
          : section;
      })
    : value.sections;
  return {
    ...value,
    headline: shortenImportedText(value.headline, 90),
    deck: shortenImportedText(value.deck, 220),
    sections,
  };
}

export function filterWeeklyEditionContent(
  content: WeeklyEditionContent,
  inactiveSectionIds: readonly string[] = [],
): WeeklyEditionContent {
  if (inactiveSectionIds.length === 0) return content;
  const inactive = new Set(inactiveSectionIds);
  return {
    ...content,
    sections: content.sections.filter((section) => !inactive.has(section.id)),
  };
}

function dayAfter(dateKey: string | undefined) {
  if (!dateKey) return undefined;
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function isWeeklyEditionSummerUfaPoolAvailable(
  triggerDate: string,
  signingDeadline: string | undefined,
) {
  return Boolean(signingDeadline && triggerDate > signingDeadline);
}

export function buildWeeklyEditionRuleContext(packet: WeeklyEditionFactPacket) {
  const milestone = packet.milestone;
  const signingDeadline = milestone?.analysisSeasonSigningEndDate;
  const draftStartAt = milestone?.analysisSeasonDraftStartAt;
  const seasonFrame = milestone
    ? packet.issueType === "final_recap"
      ? {
          completedSeason: {
            id: packet.season.id,
            name: packet.season.name,
            endDate: packet.season.endDate,
          },
          issueTriggerDate: milestone.triggerDate,
          timeZone: "America/Toronto",
        }
      : {
          completedSeason: {
            id: packet.season.id,
            name: packet.season.name,
            endDate: packet.season.endDate,
          },
          upcomingSeason: {
            id: milestone.analysisSeasonId,
            name: milestone.analysisSeasonName,
          },
          issueTriggerDate: milestone.triggerDate,
          timeZone: "America/Toronto",
          contractCoverage:
            "A contract signed during the completed season's signing cycle starts with the upcoming season and covers one, two, or three future GSHL seasons.",
        }
    : {
        activeSeason: {
          id: packet.season.id,
          name: packet.season.name,
        },
        coveredWeek: packet.week,
        timeZone: "America/Toronto",
      };
  const statusFields = {
    signingStatus:
      "Records how the current contract was signed. It is provenance only and must never be used to decide whether the player can be re-signed when the contract expires.",
    expiryStatus:
      "Records the player's re-signing rights when this contract expires. It is authoritative for renewal eligibility and must never be used to claim how the current contract was originally signed.",
    rfaExpiry:
      "expiryStatus=RFA means the eligible current team may re-sign the player during an active signing period at exactly 115% of the player's updated GSHL salary.",
    ufaExpiry:
      "expiryStatus=UFA means the contract cannot be renewed. The player returns to the GSHL Draft and must not be presented as a Summer Free Agency target.",
    consecutiveContractLimit:
      "A player may play under no more than two consecutive contracts. The expiryStatus supplied in EDITION_FACTS is the authoritative result of that lifecycle; do not recalculate it from signingStatus.",
    summerUfa:
      "Summer UFA is a separate post-deadline player state, not an inference from expiryStatus=UFA. Only players explicitly listed in summerUfas are confirmed Summer Free Agency targets.",
  };
  const capRules = {
    hardCap: milestone?.salaryCap ?? 25_000_000,
    counts:
      "Players under GSHL contract and active buyout cap charges count against the cap in every season they cover.",
    doesNotCount:
      "Ordinary drafted players do not count against the salary cap unless they later sign a GSHL contract.",
    noRelief:
      "There is no salary retention, proration, cap exception, retained salary, or other cap-relief mechanism.",
    buyouts:
      "Dropping a contracted player triggers an immediate buyout. The cap charge is 50% of salary for the remaining contract years; a final-year buyout also carries that 50% charge through the following GSHL season. Buyout charges cannot be traded or retained and do not consume draft selections.",
    interpretation:
      "Negative capSpace means a team is over the cap; do not silently convert it to zero. A team cannot complete a signing or trade that puts it over the hard cap in any covered season.",
  };
  const rosterConstructionRules = {
    annualRoster:
      "Each team builds a 15-player roster every year. The salary cap generally lets a team retain or add only about two to four players on GSHL contracts; the remaining roster spots are filled through the annual draft.",
    contractedCore:
      "The two-to-four range is a normal cap-driven roster pattern, not a guaranteed quota. The actual number depends on contract salaries and existing buyout charges.",
    capConstraint:
      "Low or insufficient cap space means the team cannot sign every player it wants. It does not prevent the team from completing a 15-player roster because unsigned spots are filled in the draft.",
    unsignedPath:
      "An eligible player a team cannot afford to retain may enter Summer Free Agency after the re-signing deadline and, if still unsigned when that market closes, returns to the draft.",
  };
  const signingRules = {
    terms: "Every new GSHL contract is one, two, or three years.",
    salaryBasis:
      "Use the player's updated GSHL salary for a new contract. Do not calculate a new deal from the salary on the expiring contract.",
    eligibility:
      "A player is eligible only after spending more than two-thirds of the regular season on the signing team's roster by player-days, or more than two-thirds on any GSHL roster by player-days. A player-day is one roster spot for one calendar day.",
    earlySigningPeriod: "December 15 through December 31.",
    lateSigningPeriod: {
      description:
        "Runs from the end of the GSHL Playoffs through the end of the NHL Playoffs.",
      deadline: signingDeadline,
    },
  };
  const summerRules = {
    window: {
      opens: dayAfter(signingDeadline),
      closes: draftStartAt,
      timeZone: "America/Toronto",
    },
    pool: "At the end of the Late Signing Period, each eligible player who is still unsigned becomes a Summer UFA. This does not override an expiryStatus=UFA instruction that sends a completed contract back to the draft.",
    price:
      "A confirmed Summer UFA costs exactly 125% of the player's updated GSHL salary for a one-, two-, or three-year term.",
    offerProcess:
      "An offer is binding and remains open for seven days. Other teams may match it. With no match, the original team signs the player; with multiple matching offers, the probabilistic UFA Signing Algorithm chooses the team.",
    algorithm:
      "The algorithm considers Owner Ladder ranking, previous-season performance, other contracted players, contract length, team situation and roster construction, plus randomized weighting. No destination is guaranteed.",
  };
  const resigningOutlookRules = {
    marketStage:
      "The Late Signing Period is still open. This is the stage for comparing each team's remaining cap space with the exact 115% re-signing costs of its expiryStatus=RFA players.",
    decisionFrame:
      "Evaluate which individual RFAs and combinations of RFAs fit under each team's cap. A team may be able to keep some but not all of them.",
    unaffordablePlayers:
      "If an RFA re-signing would exceed the hard cap, the team cannot complete that deal. The consequence is losing the exclusive re-signing opportunity, not a roster emergency: that player proceeds to Summer Free Agency and potentially the draft.",
  };
  const offseasonMarketRules = {
    marketStage:
      "The Late Signing Period and all RFA re-signing rights have ended. No unsigned player remains an RFA in the current market; every currently available player must be an explicitly listed Summer UFA.",
    activeContractStatuses:
      "An expiryStatus on a contract already signed for a future season describes how that active contract will eventually expire. It does not make the signed player an RFA or UFA in the current summer market.",
    choices:
      "Teams may pursue affordable Summer UFAs who improve their rated roster, leave cap space unused to preserve future flexibility, or explore trades. Spending available cap space is optional, not automatically the best decision.",
    rareTrades:
      "Trades involving an existing contract and future draft picks are permitted but rare. The receiving team must remain under the hard cap in every covered season, and no such trade should be assumed unless EDITION_FACTS confirms it.",
    draftFallback:
      "A Summer UFA who is not signed before the summer market closes returns to the annual draft.",
  };
  const draftRules = {
    format:
      "The draft has 15 rounds. The standard order is Round 1 forward, Round 2 forward, Round 3 reverse, Round 4 forward, then alternating.",
    keeperCost:
      "Each contracted player consumes one of the team's latest available draft selections. Buyout charges do not consume draft selections.",
    editorialUse:
      "The routine 15-slot allotment is not an advantage or storyline. Discuss actual selection order, early position, keeper-consumed selections, roster needs, player fit and board decisions.",
  };
  const matchupRules = {
    playoffOrder:
      "F means Final, SF means Semifinal and QF means Quarterfinal. Playoff games are major stories ordered F, then SF, then QF.",
    loserTournament:
      "LT means Loser Tournament. LT games must not be a lead, headline, primary article or meaningful supporting focus.",
  };

  const common = {
    authority:
      "This RULEBOOK_CONTEXT is authoritative. EDITION_FACTS is authoritative for people, teams, amounts, dates and events. If either source does not establish a claim, write it conditionally or say it is unknown.",
    seasonFrame,
  };
  switch (packet.issueType) {
    case "weekly":
      return { ...common, matchupRules };
    case "final_recap":
      return { ...common, matchupRules };
    case "resigning_outlook":
      return {
        ...common,
        statusFields,
        capRules,
        rosterConstructionRules,
        signingRules,
        resigningOutlookRules,
      };
    case "offseason_market":
      return {
        ...common,
        capRules,
        rosterConstructionRules,
        summerRules,
        offseasonMarketRules,
        draftRules,
      };
    case "pre_draft":
      return { ...common, capRules, rosterConstructionRules, draftRules };
    case "preseason":
      return { ...common, capRules, rosterConstructionRules, draftRules };
  }
}

export function buildWeeklyEditionStoryScoutPrompt(
  packet: WeeklyEditionFactPacket,
  articleCount: WeeklyEditionArticleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
) {
  const newsroomAuthors = buildWeeklyEditionAuthorRoster(packet);
  const storyLedger = buildWeeklyEditionStoryLedger(packet);
  return [
    "PROMPT_FORMAT=newsroom_pitch_desk_v1",
    "You are running the GSHL Press Box pitch meeting. The goal is to discover the strongest supported stories before any newsletter copy is written.",
    "Every entry in NEWSROOM_AUTHORS is a working writer. Return exactly one submission for every writer, in the supplied order, and copy each author object exactly. A writer may file zero, one, or two pitches. Zero is the correct answer when the ledger has no story inside that writer's beat.",
    "Each pitch needs one exact leadCandidateId and no more than two exact supportingCandidateIds from STORY_LEDGER. The lead evidence must fit the writer's scoutsFor scope. Do not pitch a subject merely because a name or number exists; look for consequence, surprise, tension, a decision, a changed hierarchy, or a trend supported by a useful comparison.",
    "Team beat writers may lead only with evidence centered on their team. Conference reporters may lead only with evidence centered on a team in their conference. League specialists must obey scoutsFor and passesOn. Do not stretch a beat to fill space.",
    "The proposedHeadline and angle are an editor's brief, not finished article prose. State what happened, why it matters now, and which evidence carries the story. Do not invent quotes, rumours, motives, injuries, relationships, rules, history, or certainty.",
    "Score each pitch from 1 to 5 for consequence, readerInterest, evidenceStrength, and freshness. Calibrate the scores against the other candidates in this ledger; 5 means among the best available in this edition, not merely publishable.",
    `The server will validate every author and evidence ID, combine these scores with the ledger's independent importance score, remove duplicate leads, enforce a mix of subjects, and select ${articleCount} assignments. Return only the structured pitch submissions.`,
    "",
    `ISSUE_CONTEXT=${JSON.stringify(
      {
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        season: packet.season,
        week: packet.week,
      },
      null,
      2,
    )}`,
    "",
    `NEWSROOM_AUTHORS=${JSON.stringify(newsroomAuthors, null, 2)}`,
    "",
    `STORY_LEDGER=${JSON.stringify(storyLedger, null, 2)}`,
  ].join("\n");
}

export function validateWeeklyEditionStoryAssignments(
  content: WeeklyEditionContent,
  assignments: WeeklyEditionStoryAssignment[],
  packet: WeeklyEditionFactPacket,
) {
  const errors: string[] = [];
  const copy = [
    content.headline,
    content.deck,
    ...content.sections.flatMap((section) => [
      section.eyebrow,
      section.headline,
      section.body,
    ]),
  ].join("\n");
  const bannedPhrases = [
    "here is the thing",
    "in today's landscape",
    "more than just",
    "it is important to note",
    "game-changer",
    "pivotal moment",
    "a testament to",
    "let that sink in",
    "at the end of the day",
  ];
  for (const phrase of bannedPhrases) {
    if (copy.toLowerCase().includes(phrase)) {
      errors.push(`The copy uses the banned newsroom phrase "${phrase}"`);
    }
  }
  let articleCount: WeeklyEditionArticleCount;
  try {
    articleCount = parseWeeklyEditionArticleCount(assignments.length);
  } catch {
    return ["The editor assigned an unsupported number of stories"];
  }
  if (content.sections.length !== articleCount) {
    errors.push(`The draft must contain exactly ${articleCount} stories`);
  }
  const candidatesById = new Map(
    pressBoxEditorialCandidates(packet).map((candidate) => [
      candidate.id,
      candidate,
    ]),
  );
  assignments.forEach((assignment, index) => {
    const section = content.sections[index];
    if (!section) {
      errors.push(`Article ${index + 1} is missing`);
      return;
    }
    if (section.id !== assignment.id || section.kind !== assignment.kind) {
      errors.push(`Article ${index + 1} changed its assigned slot`);
    }
    if (
      !section.author ||
      !sameWeeklyEditionAuthor(section.author, assignment.author)
    ) {
      errors.push(`Article ${index + 1} changed its assigned writer`);
    }
    const candidate = candidatesById.get(assignment.leadCandidateId);
    const matchup =
      candidate?.kind === "matchup"
        ? packet.matchups.find(
            (row) => `matchup:${row.matchupId}` === candidate.id,
          )
        : undefined;
    const requiredSubjectNames = matchup
      ? [matchup.homeTeamName, matchup.awayTeamName]
      : candidate?.playerName
        ? [candidate.playerName]
        : candidate?.franchiseName
          ? [candidate.franchiseName]
          : candidate?.teamName
            ? [candidate.teamName]
            : [];
    const articleCopy = `${section.headline}\n${section.body}`.toLowerCase();
    if (
      requiredSubjectNames.some(
        (name) => !articleCopy.includes(name.toLowerCase()),
      )
    ) {
      errors.push(`Article ${index + 1} changed its assigned subject`);
    }
  });
  return errors;
}

export function buildWeeklyEditionChatGptPrompt(
  packet: WeeklyEditionFactPacket,
  assignments?: WeeklyEditionStoryAssignment[],
  requestedArticleCount: WeeklyEditionArticleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
) {
  const articleCount = assignments
    ? parseWeeklyEditionArticleCount(assignments.length)
    : requestedArticleCount;
  const articleSlots = buildWeeklyEditionArticleSlots(articleCount);
  const ruleContext = buildWeeklyEditionRuleContext(packet);
  const editorialMatchups = pressBoxMatchups(packet.matchups);
  const previewMatchups = pressBoxNextMatchups(packet.nextMatchups);
  const editorialCandidates = pressBoxEditorialCandidates(packet);
  const newsroomAuthors = buildWeeklyEditionAuthorRoster(packet);
  const availableLinks = weeklyEditionAvailableLinks(packet);
  const notableFacts = editorialCandidates
    .filter(
      (candidate) =>
        candidate.kind !== "matchup" &&
        candidate.kind !== "transaction" &&
        candidate.kind !== "missed_start" &&
        !candidate.id.startsWith("power:") &&
        !candidate.id.startsWith("performance:weekly-star:"),
    )
    .map((candidate) => ({
      id: candidate.id,
      type: candidate.kind,
      scope: candidate.scope,
      occurredAt: candidate.occurredAt,
      playerId: candidate.playerId,
      playerName: candidate.playerName,
      teamId: candidate.teamId,
      teamName: candidate.teamName,
      summary: candidate.summary,
      metrics: candidate.metrics,
      links: candidate.links,
    }));
  const milestone = packet.milestone;
  const analysisSeason = milestone
    ? {
        id: milestone.analysisSeasonId,
        name: milestone.analysisSeasonName,
        signingEndDate: milestone.analysisSeasonSigningEndDate,
        draftStartAt: milestone.analysisSeasonDraftStartAt,
      }
    : undefined;
  const milestoneContext = milestone
    ? {
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        analysisSeason,
        triggerDate: milestone.triggerDate,
        salaryCap: milestone.salaryCap,
      }
    : undefined;
  const leagueSnapshot = {
    snapshotAt:
      milestone?.triggerDate ??
      packet.week.endDate ??
      packet.season.endDate ??
      "",
    publication: {
      name: "GSHL Press Box",
      leagueName: "Gem Stone Hockey League",
      issueType: packet.issueType,
      issueLabel: packet.issueLabel,
    },
    ratingGuide: {
      playerRating:
        "Overall player rating. Higher is better and it is the baseline measure of individual quality.",
      teamTalentRating:
        "The same tiered roster-talent rating shown in the Draft Hub, calculated across a full 15-player roster with empty slots counting as zero: primary starters count most, followed by secondary starters and goalie, utility, then bench. Higher is better.",
      gmRating:
        "The historical GM Ladder rating based on results and accomplishments. It measures the manager's record, not current roster talent.",
    },
  };
  const promptTeamOutlooks = (milestone?.teamOutlooks ?? []).map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    capSpace: team.capSpace,
    committedSalary: team.committedSalary,
    rosterSize: team.rosterSize,
    rosterTalent: team.rosterTalent,
    expiringCount: team.expiringCount,
    firstRoundPickCount: team.firstRoundPickCount,
    draftSelectionsConsumed: team.draftSelectionsConsumed,
  }));
  const signedPlayers = milestone?.signedPlayers ?? [];
  const expiringContracts = milestone?.expiringContracts ?? [];
  const teamProfiles = promptTeamOutlooks.map((team) => ({
    ...team,
    signedPlayers: signedPlayers.filter(
      (contract) => contract.teamName === team.teamName,
    ),
    expiringContracts: expiringContracts.filter(
      (contract) => contract.teamName === team.teamName,
    ),
    draftBoundExpiries: expiringContracts.filter(
      (contract) =>
        contract.teamName === team.teamName && contractReturnsToDraft(contract),
    ),
  }));
  const offseasonTeamProfiles = promptTeamOutlooks.map((team) => ({
    ...team,
    signedPlayers: signedPlayers.filter(
      (contract) => contract.teamName === team.teamName,
    ),
  }));
  const championshipMatchup = editorialMatchups.find(
    (matchup) => matchup.gameType === "F",
  );
  const draftProfiles = promptTeamOutlooks.map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    signedRosterTalent: team.rosterTalent,
    signedPlayerCount: team.rosterSize,
    signedPlayers: signedPlayers.filter(
      (contract) => contract.teamName === team.teamName,
    ),
    draftSelectionsConsumed: team.draftSelectionsConsumed,
    earlyDraftPicks: (milestone?.draftPicks ?? [])
      .filter((pick) => pick.teamName === team.teamName && pick.round <= 5)
      .map((pick) => ({
        round: pick.round,
        pick: pick.pick,
        selectedPlayerName: pick.selectedPlayerName,
      })),
  }));
  const preseasonProfiles = promptTeamOutlooks.map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    rosterTalent: team.rosterTalent,
    rosterSize: team.rosterSize,
    signedPlayers: signedPlayers.filter(
      (contract) => contract.teamName === team.teamName,
    ),
    draftedPlayers: (milestone?.draftPicks ?? [])
      .filter(
        (pick) =>
          pick.teamName === team.teamName && Boolean(pick.selectedPlayerName),
      )
      .map((pick) => ({
        round: pick.round,
        pick: pick.pick,
        playerName: pick.selectedPlayerName,
        playerRating: pick.selectedPlayerRating,
      })),
  }));
  let facts: object;
  switch (packet.issueType) {
    case "weekly":
      facts = {
        ...leagueSnapshot,
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        season: packet.season,
        week: packet.week,
        matchups: editorialMatchups,
        standoutPlayers: packet.stars,
        teamTalentRatings: packet.teams.flatMap((team) =>
          team.talentRating === undefined
            ? []
            : [
                {
                  teamId: team.teamId,
                  teamName: team.name,
                  talentRating: team.talentRating,
                },
              ],
        ),
        powerMovement: packet.powerMovers,
        transactions: packet.activity,
        missedStarts: packet.missedStarts,
        notableFacts,
        nextMatchups: previewMatchups,
      };
      break;
    case "final_recap":
      facts = {
        ...leagueSnapshot,
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        completedSeason: {
          id: packet.season.id,
          name: packet.season.name,
          year: packet.season.year,
          endDate: packet.season.endDate,
        },
        championship: championshipMatchup
          ? {
              championTeamId: championshipMatchup.winnerTeamId,
              championTeamName: championshipMatchup.winnerTeamName,
              finalistTeamName: championshipMatchup.loserTeamName,
              score: {
                home: championshipMatchup.homeScore,
                away: championshipMatchup.awayScore,
              },
              matchupId: championshipMatchup.matchupId,
            }
          : undefined,
        seasonResults: editorialMatchups,
        seasonHighlights: notableFacts,
        seasonEndingPlayerPerformances: packet.stars,
        finalPowerRankings: packet.powerMovers,
      };
      break;
    case "resigning_outlook":
      facts = {
        ...leagueSnapshot,
        ...milestoneContext,
        teams: teamProfiles,
        buyoutCharges: milestone?.buyoutCharges ?? [],
      };
      break;
    case "offseason_market":
      facts = {
        ...leagueSnapshot,
        ...milestoneContext,
        teams: offseasonTeamProfiles,
        recentSignings: milestone?.recentSignings ?? [],
        summerUfas: milestone?.summerUfas ?? [],
        buyoutCharges: milestone?.buyoutCharges ?? [],
      };
      break;
    case "pre_draft":
      facts = {
        ...leagueSnapshot,
        ...milestoneContext,
        teamDraftProfiles: draftProfiles,
      };
      break;
    case "preseason":
      facts = {
        ...leagueSnapshot,
        ...milestoneContext,
        teamRosterProfiles: preseasonProfiles,
        gmLadder: milestone?.gmRankings ?? [],
      };
      break;
  }
  const outputContract = {
    layout: `Exactly ${articleCount} articles in order. Articles 1 and 2 are the two primary stories shown side by side. Articles 3 through ${articleCount} are standard stories in the two-column grid.`,
    articleSlots,
    requiredArticleFields: [
      "id",
      "kind",
      "eyebrow",
      "headline",
      "body",
      "author",
      "links",
    ],
    authorRule: assignments
      ? "Copy the author from each ordered EDITOR_ASSIGNMENTS entry exactly. Do not reassign a story."
      : `Choose one approved NEWSROOM_AUTHORS author per article and copy that author object exactly. All ${articleCount} bylines must be different.`,
    assignmentRule: assignments
      ? "Write exactly one article for each ordered EDITOR_ASSIGNMENTS entry. Copy its id and kind, use its lead and supporting candidate IDs as the factual spine, and preserve its angle."
      : `Choose ${articleCount} distinct, consequential stories from the snapshot.`,
    linksRule:
      "Use zero or more entries from AVAILABLE_LINKS. Never invent a URL.",
  };
  return [
    assignments
      ? "PROMPT_FORMAT=assigned_newsroom_edition_v7"
      : "PROMPT_FORMAT=league_snapshot_v7",
    "You are the editor of the GSHL Press Box, a fantasy-hockey league newspaper covering the Gem Stone Hockey League.",
    assignments
      ? `The pitch meeting is complete. EDITOR_ASSIGNMENTS contains the ${articleCount} selected stories in publication order. Write those assignments; do not substitute a subject, change a byline, or merge two assignments.`
      : "EDITION_FACTS is a timestamped snapshot of the league at publication time. It is context, not an article assignment or outline. Use your own editorial judgment and creativity to decide every story, angle, headline, connection and emphasis.",
    assignments
      ? "NEWSROOM_AUTHORS is the complete staff directory and defines each selected writer's beat and voice. EDITOR_ASSIGNMENTS already contains the approved bylines."
      : "NEWSROOM_AUTHORS is the complete author roster. Each entry describes that reporter's role and eligible beat. Choose authors after choosing the stories, copy each selected author object exactly, and never use one reporter twice in the edition.",
    "A team beat writer is eligible only for an article centered on that writer's team. A conference reporter is eligible only for an article centered on that conference.",
    "VOICE: Write like an informed hockey reporter, not an assistant. Follow each assigned writer's voice without turning the byline into a caricature. Lead with the concrete news. Use specific names, scores, amounts and ratings as evidence, then explain what they change. Vary sentence length and keep paragraphs to two through five sentences.",
    "VOICE: Cut throat-clearing, generic transitions, inflated claims and moralizing recap endings. Do not use canned frames such as 'here is the thing', 'in today's landscape', 'more than just', 'it is important to note', 'game-changer', 'pivotal moment' or 'a testament to'. Do not replace them with choppy fragments.",
    "VOICE: Preserve the packet's scope and uncertainty. Never add a quote, anecdote, motive, conclusion or degree of certainty that the facts do not support.",
    "Factual claims must be supported by EDITION_FACTS or RULEBOOK_CONTEXT. Do not invent events, quotes, relationships, motives, injuries, rules, names, scores, statistics, transactions or historical claims. Clearly rhetorical color is allowed when it does not imply a new fact.",
    "Use the supplied ratings as the baseline for league hierarchy and broad judgments, then use the surrounding events and details to explain or challenge that baseline. Ratings may support playful hockey-style chirps about strong and weak players, rosters, and GM track records, but keep the chirps proportionate to the evidence and distinguish player quality, roster talent, and GM performance.",
    "Use RULEBOOK_CONTEXT as the source of truth for league process. Apply only the rule blocks included for this edition. Do not substitute NHL rules or ordinary fantasy-hockey assumptions.",
    ...(packet.issueType === "resigning_outlook"
      ? [
          "CONTRACT FIELD RULE: signingStatus tells you how the current contract was signed. expiryStatus tells you whether that contract may be re-signed when it expires. These fields are independent; never infer one from the other.",
        ]
      : []),
    ...(packet.issueType === "resigning_outlook"
      ? [
          "A contract with expiryStatus=UFA is draft-bound and cannot be re-signed. Summer UFA is a separate post-deadline status that must be explicitly confirmed in a later market snapshot.",
        ]
      : []),
    "Use only the people, teams, amounts, dates, outcomes, transactions, and links in EDITION_FACTS, plus the league process and timelines in RULEBOOK_CONTEXT. Do not add HTML, Markdown links, extra sections, or new URLs.",
    `Return only one JSON object with headline, deck, and exactly ${articleCount} sections. OUTPUT_CONTRACT defines only the display structure and required fields; it does not define the subjects of the articles.`,
    "LENGTH TARGETS: Count characters before replying. Main headline should be 55–80 characters and must never exceed 90. Deck should be 120–180 and must never exceed 220. Each section headline should be 35–70 and must never exceed 90. Each section body should be 450–750 and must never exceed 1000. Eyebrow must never exceed 50. These are hard per-field limits, not approximate word counts; do not use all available space.",
    "",
    `RULEBOOK_CONTEXT=${JSON.stringify(ruleContext, null, 2)}`,
    "",
    `NEWSROOM_AUTHORS=${JSON.stringify(newsroomAuthors, null, 2)}`,
    "",
    ...(assignments
      ? [
          `EDITOR_ASSIGNMENTS=${JSON.stringify(assignments, null, 2)}`,
          "",
          `STORY_LEDGER=${JSON.stringify(buildWeeklyEditionStoryLedger(packet), null, 2)}`,
          "",
        ]
      : []),
    `EDITION_FACTS=${JSON.stringify(facts, null, 2)}`,
    "",
    `AVAILABLE_LINKS=${JSON.stringify(availableLinks, null, 2)}`,
    "",
    `OUTPUT_CONTRACT=${JSON.stringify(outputContract, null, 2)}`,
  ].join("\n");
}
