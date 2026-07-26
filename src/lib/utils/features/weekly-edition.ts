import { z } from "zod";
import type {
  BuildWeeklyEditionFactPacketInput,
  BuildWeeklyEditionCategoryMarginsInput,
  BuildMilestoneEditionFactPacketInput,
  WeeklyEditionContractCoverageSource,
  WeeklyEditionContractSeasonSource,
  WeeklyEditionContent,
  WeeklyEditionEditorialCandidate,
  WeeklyEditionEditorialMetric,
  WeeklyEditionFactPacket,
  WeeklyEditionAchievementSnapshot,
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
const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    kind: sectionKindSchema,
    eyebrow: z.string().trim().min(1).max(40),
    headline: z.string().trim().min(1).max(110),
    body: z.string().trim().min(1).max(900),
    links: z.array(linkSchema).max(4),
  })
  .strict();
const contentSchema = z
  .object({
    headline: z.string().trim().min(1).max(110),
    deck: z.string().trim().min(1).max(240),
    sections: z.array(sectionSchema).min(5).max(7),
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
  return [...matchups].sort((left, right) => {
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
  for (const matchup of matchups) {
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
      headlineHint: matchup.winnerTeamName
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
  if (!hero) throw new Error("A completed matchup is required");

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
    heroMatchupId: hero.matchupId,
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

function matchupSummary(matchup: WeeklyEditionMatchupFact) {
  const categoryNote = matchup.categoryMargins.find(
    (category) => category.winnerTeamName === matchup.winnerTeamName,
  );
  const categorySentence = categoryNote
    ? ` ${categoryNote.winnerTeamName} created its widest category edge in ${categoryNote.category}, ${categoryNote.homeValue}–${categoryNote.awayValue}.`
    : "";
  if (!matchup.winnerTeamName) {
    return `${matchup.homeTeamName} and ${matchup.awayTeamName} finished level at ${matchup.homeScore}–${matchup.awayScore}.`;
  }
  return `${matchup.winnerTeamName} beat ${matchup.loserTeamName} ${Math.max(matchup.homeScore, matchup.awayScore)}–${Math.min(matchup.homeScore, matchup.awayScore)}.${categorySentence}`;
}

function section(
  kind: WeeklyEditionSectionKind,
  eyebrow: string,
  headline: string,
  body: string,
  links: WeeklyEditionSection["links"],
): WeeklyEditionSection {
  return { id: kind, kind, eyebrow, headline, body, links };
}

export function buildTemplateWeeklyEdition(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  if (packet.issueType !== "weekly") {
    return buildMilestoneTemplateEdition(packet);
  }
  const hero =
    packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    ) ?? packet.matchups[0]!;
  const upsetHeadline =
    hero.rankUpset > 0 && hero.winnerTeamName
      ? choose(
          packet,
          [
            `${hero.winnerTeamName} flips the script`,
            `${hero.winnerTeamName} delivers the week’s shock`,
            `Rankings meet reality: ${hero.winnerTeamName} wins`,
          ],
          "lead",
        )
      : choose(
          packet,
          [
            `${hero.homeTeamName} and ${hero.awayTeamName} own the spotlight`,
            `A week decided at the margins`,
            `${hero.winnerTeamName ?? hero.homeTeamName} headlines Week ${packet.week.number}`,
          ],
          "lead",
        );
  const leadCandidate = packet.editorialCandidates?.[0];
  const leadIsMatchup = leadCandidate?.kind === "matchup";
  const leadHeadline = leadCandidate?.headlineHint ?? upsetHeadline;
  const deckText =
    leadCandidate && !leadIsMatchup
      ? `${leadCandidate.summary} It leads a Week ${packet.week.number} edition built from ${packet.editorialCandidates?.length ?? 0} verified story candidates.`
      : `${scoreline(hero)} led a Week ${packet.week.number} slate with ${packet.matchups.length} completed matchup${packet.matchups.length === 1 ? "" : "s"}.`;
  const deck =
    deckText.length <= 240 ? deckText : `${deckText.slice(0, 237).trim()}…`;
  const sections: WeeklyEditionSection[] = [
    section(
      "biggest_story",
      "Biggest Story",
      leadHeadline,
      leadCandidate && !leadIsMatchup
        ? leadCandidate.summary
        : `${matchupSummary(hero)} ${
            hero.rankUpset > 0
              ? `The winner entered ${hero.rankUpset} ranking spot${hero.rankUpset === 1 ? "" : "s"} behind the opposition, which is exactly why the standings never get the final word.`
              : "It was the week’s most competitive result, and neither side left much room for a comfortable Sunday night."
          }`,
      leadCandidate?.links ?? [
        { label: "Open matchup", href: `/matchup/${hero.matchupId}` },
      ],
    ),
    section(
      "matchup_roundup",
      "Matchup Roundup",
      choose(
        packet,
        ["Around the league", "The rest of the scores", "How the week was won"],
        "roundup",
      ),
      packet.matchups.map(matchupSummary).join(" "),
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
      packet.nextMatchups.length > 0
        ? `${packet.nextMatchups[0]!.awayTeamName} meets ${packet.nextMatchups[0]!.homeTeamName}`
        : "The next puck drop awaits",
      packet.nextMatchups.length > 0
        ? packet.nextMatchups
            .map(
              (matchup) =>
                `${matchup.awayTeamName} at ${matchup.homeTeamName}${matchup.awayRank && matchup.homeRank ? ` pairs No. ${matchup.awayRank} with No. ${matchup.homeRank}` : ""}.`,
            )
            .join(" ")
        : "The next slate has not been posted yet. Check the schedule when the matchups lock in.",
      [{ label: "See next week", href: "/schedule" }],
    ),
  );

  return { headline: leadHeadline, deck, sections };
}

function money(value: number) {
  return `$${(value / 1_000_000).toFixed(1)}M`;
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

function buildMilestoneTemplateEdition(
  packet: WeeklyEditionFactPacket,
): WeeklyEditionContent {
  const facts = packet.milestone;
  if (!facts) throw new Error("Milestone facts are required");
  const topTeam = facts.teamOutlooks[0];
  const capLeader = [...facts.teamOutlooks].sort(
    (left, right) => right.capSpace - left.capSpace,
  )[0];
  const draftLeader = [...facts.teamOutlooks].sort(
    (left, right) =>
      right.draftPickCount - left.draftPickCount ||
      right.firstRoundPickCount - left.firstRoundPickCount,
  )[0];
  const expiring = facts.expiringContracts.slice(0, 8);
  const signings = facts.recentSignings.slice(0, 8);
  const standingsLink = [{ label: "View standings", href: "/standings" }];

  if (packet.issueType === "final_recap") {
    const hero = packet.matchups.find(
      (matchup) => matchup.matchupId === packet.heroMatchupId,
    );
    const leadCandidate = packet.editorialCandidates?.[0];
    const headline =
      leadCandidate && leadCandidate.kind !== "matchup"
        ? leadCandidate.headlineHint
        : hero?.winnerTeamName
          ? `${hero.winnerTeamName} puts the final stamp on ${packet.season.name}`
          : `${packet.season.name}: the final word`;
    return {
      headline,
      deck: `The season is complete. GSHL Weekly looks back at the final results, standout players and the pecking order the league carries into the offseason.`,
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
                `${contract.teamName} has ${contract.playerName} (${money(contract.salary)}, ${contract.expiryStatus}) approaching expiry.`,
            )
            .join(" ") || "No expiring contracts were found.",
          [],
        ),
        section(
          "next_week",
          "Next Edition",
          "The re-signing questions are coming",
          "GSHL Weekly returns one week after the final with a team-by-team look at expiring contracts, cap room and the decisions that will define the summer.",
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
                `${contract.teamName}: ${contract.playerName}, ${money(contract.salary)}, ${contract.expiryStatus}.`,
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
          "Today’s unsigned questions become tomorrow’s UFA board",
          "Teams with both cap room and roster openings can be aggressive. Teams near the ceiling will need their pencils—and perhaps their group chats—working overtime.",
          [],
        ),
        section(
          "next_week",
          "Dates to Know",
          `The signing window closes ${facts.analysisSeasonSigningEndDate ?? facts.triggerDate}`,
          "When the deadline arrives, the newspaper will reset the market and identify which teams can make the loudest UFA moves.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "offseason_market") {
    return {
      headline: capLeader
        ? `${capLeader.teamName} enters UFA season with room to swing`
        : "The offseason market is open",
      deck: `The signing deadline has passed. Cap space, completed deals and open roster spots now tell us which teams can shape the ${facts.analysisSeasonName} UFA market.`,
      sections: [
        section(
          "ufa_market",
          "UFA Market",
          "The teams with money to spend",
          [...facts.teamOutlooks]
            .sort((left, right) => right.capSpace - left.capSpace)
            .map(
              (team) =>
                `${team.teamName}: ${money(team.capSpace)} available and ${team.rosterSize} players currently rostered.`,
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
          "One week before draft night, GSHL Weekly will count the picks, identify the teams with leverage and map the biggest roster needs.",
          [],
        ),
      ],
    };
  }

  if (packet.issueType === "pre_draft") {
    return {
      headline: draftLeader
        ? `${draftLeader.teamName} brings the biggest stack to draft night`
        : "The GSHL draft board is set",
      deck: `${facts.draftPicks.length} picks are on the ${facts.analysisSeasonName} board. We break down draft capital, first-round leverage and the roster needs each team can attack.`,
      sections: [
        section(
          "draft_capital",
          "Draft Capital",
          draftLeader
            ? `${draftLeader.teamName} controls the board`
            : "Who controls the board?",
          [...facts.teamOutlooks]
            .sort(
              (left, right) =>
                right.draftPickCount - left.draftPickCount ||
                right.firstRoundPickCount - left.firstRoundPickCount,
            )
            .map(
              (team) =>
                `${team.teamName}: ${team.draftPickCount} picks, including ${team.firstRoundPickCount} in Round 1.`,
            )
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
          "Draft capital creates options",
          "Teams with extra selections can move around the board; teams with thinner pick totals may need to choose certainty over volume.",
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
  const content = parsed.data;
  const text = allText(content);
  if (/<\/?[a-z][^>]*>/i.test(text))
    errors.push("HTML is not allowed in edition copy.");

  const expected = buildTemplateWeeklyEdition(packet);
  const expectedById = new Map(
    expected.sections.map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
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

export function buildWeeklyEditionChatGptPrompt(
  packet: WeeklyEditionFactPacket,
) {
  const template = buildTemplateWeeklyEdition(packet);
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
  let facts: object;
  switch (packet.issueType) {
    case "weekly":
      facts = {
        issueType: packet.issueType,
        issueLabel: packet.issueLabel,
        season: packet.season,
        week: packet.week,
        matchups: packet.matchups,
        editorialCandidates: packet.editorialCandidates ?? [],
        nextMatchups: packet.nextMatchups,
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
        finalMatchups: packet.matchups,
        finalStars: packet.stars,
        finalPowerRankings: packet.powerMovers,
        editorialCandidates: packet.editorialCandidates ?? [],
        upcomingSeason: analysisSeason,
        salaryCap: milestone?.salaryCap,
        teamOutlooks: milestone?.teamOutlooks ?? [],
        expiringContracts: milestone?.expiringContracts ?? [],
      };
      break;
    case "resigning_outlook":
      facts = {
        ...milestoneContext,
        teamOutlooks: milestone?.teamOutlooks ?? [],
        expiringContracts: milestone?.expiringContracts ?? [],
      };
      break;
    case "offseason_market":
      facts = {
        ...milestoneContext,
        teamOutlooks: milestone?.teamOutlooks ?? [],
        expiringContracts: milestone?.expiringContracts ?? [],
        recentSignings: milestone?.recentSignings ?? [],
      };
      break;
    case "pre_draft":
      facts = {
        ...milestoneContext,
        teamOutlooks: milestone?.teamOutlooks ?? [],
        draftPicks: milestone?.draftPicks ?? [],
      };
      break;
    case "preseason":
      facts = {
        ...milestoneContext,
        teamOutlooks: milestone?.teamOutlooks ?? [],
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
    links: section.links,
  }));
  return [
    "You are the editor of GSHL Weekly, a friendly fantasy-hockey league newspaper.",
    "Rewrite the supplied edition with energetic, concise sportswriting and gentle chirps. Never insult a person, speculate about motives, or add facts.",
    "EDITION_FACTS may contain ranked story candidates from matchups, performances, records, milestones, awards, and league activity. Use editorial judgment to choose the most important lead and supporting angles; importance is guidance, not a command.",
    "Use only the names, numbers, outcomes, and links in EDITION_FACTS. Do not add HTML, Markdown links, new sections, new IDs, or new URLs.",
    "Return only one JSON object. It must contain headline, deck, and sections. Each section must contain id, kind, eyebrow, headline, body, and links.",
    "Keep every section id, kind, eyebrow, and links value from SECTION_PLAN exactly unchanged and in the same order.",
    "Limits: headline 110 characters; deck 240; section headline 110; section body 900; eyebrow 40.",
    "",
    `EDITION_FACTS=${JSON.stringify(facts, null, 2)}`,
    "",
    `SECTION_PLAN=${JSON.stringify(sectionPlan, null, 2)}`,
  ].join("\n");
}
