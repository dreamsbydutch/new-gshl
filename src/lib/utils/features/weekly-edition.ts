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
  WeeklyEditionAuthor,
  WeeklyEditionMatchupFact,
  WeeklyEditionMilestoneScheduleEntry,
  WeeklyEditionMilestoneScheduleInput,
  WeeklyEditionSection,
  WeeklyEditionSectionKind,
  WeeklyEditionRecordFact,
  WeeklyEditionRecordObservation,
  WeeklyEditionValidationResult,
} from "@gshl-types";
import { normalizeDateOnlyValue } from "../core/date";
import { ContractStatus, ContractType } from "../domain/constants";

export const WEEKLY_EDITION_SECTION_KINDS = [
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
    sections: z.array(sectionSchema).length(6),
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
      teamName: activity.teamName,
      metrics: [],
      links: [],
    });
  }

  for (const missed of input.missedStarts) {
    candidates.push({
      id: `missed-start:${missed.id}`,
      kind: "missed_start",
      scope: "week",
      importance: candidateImportance(42 + missed.count * 5),
      occurredAt: missed.date,
      headlineHint: `${missed.teamName} leaves ${missed.count} start${missed.count === 1 ? "" : "s"} unused`,
      summary: `${missed.playerName} accounted for ${missed.count} missed start${missed.count === 1 ? "" : "s"} for ${missed.teamName}.`,
      playerName: missed.playerName,
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
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
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
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        currentRank,
        previousRank,
        rankChange: previousRank - currentRank,
        currentElo,
        eloChange:
          currentElo !== undefined && previousElo !== undefined
            ? currentElo - previousElo
            : undefined,
      };
    })
    .sort((left, right) => left.currentRank - right.currentRank);
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
    editorialCandidates: input.editorialCandidates ?? [],
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
    conferenceId: team.conferenceId,
    conferenceName: team.conferenceName,
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
  const teamAuthors = matches.map((match) => teamAuthor(match.team));
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
  const teamAuthors = packet.teams.map(teamAuthor);
  const conferenceAuthors = packet.teams.map(conferenceAuthor);
  const standardStaff = Object.values(WEEKLY_EDITION_STAFF).filter(
    (author) => author.position !== "Editor-in-Chief",
  );
  return [
    ...rotateAuthors(
      uniqueAuthors([...teamAuthors, ...conferenceAuthors, ...standardStaff]),
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
  requiredReSigningSalary?: number;
}) {
  return contract.requiredReSigningSalary ?? Math.round(contract.salary * 1.15);
}

function contractOutcomeSummary(contract: WeeklyEditionContractFact) {
  if (contractReturnsToDraft(contract)) {
    return `${contract.playerName}'s UFA expiry sends the player automatically back to the draft; the player cannot be re-signed or signed during the summer.`;
  }
  if (contractCanBeReSigned(contract)) {
    return `${contract.playerName} can be re-signed at ${money(requiredReSigningSalary(contract))}, exactly 115% of the prior ${money(contract.salary)} salary.`;
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
          "Expired UFAs are draft-bound, not summer targets",
          "Only RFAs can be retained in the re-signing window, at exactly 115% of their prior salary. Every expired UFA returns automatically to the draft, where cap room and open roster spots become draft-day leverage.",
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
          "Draft-Bound UFAs",
          "The teams with money to spend on draft day",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName}: ${money(team.capSpace)} available and ${team.rosterSize} players currently rostered; expired UFAs cannot be signed directly and must be acquired through the draft.`,
            )
            .join(" "),
          [],
        ),
        section(
          "transaction_wire",
          "Deals Already Done",
          signings[0]
            ? `${signings[0].playerName} tops the early signing board`
            : "The early signing board",
          signings
            .map(
              (contract) =>
                `${contract.teamName} signed ${contract.playerName} at ${money(contract.salary)}.`,
            )
            .join(" ") || "No completed signings were found in this window.",
          [],
        ),
        section(
          "cap_space",
          "Buying Power",
          "Room is useful; roster fit decides what comes next",
          teamOutlookSummary(packet),
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

function formatZodErrors(error: z.ZodError) {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
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
  const expected = buildTemplateWeeklyEdition(packet);
  const expectedById = new Map(
    expected.sections.map((item) => [item.id, item]),
  );
  const content = {
    ...parsed.data,
    sections: parsed.data.sections.map((item) => ({
      ...item,
      author: item.author ?? expectedById.get(item.id)?.author,
    })),
  };
  const text = allText(content);
  if (/<\/?[a-z][^>]*>/i.test(text))
    errors.push("HTML is not allowed in edition copy.");

  const seen = new Set<string>();
  const seenAuthorNames = new Set<string>();
  for (const [index, item] of content.sections.entries()) {
    if (seen.has(item.id)) errors.push(`Duplicate section ID: ${item.id}.`);
    seen.add(item.id);
    const expectedSection = expectedById.get(item.id);
    if (expectedSection?.kind !== item.kind) {
      errors.push(`Unsupported section or kind: ${item.id}.`);
      continue;
    }
    if (expected.sections[index]?.id !== item.id) {
      errors.push(`Section ${item.id} is out of order.`);
    }
    if (item.eyebrow !== expectedSection.eyebrow) {
      errors.push(`Eyebrow in ${item.id} must match the section plan.`);
    }
    if (
      JSON.stringify(item.author) !== JSON.stringify(expectedSection.author)
    ) {
      errors.push(`Author in ${item.id} must match the section plan.`);
    }
    if (item.author) {
      const authorKey = item.author.name.trim().toLowerCase();
      if (seenAuthorNames.has(authorKey)) {
        errors.push(
          `${item.author.name} cannot be assigned to more than one article.`,
        );
      }
      seenAuthorNames.add(authorKey);
    }
    if (JSON.stringify(item.links) !== JSON.stringify(expectedSection.links))
      errors.push(`Links in ${item.id} must match the verified fact packet.`);
  }
  for (const expectedSection of expected.sections) {
    if (!seen.has(expectedSection.id))
      errors.push(`Missing required section: ${expectedSection.id}.`);
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
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      errors: ["The response is not valid JSON. Paste only the JSON object."],
    };
  }
  return validateWeeklyEditionContent(value, packet);
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

export function buildWeeklyEditionChatGptPrompt(
  packet: WeeklyEditionFactPacket,
) {
  const template = buildTemplateWeeklyEdition(packet);
  const editorialMatchups = pressBoxMatchups(packet.matchups);
  const previewMatchups = pressBoxNextMatchups(packet.nextMatchups);
  const editorialCandidates = pressBoxEditorialCandidates(packet);
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
  const promptTeamOutlooks = (milestone?.teamOutlooks ?? []).map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    capSpace: team.capSpace,
    committedSalary: team.committedSalary,
    rosterSize: team.rosterSize,
    rosterTalent: team.rosterTalent,
    expiringCount: team.expiringCount,
    firstRoundPickCount: team.firstRoundPickCount,
  }));
  let facts: object;
  switch (packet.issueType) {
    case "weekly":
      facts = {
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        season: packet.season,
        week: packet.week,
        matchups: editorialMatchups,
        editorialCandidates,
        nextMatchups: previewMatchups,
      };
      break;
    case "final_recap":
      facts = {
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        completedSeason: {
          id: packet.season.id,
          name: packet.season.name,
          year: packet.season.year,
          endDate: packet.season.endDate,
        },
        finalWeek: packet.week,
        finalMatchups: editorialMatchups,
        finalStars: packet.stars,
        finalPowerRankings: packet.powerMovers,
        editorialCandidates,
        upcomingSeason: analysisSeason,
        salaryCap: milestone?.salaryCap,
        teamOutlooks: promptTeamOutlooks,
        expiringContracts: milestone?.expiringContracts ?? [],
      };
      break;
    case "resigning_outlook":
      facts = {
        ...milestoneContext,
        teamOutlooks: promptTeamOutlooks,
        expiringContracts: milestone?.expiringContracts ?? [],
      };
      break;
    case "offseason_market":
      facts = {
        ...milestoneContext,
        teamOutlooks: promptTeamOutlooks,
        expiringContracts: milestone?.expiringContracts ?? [],
        recentSignings: milestone?.recentSignings ?? [],
      };
      break;
    case "pre_draft":
      facts = {
        ...milestoneContext,
        teamOutlooks: promptTeamOutlooks,
        earlyDraftBoard: (milestone?.draftPicks ?? []).filter(
          (pick) => pick.round <= 3,
        ),
      };
      break;
    case "preseason":
      facts = {
        ...milestoneContext,
        teamOutlooks: promptTeamOutlooks,
        draftedPlayers: (milestone?.draftPicks ?? []).filter(
          (pick) => pick.selectedPlayerName,
        ),
      };
      break;
  }
  const sectionPlan = template.sections.map((section) => ({
    id: section.id,
    kind: section.kind,
    eyebrow: section.eyebrow,
    author: section.author,
    links: section.links,
  }));
  return [
    "PROMPT_FORMAT=editorial_context_v4",
    "You are the editor of the GSHL Press Box, a fantasy-hockey league newspaper covering the Gem Stone Hockey League.",
    "Write a polished edition with the confidence, rhythm and specificity of a modern hockey feature desk. It should feel authored, not assembled: vary sentence length, avoid generic recap language and stat-listing, and give every article a distinct reason to exist.",
    "Create original storylines from the supplied facts by finding tension, contrast, momentum, pressure, irony and plausible stakes. Add small recurring quirks, callbacks, colorful metaphors, playful labels for situations and subtle chirps so the edition develops its own personality.",
    "Creative framing may be invented; factual claims may not. Do not invent events, quotes, relationships, motives, injuries, rules, player or team names, scores, statistics, transactions or historical claims. A joke or narrative flourish must remain clearly rhetorical and must not masquerade as a new fact.",
    `NEWSROOM STAFF: ${WEEKLY_EDITION_STAFF.editorInChief.name}, Editor-in-Chief, writes only rarely about league process or rule changes; ${WEEKLY_EDITION_STAFF.headOfAnalytics.name}, Head of Analytics, handles only the biggest and less frequent performance, record, and data-led lead stories; ${WEEKLY_EDITION_STAFF.analyticsReporter.name}, Analytics Reporter, handles the regular standout daily and weekly performance coverage; ${WEEKLY_EDITION_STAFF.headInsider.name}, GSHL Head Insider, handles only the biggest and less frequent signings, trades, and roster moves; ${WEEKLY_EDITION_STAFF.insider.name}, GSHL Insider, handles the regular transaction wire.`,
    "Every section has an assigned author in SECTION_PLAN. Preserve that author object exactly. When scope is team, write with a very light preference for that team and give its perspective slightly more attention without becoming a fan blog, attacking opponents, or changing the facts. Conference reporters may frame a story through their conference, but remain fair.",
    "Every article must have a different reporter. Never reuse a byline within the same edition; the six unique assignments in SECTION_PLAN are final.",
    "EDITION_FACTS may contain ranked story candidates from matchups, performances, records, milestones, awards, and league activity. Use editorial judgment to choose the most important lead and supporting angles; importance is guidance, not a command.",
    "LEAGUE CONTRACT RULES: An expiring UFA cannot be re-signed by the current team and cannot be signed by any team during the summer. Every expired UFA automatically returns to the draft. An expiring RFA may be re-signed by the current team at exactly 115% of the prior salary. Never describe an expired UFA as a summer signing target or imply that cap space can be used to sign one directly.",
    ...(packet.issueType === "weekly"
      ? []
      : [
          "DRAFT CONTEXT: Every team always has exactly 15 draft picks. That equal allotment is routine infrastructure, not a storyline, advantage, disadvantage or measure of draft capital. Never compare teams by total pick count. Focus draft coverage on selection order, early-round position, roster need, player fit and the decisions created by the board.",
        ]),
    "MATCHUP PRIORITY RULES: QF means quarterfinal, SF means semifinal, F means final, and LT means Loser Tournament. Playoff games are always major stories, ordered F, then SF, then QF. Loser Tournament games should not be a headline, lead, primary article, or meaningful supporting focus; they have been omitted from the supplied matchup facts.",
    "Use only the names, numbers, outcomes, and links in EDITION_FACTS. Do not add HTML, Markdown links, new sections, new IDs, or new URLs.",
    "Return only one JSON object. It must contain headline, deck, and exactly six sections. Each section must contain id, kind, eyebrow, headline, body, author, and links.",
    "Keep every section id, kind, eyebrow, author, and links value from SECTION_PLAN exactly unchanged and in the same order.",
    "Limits: headline 110 characters; deck 220; section headline 90; section body 1000; eyebrow 50.",
    "",
    `EDITION_FACTS=${JSON.stringify(facts, null, 2)}`,
    "",
    `SECTION_PLAN=${JSON.stringify(sectionPlan, null, 2)}`,
  ].join("\n");
}
