/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-optional-chain */
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCommissioner } from "./lib/auth";
import { buildLeagueActivity } from "../src/lib/utils/features/league-activity";
import { buildOwnerRankings } from "../src/lib/utils/features/owner-rankings";
import { calculateDraftRosterTalentRating } from "../src/lib/utils/features/draft-roster-board";
import type {
  AwardsList,
  ContractStatus,
  MatchupType,
  SeasonType,
  WeeklyEditionArticleCount,
  WeeklyEdition,
  WeeklyEditionContent,
  WeeklyEditionFactPacket,
  WeeklyEditionIssueType,
} from "../src/lib/types";
import { ContractStatus as ContractStatusValues } from "../src/lib/utils/domain/constants";
import {
  buildWeeklyEditionCareerRecordFacts,
  buildWeeklyEditionArchiveSummary,
  buildMilestoneEditionFactPacket,
  buildTemplateWeeklyEdition,
  buildWeeklyEditionHomeSummary,
  buildWeeklyEditionMilestoneFacts,
  buildWeeklyEditionMilestoneSchedule,
  buildWeeklyEditionCategoryMargins,
  buildWeeklyEditionChatGptPrompt,
  buildWeeklyEditionStoryScoutPrompt,
  buildWeeklyEditionFactPacket,
  buildWeeklyEditionNewsroomSummary,
  buildWeeklyEditionReaderDetail,
  buildWeeklyEditionRevisionSummary,
  buildWeeklyEditionPeriodRecordFacts,
  hashWeeklyEditionSource,
  isWeeklyEditionPlayingContract,
  isWeeklyEditionSummerUfaPoolAvailable,
  selectWeeklyEditionStoryAssignments,
  validateWeeklyEditionContent,
  validateWeeklyEditionStoryAssignments,
  validateWeeklyEditionImport,
  weeklyEditionContractAffectsSeason,
} from "../src/lib/utils/features/weekly-edition";
import {
  buildWeeklyEditionOpenAiRequest,
  buildWeeklyEditionPitchOpenAiRequest,
  extractWeeklyEditionOpenAiText,
  parseWeeklyEditionStorySubmissions,
} from "../src/lib/utils/features/weekly-edition-openai";
import { DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT } from "../src/lib/utils/features/weekly-edition-articles";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";

type EditionRow = Doc<"weeklyEditions">;
type GenerationOptions = {
  editedBy?: Id<"authUsers">;
  refreshSource?: boolean;
  replaceEditorial?: boolean;
};

const PUBLIC_TIMESTAMP_FIELDS = [
  "startDate",
  "endDate",
  "publishedAt",
  "scheduledFor",
  "createdAt",
  "updatedAt",
] as const;
const weeklyEditionIssueTypeValidator = v.union(
  v.literal("weekly"),
  v.literal("final_recap"),
  v.literal("resigning_outlook"),
  v.literal("offseason_market"),
  v.literal("pre_draft"),
  v.literal("preseason"),
);
const weeklyEditionArticleCountValidator = v.union(
  v.literal(6),
  v.literal(7),
  v.literal(8),
  v.literal(9),
  v.literal(10),
);
const DEFAULT_NEWSROOM_MODEL = "gpt-5-mini";

function newsroomModel() {
  const configured = process.env.OPENAI_NEWSROOM_MODEL?.trim();
  return configured?.length ? configured : DEFAULT_NEWSROOM_MODEL;
}

function openAiErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message.trim().slice(0, 300) : "";
}

async function requestNewsroomJson({
  apiKey,
  request,
  failureLabel,
}: {
  apiKey: string;
  request: object;
  failureLabel: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = openAiErrorMessage(payload);
    throw new Error(
      `OpenAI could not ${failureLabel} (${response.status})${
        detail ? `: ${detail}` : ""
      }`,
    );
  }
  return extractWeeklyEditionOpenAiText(payload);
}
type PublicTimestampField = (typeof PUBLIC_TIMESTAMP_FIELDS)[number];
type PublicRow<Row extends { _id: string }> = Omit<
  Row,
  "_id" | "_creationTime" | PublicTimestampField
> & {
  id: string;
} & Record<Extract<keyof Row, PublicTimestampField>, number>;

const isoTimestamp = (value: unknown) => {
  const timestamp = toUtcTimestamp(value);
  return timestamp === null ? "" : new Date(timestamp).toISOString();
};
const dateKey = (value: unknown) => utcTimestampToDateKey(value) ?? "";
const requiredPublicTimestamp = (
  field: PublicTimestampField,
  value: unknown,
) => {
  const timestamp = toUtcTimestamp(value);
  if (timestamp === null) {
    throw new Error(`Weekly edition ${field} is not a valid UTC timestamp`);
  }
  return timestamp;
};
const publicRow = <Row extends { _id: string }>(
  row: Row | null,
): PublicRow<Row> | null => {
  if (!row) return null;
  const output: Record<string, unknown> = { ...row, id: row._id };
  delete output._id;
  delete output._creationTime;
  for (const field of PUBLIC_TIMESTAMP_FIELDS) {
    if (!(field in output)) continue;
    output[field] = requiredPublicTimestamp(field, output[field]);
  }
  return output as PublicRow<Row>;
};
const publicReaderRow = (row: EditionRow | null) => {
  if (!row) return null;
  return buildWeeklyEditionReaderDetail({
    issueType: row.issueType,
    issueLabel: row.issueLabel,
    seasonName: row.seasonName,
    startDate: requiredPublicTimestamp("startDate", row.startDate),
    endDate: requiredPublicTimestamp("endDate", row.endDate),
    scheduledFor: requiredPublicTimestamp("scheduledFor", row.scheduledFor),
    content: row.content as WeeklyEditionContent,
    facts: row.facts as WeeklyEditionFactPacket,
    inactiveSectionIds: row.inactiveSectionIds,
  });
};
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const EDITORIAL_STAT_KEYS = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "SV",
  "SO",
  "Rating",
] as const;
const EDITORIAL_RECORD_LABELS = Object.fromEntries(
  EDITORIAL_STAT_KEYS.map((key) => [key, key === "Rating" ? "Rating" : key]),
);
const EDITORIAL_CAREER_RECORD_LABELS = Object.fromEntries(
  Object.entries(EDITORIAL_RECORD_LABELS).filter(([key]) => key !== "Rating"),
);
const editorialMetrics = (row: Record<string, unknown>) =>
  Object.fromEntries(
    EDITORIAL_STAT_KEYS.map((key) => [key, asNumber(row[key])]),
  );
const contractStatuses = new Set<unknown>(Object.values(ContractStatusValues));
const isContractStatus = (value: unknown): value is ContractStatus =>
  contractStatuses.has(value);

async function saveRevision(
  ctx: MutationCtx,
  edition: EditionRow,
  editedBy?: Id<"authUsers">,
) {
  await ctx.db.insert("weeklyEditionRevisions", {
    editionId: edition._id,
    generationMode: edition.generationMode,
    content: edition.content,
    sourceHash: edition.sourceHash,
    createdAt: Date.now(),
    editedBy,
  });
}

async function buildSource(
  ctx: MutationCtx,
  season: Doc<"seasons">,
  week: Doc<"weeks">,
) {
  const [
    teams,
    franchises,
    conferences,
    matchups,
    playerWeekRows,
    currentPower,
    weeks,
  ] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db.query("franchises").collect(),
    ctx.db.query("conferences").collect(),
    ctx.db
      .query("matchups")
      .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
      .collect(),
    ctx.db
      .query("playerWeekStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
      .collect(),
    ctx.db
      .query("teamWeekStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
      .collect(),
    ctx.db
      .query("weeks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
  ]);

  if (matchups.length === 0 || matchups.some((item) => !item.isComplete)) {
    throw new Error("The week still has incomplete matchups");
  }
  if (playerWeekRows.length === 0 || currentPower.length < teams.length) {
    throw new Error("Required weekly statistics are not available yet");
  }

  const orderedWeeks = [...weeks].sort(
    (left, right) => asNumber(left.weekNum) - asNumber(right.weekNum),
  );
  const weekIndex = orderedWeeks.findIndex((item) => item._id === week._id);
  const previousWeek = weekIndex > 0 ? orderedWeeks[weekIndex - 1] : null;
  const nextWeek =
    weekIndex >= 0 && weekIndex + 1 < orderedWeeks.length
      ? orderedWeeks[weekIndex + 1]
      : null;
  const [
    previousPower,
    nextMatchups,
    playerDays,
    teamDays,
    contracts,
    players,
    playerAwards,
    teamAwards,
    playerTotals,
    teamSeasonRowsForSeason,
  ] = await Promise.all([
    previousWeek
      ? ctx.db
          .query("teamWeekStatLines")
          .withIndex("by_weekId", (q) => q.eq("weekId", previousWeek._id))
          .collect()
      : [],
    nextWeek
      ? ctx.db
          .query("matchups")
          .withIndex("by_weekId", (q) => q.eq("weekId", nextWeek._id))
          .collect()
      : [],
    ctx.db
      .query("playerDayStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
      .collect(),
    ctx.db
      .query("teamDayStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
      .collect(),
    ctx.db
      .query("contracts")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db.query("players").collect(),
    ctx.db
      .query("playerAwards")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db
      .query("teamAwards")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db
      .query("playerTotalStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db
      .query("teamSeasonStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
  ]);

  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise._id), franchise]),
  );
  const conferenceById = new Map(
    conferences.map((conference) => [String(conference._id), conference]),
  );
  const teamById = new Map(
    teams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      const conference = conferenceById.get(String(team.confId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
          conferenceId: String(team.confId),
          conferenceName: conference?.name,
          conferenceLogoUrl: conference?.logoUrl ?? undefined,
          beatWriter: franchise?.beatWriter ?? undefined,
          leadReporter: conference?.leadReporter ?? undefined,
        },
      ];
    }),
  );
  const currentTeamContextById = new Map(
    teams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          franchiseId: String(team.franchiseId),
          franchiseName: franchise?.name ?? "Unknown team",
          ownerId: String(franchise?.ownerId ?? ""),
        },
      ];
    }),
  );
  const currentTeamByOwnerId = new Map(
    [...currentTeamContextById.values()].map((team) => {
      return [
        team.ownerId,
        {
          teamId: team.teamId,
          name: team.name,
          franchiseId: team.franchiseId,
        },
      ];
    }),
  );
  // Historical records are materialized separately. Interactive generation
  // must stay on indexed current-week/current-season reads to remain below
  // Convex's one-second mutation limit.
  const allTeamById = currentTeamContextById;
  const allTeamWeeks = currentPower;
  const teamSeasonRows = teamSeasonRowsForSeason;
  const careerTotals: typeof playerTotals = [];
  const allMatchups: typeof matchups = [];
  const playerById = new Map(
    players.map((player) => [String(player._id), player]),
  );
  const teamTalentById = new Map(
    [...currentTeamContextById.values()].map((team) => [
      team.teamId,
      calculateDraftRosterTalentRating(
        players.filter(
          (player) =>
            String(player.ownerId ?? "") === team.ownerId && player.isActive,
        ),
      ),
    ]),
  );
  const previousByTeam = new Map(
    previousPower.map((row) => [String(row.gshlTeamId), row]),
  );
  const currentPowerByTeam = new Map(
    currentPower.map((row) => [String(row.gshlTeamId), row]),
  );
  const activityRows = buildLeagueActivity({
    contracts: contracts.flatMap((row) =>
      isContractStatus(row.signingStatus)
        ? [
            {
              id: String(row._id),
              playerId: String(row.playerId),
              ownerId: String(row.ownerId),
              seasonId: String(row.seasonId),
              signingDate: dateKey(row.signingDate),
              signingStatus: row.signingStatus,
              contractLength: asNumber(row.contractLength),
              contractSalary: asNumber(row.contractSalary),
            },
          ]
        : [],
    ),
    playerDays: playerDays.map((row) => ({
      id: String(row._id),
      playerId: String(row.playerId),
      gshlTeamId: String(row.gshlTeamId),
      date: String(row.date ?? ""),
      ADD: String(row.ADD ?? ""),
      MS: String(row.MS ?? ""),
    })),
    players: players.map((row) => ({ ...row, id: String(row._id) })),
    teams: teams.map((row) => ({ ...row, id: String(row._id) })),
    franchises: franchises.map((row) => ({
      ...row,
      id: String(row._id),
      logoUrl: row.logoUrl ?? "",
    })),
    limit: 100,
  }).filter(
    (event) =>
      (toUtcTimestamp(event.date) ?? -Infinity) >=
        (toUtcTimestamp(week.startDate) ?? Infinity) &&
      (toUtcTimestamp(event.date) ?? Infinity) <=
        (toUtcTimestamp(week.endDate) ?? -Infinity),
  );
  const activity = activityRows.flatMap((event) =>
    event.type === "missed_start"
      ? []
      : [
          {
            id: event.id,
            kind: event.type,
            date: event.date,
            playerName: event.playerName,
            teamName: event.teamName,
            detail:
              (event.type === "signing" || event.type === "trade") &&
              event.signingStatus
                ? event.signingStatus
                : undefined,
          },
        ],
  );
  const missedStartGroups = new Map();
  activityRows
    .filter((event) => event.type === "missed_start")
    .forEach((event) => {
      const key = `${event.playerId}:${event.teamId ?? "none"}`;
      const existing = missedStartGroups.get(key);
      missedStartGroups.set(key, {
        id: existing?.id ?? event.id,
        date:
          existing?.date && existing.date > event.date
            ? existing.date
            : event.date,
        playerName: event.playerName,
        teamName: event.teamName,
        count: (existing?.count ?? 0) + 1,
      });
    });
  const missedStarts = [...missedStartGroups.values()];
  const performanceStats = (row: Record<string, unknown>) =>
    Object.fromEntries(
      EDITORIAL_STAT_KEYS.filter((key) => key !== "Rating").map((key) => [
        key,
        asNumber(row[key]),
      ]),
    );
  const selectStandouts = <
    Row extends {
      id: string;
      rating: number;
    },
  >(
    rows: Row[],
  ) =>
    rows
      .filter((row) => row.rating > 0)
      .sort(
        (left, right) =>
          right.rating - left.rating || left.id.localeCompare(right.id),
      )
      .filter((row, index) => row.rating >= 85 || index < 3);
  const playerWeekPerformances = selectStandouts(
    playerWeekRows.map((row) => ({
      id: `player-week:${String(row._id)}`,
      entityType: "player" as const,
      scope: "week" as const,
      playerId: String(row.playerId),
      playerName:
        playerById.get(String(row.playerId))?.fullName ?? "Unknown player",
      teamId: String(row.gshlTeamId),
      teamName: teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
      rating: asNumber(row.Rating),
      stats: performanceStats(row),
    })),
  );
  const playerDayPerformances = selectStandouts(
    playerDays.map((row) => ({
      id: `player-day:${String(row._id)}`,
      entityType: "player" as const,
      scope: "day" as const,
      occurredAt: dateKey(row.date),
      playerId: String(row.playerId),
      playerName:
        playerById.get(String(row.playerId))?.fullName ?? "Unknown player",
      teamId: String(row.gshlTeamId),
      teamName: teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
      rating: asNumber(row.Rating),
      stats: performanceStats(row),
    })),
  );
  const teamWeekPerformances = selectStandouts(
    currentPower.map((row) => ({
      id: `team-week:${String(row._id)}`,
      entityType: "team" as const,
      scope: "week" as const,
      teamId: String(row.gshlTeamId),
      teamName: teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
      rating: asNumber(row.Rating),
      stats: performanceStats(row),
    })),
  );
  const teamDayPerformances = selectStandouts(
    teamDays.map((row) => ({
      id: `team-day:${String(row._id)}`,
      entityType: "team" as const,
      scope: "day" as const,
      occurredAt: dateKey(row.date),
      teamId: String(row.gshlTeamId),
      teamName: teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
      rating: asNumber(row.Rating),
      stats: performanceStats(row),
    })),
  );
  const isFinalWeek =
    orderedWeeks.at(-1)?._id === week._id ||
    dateKey(week.endDate) === dateKey(season.endDate);
  const currentPlayerTotals = playerTotals.filter(
    (row) => row.seasonId === season._id && String(row.seasonType) === "RS",
  );
  const currentTeamSeasonRows = teamSeasonRows.filter(
    (row) => row.seasonId === season._id && String(row.seasonType) === "RS",
  );
  const seasonPerformances = isFinalWeek
    ? [
        ...selectStandouts(
          currentPlayerTotals.map((row) => {
            const teamId = String(row.gshlTeamIds?.[0] ?? "");
            return {
              id: `player-season:${String(row._id)}`,
              entityType: "player" as const,
              scope: "season" as const,
              playerId: String(row.playerId),
              playerName:
                playerById.get(String(row.playerId))?.fullName ??
                "Unknown player",
              teamId,
              teamName: teamById.get(teamId)?.name ?? "Unknown team",
              rating: asNumber(row.Rating),
              stats: performanceStats(row),
            };
          }),
        ),
        ...selectStandouts(
          currentTeamSeasonRows.map((row) => ({
            id: `team-season:${String(row._id)}`,
            entityType: "team" as const,
            scope: "season" as const,
            teamId: String(row.gshlTeamId),
            teamName:
              teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
            rating: asNumber(row.Rating),
            stats: performanceStats(row),
          })),
        ),
      ]
    : [];

  const teamWeekCurrentObservations = currentPower.map((row) => {
    const team = allTeamById.get(String(row.gshlTeamId));
    return {
      id: String(row._id),
      entityType: "team" as const,
      period: "week" as const,
      periodId: String(row.weekId),
      teamId: String(row.gshlTeamId),
      teamName: team?.name ?? "Unknown team",
      franchiseId: team?.franchiseId,
      franchiseName: team?.franchiseName,
      metrics: editorialMetrics(row),
    };
  });
  const teamWeekHistoricalObservations = allTeamWeeks
    .filter((row) => row.weekId !== week._id)
    .map((row) => {
      const team = allTeamById.get(String(row.gshlTeamId));
      return {
        id: String(row._id),
        entityType: "team" as const,
        period: "week" as const,
        periodId: String(row.weekId),
        teamId: String(row.gshlTeamId),
        teamName: team?.name ?? "Unknown team",
        franchiseId: team?.franchiseId,
        franchiseName: team?.franchiseName,
        metrics: editorialMetrics(row),
      };
    });
  const teamWeekRecords = buildWeeklyEditionPeriodRecordFacts({
    current: teamWeekCurrentObservations,
    historical: teamWeekHistoricalObservations,
    metricLabels: EDITORIAL_RECORD_LABELS,
  });

  const playerSeasonRecords = buildWeeklyEditionPeriodRecordFacts({
    current: currentPlayerTotals.map((row) => {
      const teamId = String(row.gshlTeamIds?.[0] ?? "");
      const team = allTeamById.get(teamId);
      const delta = playerWeekRows.find(
        (weekRow) => weekRow.playerId === row.playerId,
      );
      return {
        id: String(row._id),
        entityType: "player" as const,
        period: "season" as const,
        periodId: String(row.seasonId),
        playerId: String(row.playerId),
        playerName:
          playerById.get(String(row.playerId))?.fullName ?? "Unknown player",
        teamId,
        teamName: team?.name,
        franchiseId: team?.franchiseId,
        franchiseName: team?.franchiseName,
        metrics: editorialMetrics(row),
        deltaMetrics: delta ? editorialMetrics(delta) : {},
      };
    }),
    historical: playerTotals
      .filter(
        (row) => row.seasonId !== season._id && String(row.seasonType) === "RS",
      )
      .map((row) => {
        const teamId = String(row.gshlTeamIds?.[0] ?? "");
        const team = allTeamById.get(teamId);
        return {
          id: String(row._id),
          entityType: "player" as const,
          period: "season" as const,
          periodId: String(row.seasonId),
          playerId: String(row.playerId),
          playerName:
            playerById.get(String(row.playerId))?.fullName ?? "Unknown player",
          teamId,
          teamName: team?.name,
          franchiseId: team?.franchiseId,
          franchiseName: team?.franchiseName,
          metrics: editorialMetrics(row),
        };
      }),
    metricLabels: EDITORIAL_RECORD_LABELS,
  });
  const teamSeasonRecords = buildWeeklyEditionPeriodRecordFacts({
    current: currentTeamSeasonRows.map((row) => {
      const team = allTeamById.get(String(row.gshlTeamId));
      const delta = currentPowerByTeam.get(String(row.gshlTeamId));
      return {
        id: String(row._id),
        entityType: "team" as const,
        period: "season" as const,
        periodId: String(row.seasonId),
        teamId: String(row.gshlTeamId),
        teamName: team?.name ?? "Unknown team",
        franchiseId: team?.franchiseId,
        franchiseName: team?.franchiseName,
        metrics: editorialMetrics(row),
        deltaMetrics: delta ? editorialMetrics(delta) : {},
      };
    }),
    historical: teamSeasonRows
      .filter(
        (row) => row.seasonId !== season._id && String(row.seasonType) === "RS",
      )
      .map((row) => {
        const team = allTeamById.get(String(row.gshlTeamId));
        return {
          id: String(row._id),
          entityType: "team" as const,
          period: "season" as const,
          periodId: String(row.seasonId),
          teamId: String(row.gshlTeamId),
          teamName: team?.name ?? "Unknown team",
          franchiseId: team?.franchiseId,
          franchiseName: team?.franchiseName,
          metrics: editorialMetrics(row),
        };
      }),
    metricLabels: EDITORIAL_RECORD_LABELS,
  });

  const careerDeltaByPlayer = new Map<string, Record<string, number>>();
  for (const row of playerWeekRows) {
    const playerId = String(row.playerId);
    const current = careerDeltaByPlayer.get(playerId) ?? {};
    for (const stat of EDITORIAL_STAT_KEYS) {
      current[stat] = (current[stat] ?? 0) + asNumber(row[stat]);
    }
    careerDeltaByPlayer.set(playerId, current);
  }
  const careerRecords = buildWeeklyEditionCareerRecordFacts({
    snapshots: careerTotals.map((row) => {
      const playerId = String(row.playerId);
      return {
        id: `league:${playerId}`,
        entityType: "player" as const,
        period: "career" as const,
        periodId: "career",
        playerId,
        playerName: playerById.get(playerId)?.fullName ?? "Unknown player",
        metrics: editorialMetrics(row),
        deltaMetrics: careerDeltaByPlayer.get(playerId) ?? {},
      };
    }),
    metricLabels: EDITORIAL_CAREER_RECORD_LABELS,
    recordScopes: ["league"],
  });

  const achievementByFranchise = new Map<
    string,
    {
      id: string;
      teamId?: string;
      teamName: string;
      franchiseId: string;
      franchiseName: string;
      metrics: {
        all_time_wins: number;
        conference_wins: number;
        playoff_wins: number;
        playoff_appearances: number;
      };
      deltaMetrics: {
        all_time_wins: number;
        conference_wins: number;
        playoff_wins: number;
        playoff_appearances: number;
      };
    }
  >();
  const ensureAchievement = (franchiseId: string) => {
    const currentTeam = [...teamById.entries()].find(
      ([teamId]) => allTeamById.get(teamId)?.franchiseId === franchiseId,
    );
    const franchise = franchiseById.get(franchiseId);
    const existing = achievementByFranchise.get(franchiseId) ?? {
      id: franchiseId,
      teamId: currentTeam?.[0],
      teamName: currentTeam?.[1].name ?? franchise?.name ?? "Unknown team",
      franchiseId,
      franchiseName: franchise?.name ?? "Unknown team",
      metrics: {
        all_time_wins: 0,
        conference_wins: 0,
        playoff_wins: 0,
        playoff_appearances: 0,
      },
      deltaMetrics: {
        all_time_wins: 0,
        conference_wins: 0,
        playoff_wins: 0,
        playoff_appearances: 0,
      },
    };
    achievementByFranchise.set(franchiseId, existing);
    return existing;
  };
  const playoffAppearances = new Set<string>();
  const currentWeekPlayoffAppearances = new Set<string>();
  for (const matchup of allMatchups.filter((item) => item.isComplete)) {
    const homeTeam = allTeamById.get(String(matchup.homeTeamId));
    const awayTeam = allTeamById.get(String(matchup.awayTeamId));
    if (!homeTeam || !awayTeam) continue;
    const isCurrentWeek = matchup.weekId === week._id;
    const homeScore = asNumber(matchup.homeScore);
    const awayScore = asNumber(matchup.awayScore);
    const winner =
      homeScore === awayScore
        ? undefined
        : homeScore > awayScore
          ? homeTeam
          : awayTeam;
    if (winner && ["CC", "NC"].includes(String(matchup.gameType))) {
      ensureAchievement(winner.franchiseId).metrics.all_time_wins += 1;
      if (isCurrentWeek) {
        ensureAchievement(winner.franchiseId).deltaMetrics.all_time_wins += 1;
      }
    }
    if (winner && String(matchup.gameType) === "CC") {
      ensureAchievement(winner.franchiseId).metrics.conference_wins += 1;
      if (isCurrentWeek) {
        ensureAchievement(winner.franchiseId).deltaMetrics.conference_wins += 1;
      }
    }
    if (winner && ["QF", "SF", "F"].includes(String(matchup.gameType))) {
      ensureAchievement(winner.franchiseId).metrics.playoff_wins += 1;
      if (isCurrentWeek) {
        ensureAchievement(winner.franchiseId).deltaMetrics.playoff_wins += 1;
      }
    }
    if (["QF", "SF", "F"].includes(String(matchup.gameType))) {
      for (const team of [homeTeam, awayTeam]) {
        const key = `${String(matchup.seasonId)}:${team.franchiseId}`;
        playoffAppearances.add(key);
        if (isCurrentWeek) currentWeekPlayoffAppearances.add(key);
      }
    }
  }
  for (const key of playoffAppearances) {
    const [, franchiseId = ""] = key.split(":");
    if (!franchiseId) continue;
    ensureAchievement(franchiseId).metrics.playoff_appearances += 1;
    if (currentWeekPlayoffAppearances.has(key)) {
      const appearedBeforeThisWeek = allMatchups.some((matchup) => {
        if (
          !matchup.isComplete ||
          matchup.weekId === week._id ||
          String(matchup.seasonId) !== key.split(":")[0] ||
          !["QF", "SF", "F"].includes(String(matchup.gameType))
        ) {
          return false;
        }
        return [matchup.homeTeamId, matchup.awayTeamId].some(
          (teamId) =>
            allTeamById.get(String(teamId))?.franchiseId === franchiseId,
        );
      });
      if (!appearedBeforeThisWeek) {
        ensureAchievement(franchiseId).deltaMetrics.playoff_appearances += 1;
      }
    }
  }
  const achievementSnapshots = [...achievementByFranchise.values()];
  const milestones = buildWeeklyEditionMilestoneFacts(achievementSnapshots);
  const achievementRecords = buildWeeklyEditionCareerRecordFacts({
    snapshots: achievementSnapshots.map((snapshot) => ({
      id: snapshot.id,
      entityType: "team" as const,
      period: "career" as const,
      periodId: "career",
      teamId: snapshot.teamId,
      teamName: snapshot.teamName,
      franchiseId: snapshot.franchiseId,
      franchiseName: snapshot.franchiseName,
      metrics: snapshot.metrics,
      deltaMetrics: snapshot.deltaMetrics,
    })),
    metricLabels: {
      all_time_wins: "All-time wins",
      conference_wins: "Conference wins",
      playoff_wins: "Playoff wins",
      playoff_appearances: "Playoff appearances",
    },
    recordScopes: ["league"],
  });

  const awardsAreFinal = dateKey(week.endDate) >= dateKey(season.endDate);
  const awardName = (key: string) =>
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (value) => value.toUpperCase());
  const awardFacts = [
    ...playerAwards.map((award) => ({
      id: String(award._id),
      awardKey: String(award.award),
      awardName: awardName(String(award.award)),
      status: awardsAreFinal ? ("won" as const) : ("race" as const),
      leaderId: String(award.playerId),
      leaderName:
        playerById.get(String(award.playerId))?.fullName ?? "Unknown player",
      leaderType: "player" as const,
      nomineeNames: (award.nomineeIds ?? []).map(
        (id) => playerById.get(String(id))?.fullName ?? "Unknown player",
      ),
    })),
    ...teamAwards.flatMap((award) => {
      const leader =
        (award.ownerId
          ? currentTeamByOwnerId.get(String(award.ownerId))
          : undefined) ??
        (award.teamId ? teamById.get(String(award.teamId)) : undefined);
      if (!leader) return [];
      return [
        {
          id: String(award._id),
          awardKey: String(award.award),
          awardName: awardName(String(award.award)),
          status: awardsAreFinal ? ("won" as const) : ("race" as const),
          leaderId: leader.teamId,
          leaderName: leader.name,
          leaderType: "team" as const,
          nomineeNames: (award.nomineeIds ?? []).flatMap((id) => {
            const nominee =
              currentTeamByOwnerId.get(String(id)) ?? teamById.get(String(id));
            return nominee ? [nominee.name] : [];
          }),
        },
      ];
    }),
  ];

  return buildWeeklyEditionFactPacket({
    season: {
      id: String(season._id),
      name: season.name,
      year: String(season.year),
      endDate: dateKey(season.endDate),
      signingEndDate: dateKey(season.signingEndDate),
      draftStartAt: isoTimestamp(season.draftStartAt),
    },
    week: {
      id: String(week._id),
      number: asNumber(week.weekNum),
      startDate: dateKey(week.startDate),
      endDate: dateKey(week.endDate),
    },
    teams: [...teamById.values()].map((team) => ({
      ...team,
      talentRating: teamTalentById.get(team.teamId) ?? undefined,
    })),
    matchups: matchups.map((matchup) => ({
      matchupId: String(matchup._id),
      gameType: String(matchup.gameType),
      homeTeamId: String(matchup.homeTeamId),
      homeTeamName:
        teamById.get(String(matchup.homeTeamId))?.name ?? "Unknown team",
      awayTeamId: String(matchup.awayTeamId),
      awayTeamName:
        teamById.get(String(matchup.awayTeamId))?.name ?? "Unknown team",
      homeScore: asNumber(matchup.homeScore),
      awayScore: asNumber(matchup.awayScore),
      homeRank:
        matchup.homeRank === null || matchup.homeRank === undefined
          ? undefined
          : asNumber(matchup.homeRank),
      awayRank:
        matchup.awayRank === null || matchup.awayRank === undefined
          ? undefined
          : asNumber(matchup.awayRank),
      competitiveRating:
        matchup.ratingCompetitive === null ||
        matchup.ratingCompetitive === undefined
          ? undefined
          : asNumber(matchup.ratingCompetitive),
      winnerTeamId: undefined,
      winnerTeamName: undefined,
      loserTeamId: undefined,
      loserTeamName: undefined,
      categoryMargins: buildWeeklyEditionCategoryMargins({
        categories: season.categories ?? [],
        homeTeamName:
          teamById.get(String(matchup.homeTeamId))?.name ?? "Unknown team",
        awayTeamName:
          teamById.get(String(matchup.awayTeamId))?.name ?? "Unknown team",
        homeStats: currentPowerByTeam.get(String(matchup.homeTeamId)) ?? {},
        awayStats: currentPowerByTeam.get(String(matchup.awayTeamId)) ?? {},
      }),
    })),
    players: playerWeekRows.map((row) => {
      const player = playerById.get(String(row.playerId));
      const team = teamById.get(String(row.gshlTeamId));
      return {
        playerId: String(row.playerId),
        playerName: player?.fullName ?? "Unknown player",
        teamId: String(row.gshlTeamId),
        teamName: team?.name ?? "Unknown team",
        rating: row.Rating,
        points: row.P,
        wins: row.W,
      };
    }),
    power: currentPower.map((row) => {
      const previous = previousByTeam.get(String(row.gshlTeamId));
      return {
        teamId: String(row.gshlTeamId),
        teamName: teamById.get(String(row.gshlTeamId))?.name ?? "Unknown team",
        currentRank: row.powerRk,
        previousRank: previous?.powerRk ?? row.powerRk,
        currentElo: row.powerEloPost ?? row.powerElo,
        previousElo: previous?.powerEloPost ?? previous?.powerElo,
        talentRating: teamTalentById.get(String(row.gshlTeamId)) ?? undefined,
      };
    }),
    activity,
    missedStarts,
    performances: [
      ...playerWeekPerformances,
      ...playerDayPerformances,
      ...teamWeekPerformances,
      ...teamDayPerformances,
      ...seasonPerformances,
    ],
    records: [
      ...careerRecords,
      ...achievementRecords,
      ...playerSeasonRecords,
      ...teamSeasonRecords,
      ...teamWeekRecords,
    ],
    milestones,
    awards: awardFacts,
    nextMatchups: nextMatchups.map((matchup) => ({
      matchupId: String(matchup._id),
      gameType: String(matchup.gameType),
      homeTeamName:
        teamById.get(String(matchup.homeTeamId))?.name ?? "Unknown team",
      awayTeamName:
        teamById.get(String(matchup.awayTeamId))?.name ?? "Unknown team",
      homeRank:
        matchup.homeRank === null || matchup.homeRank === undefined
          ? undefined
          : asNumber(matchup.homeRank),
      awayRank:
        matchup.awayRank === null || matchup.awayRank === undefined
          ? undefined
          : asNumber(matchup.awayRank),
    })),
  });
}

async function generateForWeek(
  ctx: MutationCtx,
  season: Doc<"seasons">,
  week: Doc<"weeks">,
  options: GenerationOptions = {},
) {
  const today = dateKey(Date.now());
  const weekStart = toUtcTimestamp(week.startDate);
  const weekEnd = toUtcTimestamp(week.endDate);
  const weekEndDate = dateKey(week.endDate);
  if (
    weekStart === null ||
    weekEnd === null ||
    !weekEndDate ||
    weekEndDate >= today
  )
    throw new Error("The selected week has not ended");

  const facts = await buildSource(ctx, season, week);
  const sourceHash = hashWeeklyEditionSource(facts);
  const editionKey = `week:${String(week._id)}`;
  const existing = await ctx.db
    .query("weeklyEditions")
    .withIndex("by_seasonId_editionKey", (q) =>
      q.eq("seasonId", season._id).eq("editionKey", editionKey),
    )
    .unique();
  if (existing?.sourceHash === sourceHash)
    return { state: "unchanged", existing };
  if (
    existing &&
    existing.generationMode !== "template" &&
    options.replaceEditorial !== true
  ) {
    return { state: "protected", existing };
  }

  const now = Date.now();
  const content = buildTemplateWeeklyEdition(facts);
  if (existing) {
    await saveRevision(ctx, existing, options.editedBy);
    await ctx.db.patch(existing._id, {
      editionKey,
      issueType: "weekly",
      issueLabel: `Week ${asNumber(week.weekNum)}`,
      seasonName: season.name,
      weekNum: asNumber(week.weekNum),
      startDate: weekStart,
      endDate: weekEnd,
      status: "published",
      generationMode: "template",
      content,
      facts,
      sourceHash,
      scheduledFor: weekEnd,
      updatedAt: now,
      editedBy: options.editedBy,
    });
    return { state: "updated", existing: await ctx.db.get(existing._id) };
  }
  const editionId = await ctx.db.insert("weeklyEditions", {
    seasonId: season._id,
    weekId: week._id,
    editionKey,
    issueType: "weekly",
    issueLabel: `Week ${asNumber(week.weekNum)}`,
    seasonName: season.name,
    weekNum: asNumber(week.weekNum),
    startDate: weekStart,
    endDate: weekEnd,
    status: "published",
    generationMode: "template",
    content,
    facts,
    sourceHash,
    publishedAt: now,
    scheduledFor: weekEnd,
    createdAt: now,
    updatedAt: now,
    editedBy: options.editedBy,
  });
  return { state: "inserted", existing: await ctx.db.get(editionId) };
}

function milestoneSchedule(season: Doc<"seasons">, finalWeek: Doc<"weeks">) {
  return buildWeeklyEditionMilestoneSchedule({
    finalWeekEnd: dateKey(finalWeek.endDate),
    signingEndDate: dateKey(season.signingEndDate),
    draftStartAt: isoTimestamp(season.draftStartAt),
  });
}

function nextChronologicalSeason(
  seasons: Doc<"seasons">[],
  season: Doc<"seasons">,
) {
  const ordered = [...seasons].sort(
    (left, right) =>
      asNumber(left.year) - asNumber(right.year) ||
      String(left._id).localeCompare(String(right._id)),
  );
  const index = ordered.findIndex((candidate) => candidate._id === season._id);
  return index >= 0 ? (ordered[index + 1] ?? season) : season;
}

async function buildPreseasonGmRankingFacts(
  ctx: MutationCtx,
  seasons: Doc<"seasons">[],
  franchises: Doc<"franchises">[],
  conferences: Doc<"conferences">[],
) {
  const [
    owners,
    allTeams,
    allWeeks,
    allMatchups,
    allTeamAwards,
    allPowerRankingStats,
  ] = await Promise.all([
    ctx.db.query("owners").collect(),
    ctx.db.query("teams").collect(),
    ctx.db.query("weeks").collect(),
    ctx.db.query("matchups").collect(),
    ctx.db.query("teamAwards").collect(),
    ctx.db.query("teamWeekStatLines").collect(),
  ]);
  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise._id), franchise]),
  );
  const conferenceById = new Map(
    conferences.map((conference) => [String(conference._id), conference]),
  );
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const allowedSeasonIds = new Set(
    seasons.map((candidate) => String(candidate._id)),
  );
  const rankings = buildOwnerRankings({
    owners: owners.map((owner) => ({
      ...owner,
      id: String(owner._id),
      nickName: String(owner.nickName ?? ""),
      email: owner.email ?? undefined,
      owing: asNumber(owner.owing),
      createdAt: new Date(toUtcTimestamp(owner.createdAt) ?? 0),
      updatedAt: new Date(toUtcTimestamp(owner.updatedAt) ?? 0),
    })),
    seasons: seasons.map((season) => ({
      ...season,
      id: String(season._id),
      year: asNumber(season.year),
      categories: season.categories ?? [],
      rosterSpots: season.rosterSpots ?? [],
      startDate: dateKey(season.startDate),
      endDate: dateKey(season.endDate),
      signingEndDate: dateKey(season.signingEndDate),
      draftStartAt: isoTimestamp(season.draftStartAt),
      createdAt: new Date(toUtcTimestamp(season.createdAt) ?? 0),
      updatedAt: new Date(toUtcTimestamp(season.updatedAt) ?? 0),
    })),
    teams: allTeams
      .filter((team) => allowedSeasonIds.has(String(team.seasonId)))
      .map((team) => {
        const franchise = franchiseById.get(String(team.franchiseId));
        const conference = conferenceById.get(String(team.confId));
        const owner = franchise
          ? ownerById.get(String(franchise.ownerId))
          : undefined;
        return {
          id: String(team._id),
          seasonId: String(team.seasonId),
          franchiseId: String(team.franchiseId),
          name: franchise?.name ?? null,
          abbr: franchise?.abbr ?? null,
          logoUrl: franchise?.logoUrl ?? null,
          isActive: franchise?.isActive ?? false,
          yahooId: team.yahooId ?? null,
          confId: String(team.confId),
          confName: conference?.name ?? null,
          confAbbr: conference?.abbr ?? null,
          confLogoUrl: conference?.logoUrl ?? null,
          ownerId: owner ? String(owner._id) : null,
          ownerFirstName: owner?.firstName ?? null,
          ownerLastName: owner?.lastName ?? null,
          ownerNickname: owner?.nickName ?? null,
          ownerEmail: owner?.email ?? null,
          ownerOwing: owner ? asNumber(owner.owing) : null,
          ownerIsActive: owner?.isActive ?? false,
        };
      }),
    weeks: allWeeks
      .filter((week) => allowedSeasonIds.has(String(week.seasonId)))
      .map((week) => ({
        id: String(week._id),
        seasonId: String(week.seasonId),
        weekNum: asNumber(week.weekNum),
        weekType: week.weekType as SeasonType,
        gameDays: asNumber(week.gameDays),
        startDate: dateKey(week.startDate),
        endDate: dateKey(week.endDate),
        isActive: week.isActive,
        isPlayoffs: week.isPlayoffs,
        createdAt: new Date(toUtcTimestamp(week.createdAt) ?? 0),
        updatedAt: new Date(toUtcTimestamp(week.updatedAt) ?? 0),
      })),
    matchups: allMatchups
      .filter((matchup) => allowedSeasonIds.has(String(matchup.seasonId)))
      .map((matchup) => ({
        id: String(matchup._id),
        seasonId: String(matchup.seasonId),
        weekId: String(matchup.weekId),
        homeTeamId: String(matchup.homeTeamId),
        awayTeamId: String(matchup.awayTeamId),
        gameType: matchup.gameType as MatchupType,
        homeRank: asNumber(matchup.homeRank),
        awayRank: asNumber(matchup.awayRank),
        homeScore: asNumber(matchup.homeScore),
        awayScore: asNumber(matchup.awayScore),
        homeWin: Boolean(matchup.homeWin),
        awayWin: Boolean(matchup.awayWin),
        tie: Boolean(matchup.tie),
        isComplete: Boolean(matchup.isComplete),
        rating: asNumber(matchup.rating),
        ratingPre: asNumber(matchup.ratingPre),
        ratingRealized: asNumber(matchup.ratingRealized),
        ratingCompetitive: asNumber(matchup.ratingCompetitive),
        ratingImportance: asNumber(matchup.ratingImportance),
        ratingRosterStrength: asNumber(matchup.ratingRosterStrength),
        createdAt: new Date(toUtcTimestamp(matchup.createdAt) ?? 0),
        updatedAt: new Date(toUtcTimestamp(matchup.updatedAt) ?? 0),
      })),
    teamAwards: allTeamAwards.flatMap((award) =>
      award.ownerId && allowedSeasonIds.has(String(award.seasonId))
        ? [
            {
              ...award,
              id: String(award._id),
              seasonId: String(award.seasonId),
              ownerId: String(award.ownerId),
              teamId: award.teamId ? String(award.teamId) : undefined,
              nomineeIds: (award.nomineeIds ?? []).map(String),
              award: award.award as AwardsList,
              createdAt: new Date(toUtcTimestamp(award.createdAt) ?? 0),
              updatedAt: new Date(toUtcTimestamp(award.updatedAt) ?? 0),
            },
          ]
        : [],
    ),
    powerRankingStats: allPowerRankingStats
      .filter((row) => allowedSeasonIds.has(String(row.seasonId)))
      .map((row) => ({
        seasonId: String(row.seasonId),
        weekId: String(row.weekId),
        gshlTeamId: String(row.gshlTeamId),
        powerRk: asNumber(row.powerRk),
      })),
  });
  return rankings.rankings
    .filter((entry) => entry.isActive)
    .map((entry) => ({
      rank: entry.rank,
      gmName: entry.displayName,
      teamName: entry.primaryTeam?.name ?? undefined,
      rating: entry.rating,
      rankChange: entry.rankChange,
      overallWins: entry.overallRecord.wins,
      overallLosses: entry.overallRecord.losses,
      playoffAppearances: entry.playoffAppearances,
      cups: entry.cups,
    }));
}

async function buildMilestoneSource(
  ctx: MutationCtx,
  season: Doc<"seasons">,
  anchorWeek: Doc<"weeks">,
  issueType: Exclude<WeeklyEditionIssueType, "weekly">,
  triggerDate: string,
) {
  const allSeasons = await ctx.db.query("seasons").collect();
  const analysisSeason = nextChronologicalSeason(allSeasons, season);
  const [
    teams,
    sourceTeams,
    franchises,
    conferences,
    players,
    contracts,
    draftPicks,
    weeks,
    teamWeekRows,
    seasonMatchups,
    finalPlayerRows,
  ] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", analysisSeason._id))
      .collect(),
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db.query("franchises").collect(),
    ctx.db.query("conferences").collect(),
    ctx.db.query("players").collect(),
    ctx.db.query("contracts").collect(),
    ctx.db
      .query("draftPicks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", analysisSeason._id))
      .collect(),
    ctx.db
      .query("weeks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db
      .query("teamWeekStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    issueType === "final_recap"
      ? ctx.db
          .query("matchups")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect()
      : [],
    ctx.db
      .query("playerWeekStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", anchorWeek._id))
      .collect(),
  ]);
  if (teams.length === 0) throw new Error("Season teams are not available");
  if (
    issueType === "final_recap" &&
    (seasonMatchups.length === 0 ||
      seasonMatchups.some((matchup) => !matchup.isComplete))
  ) {
    throw new Error("The final week is not complete");
  }
  if (issueType === "pre_draft" && draftPicks.length === 0) {
    throw new Error("Draft picks are not available");
  }
  if (
    issueType === "preseason" &&
    (draftPicks.length === 0 || draftPicks.some((pick) => !pick.playerId))
  ) {
    throw new Error("The draft is not complete");
  }

  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise._id), franchise]),
  );
  const conferenceById = new Map(
    conferences.map((conference) => [String(conference._id), conference]),
  );
  const teamById = new Map(
    teams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      const conference = conferenceById.get(String(team.confId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
          conferenceId: String(team.confId),
          conferenceName: conference?.name,
          conferenceLogoUrl: conference?.logoUrl ?? undefined,
          beatWriter: franchise?.beatWriter ?? undefined,
          leadReporter: conference?.leadReporter ?? undefined,
          ownerId: String(franchise?.ownerId ?? ""),
        },
      ];
    }),
  );
  const sourceTeamById = new Map(
    sourceTeams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      const conference = conferenceById.get(String(team.confId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
          conferenceId: String(team.confId),
          conferenceName: conference?.name,
          conferenceLogoUrl: conference?.logoUrl ?? undefined,
          beatWriter: franchise?.beatWriter ?? undefined,
          leadReporter: conference?.leadReporter ?? undefined,
          ownerId: String(franchise?.ownerId ?? ""),
        },
      ];
    }),
  );
  const teamByOwnerId = new Map(
    [...teamById.values()].map((team) => [team.ownerId, team]),
  );
  const playerById = new Map(
    players.map((player) => [String(player._id), player]),
  );
  const weekNumById = new Map(
    weeks.map((week) => [String(week._id), asNumber(week.weekNum)]),
  );
  const latestPowerByTeam = new Map();
  teamWeekRows.forEach((row) => {
    const key = String(row.gshlTeamId);
    const previous = latestPowerByTeam.get(key);
    if (
      !previous ||
      (weekNumById.get(String(row.weekId)) ?? 0) >
        (weekNumById.get(String(previous.weekId)) ?? 0)
    ) {
      latestPowerByTeam.set(key, row);
    }
  });

  const seasonEnd = dateKey(season.endDate);
  const signingEnd = dateKey(analysisSeason.signingEndDate);
  const contractSeasons = allSeasons.map((candidate) => ({
    id: String(candidate._id),
    year: candidate.year,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
  }));
  const completedContractSeason = {
    id: String(season._id),
    year: season.year,
    startDate: season.startDate,
    endDate: season.endDate,
  };
  const analysisContractSeason = {
    id: String(analysisSeason._id),
    year: analysisSeason.year,
    startDate: analysisSeason.startDate,
    endDate: analysisSeason.endDate,
  };
  const teamContracts = contracts.filter((contract) =>
    teamByOwnerId.has(String(contract.ownerId)),
  );
  const snapshotContracts = teamContracts.filter((contract) => {
    const signingDate = dateKey(contract.signingDate);
    return !signingDate || signingDate <= triggerDate;
  });
  const relevantContracts = snapshotContracts.filter((contract) =>
    weeklyEditionContractAffectsSeason(
      contract,
      analysisContractSeason,
      contractSeasons,
    ),
  );
  const expiringRows = snapshotContracts.filter(
    (contract) =>
      isWeeklyEditionPlayingContract(contract) &&
      weeklyEditionContractAffectsSeason(
        contract,
        completedContractSeason,
        contractSeasons,
      ) &&
      !weeklyEditionContractAffectsSeason(
        contract,
        analysisContractSeason,
        contractSeasons,
      ),
  );
  const recentRows = snapshotContracts.filter((contract) => {
    const signingDate = dateKey(contract.signingDate);
    return (
      isWeeklyEditionPlayingContract(contract) &&
      weeklyEditionContractAffectsSeason(
        contract,
        analysisContractSeason,
        contractSeasons,
      ) &&
      signingDate > seasonEnd &&
      signingDate <= triggerDate
    );
  });
  const contractFact = (contract: Doc<"contracts">) => {
    const player = playerById.get(String(contract.playerId));
    const salary = asNumber(contract.capHit ?? contract.contractSalary);
    const signingStatus = String(contract.signingStatus ?? "").trim();
    const expiryStatus = String(contract.expiryStatus ?? "").trim();
    const normalizedExpiryStatus = expiryStatus.toUpperCase();
    const updatedSalary = asNumber(player?.salary) || salary;
    const canBeReSigned = normalizedExpiryStatus === "RFA";
    return {
      contractId: String(contract._id),
      playerName: player?.fullName ?? "Unknown player",
      teamName:
        teamByOwnerId.get(String(contract.ownerId))?.name ?? "Unknown team",
      salary,
      signingStatus,
      expiryStatus,
      expiryDate: dateKey(contract.expiryDate),
      updatedSalary,
      signedAt: dateKey(contract.signingDate),
      canBeReSigned,
      requiredReSigningSalary: canBeReSigned
        ? Math.round(updatedSalary * 1.15)
        : undefined,
      returnsToDraft: normalizedExpiryStatus === "UFA",
      playerRating:
        asNumber(player?.overallRating ?? player?.seasonRating) || undefined,
    };
  };
  const draftBoundPlayerIds = new Set(
    expiringRows
      .filter(
        (contract) =>
          String(contract.expiryStatus ?? "")
            .trim()
            .toUpperCase() === "UFA",
      )
      .map((contract) => String(contract.playerId)),
  );
  const summerUfas = isWeeklyEditionSummerUfaPoolAvailable(
    triggerDate,
    signingEnd,
  )
    ? players
        .filter((player) => {
          const playerId = String(player._id);
          return (
            player.isActive &&
            player.isSignable &&
            asNumber(player.salary) > 0 &&
            !draftBoundPlayerIds.has(playerId) &&
            !relevantContracts.some(
              (contract) =>
                String(contract.playerId) === playerId &&
                isWeeklyEditionPlayingContract(contract),
            )
          );
        })
        .map((player) => {
          const updatedSalary = asNumber(player.salary);
          return {
            playerId: String(player._id),
            playerName: player.fullName,
            previousTeamName: player.ownerId
              ? teamByOwnerId.get(String(player.ownerId))?.name
              : undefined,
            updatedSalary,
            requiredUfaSalary: Math.round(updatedSalary * 1.25),
            rosterTalent:
              asNumber(player.overallRating ?? player.seasonRating) ||
              undefined,
          };
        })
        .sort(
          (left, right) =>
            (right.rosterTalent ?? 0) - (left.rosterTalent ?? 0) ||
            right.requiredUfaSalary - left.requiredUfaSalary ||
            left.playerName.localeCompare(right.playerName),
        )
        .slice(0, 24)
    : [];
  const buyoutCharges = relevantContracts
    .filter(
      (contract) =>
        String(contract.expiryStatus ?? "")
          .trim()
          .toUpperCase() === "BUYOUT",
    )
    .map((contract) => ({
      contractId: String(contract._id),
      playerName:
        playerById.get(String(contract.playerId))?.fullName ?? "Unknown player",
      teamName:
        teamByOwnerId.get(String(contract.ownerId))?.name ?? "Unknown team",
      capHit: asNumber(contract.capHit ?? contract.contractSalary),
      capHitEndDate: dateKey(contract.capHitEndDate ?? contract.expiryDate),
    }));
  const draftFacts = draftPicks.map((pick) => ({
    pickId: String(pick._id),
    teamName: teamById.get(String(pick.gshlTeamId))?.name ?? "Unknown team",
    round: asNumber(pick.round),
    pick:
      pick.pick === null || pick.pick === undefined
        ? undefined
        : asNumber(pick.pick),
    selectedPlayerName:
      issueType === "preseason" && pick.playerId
        ? playerById.get(String(pick.playerId))?.fullName
        : undefined,
    selectedPlayerRating:
      issueType === "preseason" && pick.playerId
        ? asNumber(
            playerById.get(String(pick.playerId))?.overallRating ??
              playerById.get(String(pick.playerId))?.seasonRating,
          ) || undefined
        : undefined,
  }));
  const teamOutlooks = [...teamById.values()].map((team) => {
    const rosterPlayerIds = new Set(
      relevantContracts
        .filter(
          (contract) =>
            String(contract.ownerId) === team.ownerId &&
            isWeeklyEditionPlayingContract(contract),
        )
        .map((contract) => String(contract.playerId)),
    );
    if (issueType === "preseason") {
      draftPicks
        .filter(
          (pick) =>
            String(pick.gshlTeamId) === team.teamId && Boolean(pick.playerId),
        )
        .forEach((pick) => rosterPlayerIds.add(String(pick.playerId)));
    }
    const roster = [...rosterPlayerIds]
      .map((playerId) => playerById.get(playerId))
      .filter((player) => player !== undefined);
    const ownerContracts = relevantContracts.filter(
      (contract) => String(contract.ownerId) === team.ownerId,
    );
    const playingOwnerContracts = ownerContracts.filter(
      isWeeklyEditionPlayingContract,
    );
    const committedSalary = ownerContracts.reduce(
      (total, contract) =>
        total + asNumber(contract.capHit ?? contract.contractSalary),
      0,
    );
    const teamDraftPicks = draftPicks.filter(
      (pick) => String(pick.gshlTeamId) === team.teamId,
    );
    return {
      teamId: team.teamId,
      teamName: team.name,
      capSpace: 25_000_000 - committedSalary,
      committedSalary,
      rosterSize: roster.length,
      rosterTalent:
        calculateDraftRosterTalentRating(roster) ??
        asNumber(latestPowerByTeam.get(team.teamId)?.powerTalent),
      expiringCount: expiringRows.filter(
        (contract) => String(contract.ownerId) === team.ownerId,
      ).length,
      draftPickCount: teamDraftPicks.length,
      firstRoundPickCount: teamDraftPicks.filter(
        (pick) => asNumber(pick.round) === 1,
      ).length,
      draftSelectionsConsumed: playingOwnerContracts.length,
    };
  });
  const teamWeekByTeamAndWeek = new Map(
    teamWeekRows.map((row) => [
      `${String(row.gshlTeamId)}:${String(row.weekId)}`,
      row,
    ]),
  );
  const recapMatchups =
    issueType === "final_recap"
      ? [
          ...seasonMatchups
            .filter(
              (matchup) =>
                matchup.isComplete &&
                ["F", "SF", "QF"].includes(String(matchup.gameType)),
            )
            .sort(
              (left, right) =>
                (weekNumById.get(String(left.weekId)) ?? 0) -
                  (weekNumById.get(String(right.weekId)) ?? 0) ||
                String(left._id).localeCompare(String(right._id)),
            ),
          ...seasonMatchups
            .filter(
              (matchup) =>
                matchup.isComplete &&
                ["CC", "NC"].includes(String(matchup.gameType)),
            )
            .sort(
              (left, right) =>
                asNumber(right.ratingImportance) -
                  asNumber(left.ratingImportance) ||
                asNumber(right.ratingCompetitive) -
                  asNumber(left.ratingCompetitive),
            )
            .slice(0, 18),
        ]
      : [];
  const finalEditorialCandidates =
    issueType === "final_recap"
      ? (await buildSource(ctx, season, anchorWeek)).editorialCandidates
      : [];
  const gmRankings =
    issueType === "preseason"
      ? await buildPreseasonGmRankingFacts(
          ctx,
          allSeasons.filter(
            (candidate) => asNumber(candidate.year) <= asNumber(season.year),
          ),
          franchises,
          conferences,
        )
      : [];

  return buildMilestoneEditionFactPacket({
    issueType,
    issueLabel:
      milestoneSchedule(analysisSeason, anchorWeek).find(
        (item) => item.issueType === issueType,
      )?.issueLabel ?? issueType,
    triggerDate,
    analysisSeason: {
      id: String(analysisSeason._id),
      name: analysisSeason.name,
      signingEndDate: signingEnd,
      draftStartAt: isoTimestamp(analysisSeason.draftStartAt),
    },
    season: {
      id: String(season._id),
      name: season.name,
      year: String(season.year),
      endDate: seasonEnd,
      signingEndDate: signingEnd,
      draftStartAt: isoTimestamp(analysisSeason.draftStartAt),
    },
    week: {
      id: String(anchorWeek._id),
      number: asNumber(anchorWeek.weekNum),
      startDate: dateKey(anchorWeek.startDate),
      endDate: dateKey(anchorWeek.endDate),
    },
    teams: [...teamById.values()].map(({ ownerId: _ownerId, ...team }) => team),
    matchups:
      issueType === "final_recap"
        ? recapMatchups.map((matchup) => ({
            matchupId: String(matchup._id),
            gameType: String(matchup.gameType),
            homeTeamId: String(matchup.homeTeamId),
            homeTeamName:
              sourceTeamById.get(String(matchup.homeTeamId))?.name ??
              "Unknown team",
            awayTeamId: String(matchup.awayTeamId),
            awayTeamName:
              sourceTeamById.get(String(matchup.awayTeamId))?.name ??
              "Unknown team",
            homeScore: asNumber(matchup.homeScore),
            awayScore: asNumber(matchup.awayScore),
            homeRank: asNumber(matchup.homeRank),
            awayRank: asNumber(matchup.awayRank),
            competitiveRating: asNumber(matchup.ratingCompetitive),
            winnerTeamId: undefined,
            winnerTeamName: undefined,
            loserTeamId: undefined,
            loserTeamName: undefined,
            categoryMargins: buildWeeklyEditionCategoryMargins({
              categories: season.categories ?? [],
              homeTeamName:
                sourceTeamById.get(String(matchup.homeTeamId))?.name ??
                "Unknown team",
              awayTeamName:
                sourceTeamById.get(String(matchup.awayTeamId))?.name ??
                "Unknown team",
              homeStats:
                teamWeekByTeamAndWeek.get(
                  `${String(matchup.homeTeamId)}:${String(matchup.weekId)}`,
                ) ?? {},
              awayStats:
                teamWeekByTeamAndWeek.get(
                  `${String(matchup.awayTeamId)}:${String(matchup.weekId)}`,
                ) ?? {},
            }),
          }))
        : [],
    stars:
      issueType === "final_recap"
        ? finalPlayerRows.map((row) => ({
            playerId: String(row.playerId),
            playerName:
              playerById.get(String(row.playerId))?.fullName ??
              "Unknown player",
            teamId: String(row.gshlTeamId),
            teamName:
              sourceTeamById.get(String(row.gshlTeamId))?.name ??
              "Unknown team",
            rating: row.Rating,
            points: row.P,
            wins: row.W,
          }))
        : [],
    power: [...latestPowerByTeam.entries()].map(([teamId, row]) => ({
      teamId,
      teamName: sourceTeamById.get(teamId)?.name ?? "Unknown team",
      currentRank: row.powerRk,
      previousRank: row.powerRk,
      currentElo: row.powerEloPost ?? row.powerElo,
      previousElo: row.powerEloPost ?? row.powerElo,
      talentRating: row.powerTalent,
    })),
    teamOutlooks,
    expiringContracts: expiringRows.map(contractFact),
    recentSignings: recentRows.map(contractFact),
    signedPlayers: relevantContracts
      .filter(isWeeklyEditionPlayingContract)
      .map(contractFact),
    summerUfas,
    buyoutCharges,
    gmRankings,
    draftPicks: draftFacts,
    editorialCandidates: finalEditorialCandidates,
  });
}

async function generateMilestoneForSeason(
  ctx: MutationCtx,
  season: Doc<"seasons">,
  anchorWeek: Doc<"weeks">,
  issueType: Exclude<WeeklyEditionIssueType, "weekly">,
  scheduledFor: string,
  options: GenerationOptions = {},
) {
  const facts = await buildMilestoneSource(
    ctx,
    season,
    anchorWeek,
    issueType,
    scheduledFor,
  );
  const sourceHash = hashWeeklyEditionSource(facts);
  const editionKey = `milestone:${issueType}`;
  const existing = await ctx.db
    .query("weeklyEditions")
    .withIndex("by_seasonId_editionKey", (q) =>
      q.eq("seasonId", season._id).eq("editionKey", editionKey),
    )
    .unique();
  if (existing && options.refreshSource !== true)
    return { state: "unchanged", existing };
  if (existing?.sourceHash === sourceHash)
    return { state: "unchanged", existing };
  if (
    existing &&
    existing.generationMode !== "template" &&
    options.replaceEditorial !== true
  ) {
    return { state: "protected", existing };
  }
  const now = Date.now();
  const scheduledForTimestamp = toUtcTimestamp(scheduledFor);
  const anchorStart = toUtcTimestamp(anchorWeek.startDate);
  const anchorEnd = toUtcTimestamp(anchorWeek.endDate);
  if (
    scheduledForTimestamp === null ||
    anchorStart === null ||
    anchorEnd === null
  ) {
    throw new Error("The weekly edition schedule contains an invalid date");
  }
  const content = buildTemplateWeeklyEdition(facts);
  const values = {
    editionKey,
    issueType,
    issueLabel: facts.issueLabel,
    seasonName: season.name,
    weekNum: asNumber(anchorWeek.weekNum),
    startDate: anchorStart,
    endDate: anchorEnd,
    status: "published" as const,
    generationMode: "template" as const,
    content,
    facts,
    sourceHash,
    scheduledFor: scheduledForTimestamp,
    updatedAt: now,
    editedBy: options.editedBy,
  };
  if (existing) {
    await saveRevision(ctx, existing, options.editedBy);
    await ctx.db.patch(existing._id, values);
    return { state: "updated", existing: await ctx.db.get(existing._id) };
  }
  const editionId = await ctx.db.insert("weeklyEditions", {
    seasonId: season._id,
    weekId: anchorWeek._id,
    ...values,
    publishedAt: now,
    createdAt: now,
  });
  return { state: "inserted", existing: await ctx.db.get(editionId) };
}

export const latestPublished = query({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("weeklyEditions")
      .withIndex("by_homeActive_publishedAt", (q) => q.eq("isHomeActive", true))
      .order("desc")
      .first();
    return active?.status === "published"
      ? buildWeeklyEditionHomeSummary({
          id: String(active._id),
          issueLabel: active.issueLabel,
          content: active.content as WeeklyEditionContent,
          facts: active.facts as WeeklyEditionFactPacket,
        })
      : null;
  },
});

export const publishedArchive = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 40), 1), 100);
    const seasonId = args.seasonId;
    const rows = seasonId
      ? await ctx.db
          .query("weeklyEditions")
          .withIndex("by_seasonId_status_publishedAt", (q) =>
            q.eq("seasonId", seasonId).eq("status", "published"),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("weeklyEditions")
          .withIndex("by_status_publishedAt", (q) =>
            q.eq("status", "published"),
          )
          .order("desc")
          .take(limit);
    return rows.map((row) =>
      buildWeeklyEditionArchiveSummary({
        id: String(row._id),
        seasonName: row.seasonName,
        issueLabel: row.issueLabel,
        content: row.content as WeeklyEditionContent,
      }),
    );
  },
});

export const publishedById = query({
  args: { editionId: v.id("weeklyEditions") },
  handler: async (ctx, args) => {
    const edition = await ctx.db.get(args.editionId);
    return edition?.status === "published" ? publicReaderRow(edition) : null;
  },
});

export const newsroom = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return (await ctx.db.query("weeklyEditions").order("desc").take(100)).map(
      (row) =>
        buildWeeklyEditionNewsroomSummary({
          id: String(row._id),
          seasonName: row.seasonName,
          issueLabel: row.issueLabel,
          generationMode: row.generationMode,
          status: row.status,
          isHomeActive: row.isHomeActive,
        }),
    );
  },
});

export const newsroomById = query({
  args: { editionId: v.id("weeklyEditions") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    return publicRow(await ctx.db.get(args.editionId));
  },
});

export const revisions = query({
  args: { editionId: v.id("weeklyEditions") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const rows = await ctx.db
      .query("weeklyEditionRevisions")
      .withIndex("by_editionId_createdAt", (q) =>
        q.eq("editionId", args.editionId),
      )
      .order("desc")
      .take(100);
    return rows.map((row) =>
      buildWeeklyEditionRevisionSummary({
        id: String(row._id),
        generationMode: row.generationMode,
        createdAt: requiredPublicTimestamp("createdAt", row.createdAt),
      }),
    );
  },
});

export const prompt = query({
  args: { editionId: v.id("weeklyEditions") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const edition = await ctx.db.get(args.editionId);
    if (!edition) throw new Error("Edition not found");
    return buildWeeklyEditionChatGptPrompt(edition.facts);
  },
});

export const aiStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return {
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: newsroomModel(),
    };
  },
});

export const currentAiCommissioner = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireCommissioner(ctx);
    return { userId: user._id };
  },
});

export const prepareAiGeneration = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    issueType: weeklyEditionIssueTypeValidator,
  },
  handler: async (ctx, args) => {
    const [season, week, allSeasons] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db.get(args.weekId),
      ctx.db.query("seasons").collect(),
    ]);
    if (!season || !week || week.seasonId !== season._id) {
      throw new Error("Season or week not found");
    }

    const analysisSeason = nextChronologicalSeason(allSeasons, season);
    const scheduledFor =
      milestoneSchedule(analysisSeason, week).find(
        (item) => item.issueType === args.issueType,
      )?.scheduledFor ?? dateKey(week.endDate);
    const weekStart = toUtcTimestamp(week.startDate);
    const weekEnd = toUtcTimestamp(week.endDate);
    if (weekStart === null || weekEnd === null) {
      throw new Error("The selected week contains an invalid date");
    }

    let facts: WeeklyEditionFactPacket;
    let editionKey: string;
    let issueLabel: string;
    let scheduledForTimestamp: number;
    if (args.issueType === "weekly") {
      const weekEndDate = dateKey(week.endDate);
      if (!weekEndDate || weekEndDate >= dateKey(Date.now())) {
        throw new Error("The selected week has not ended");
      }
      facts = await buildSource(ctx, season, week);
      editionKey = `week:${String(week._id)}`;
      issueLabel = `Week ${asNumber(week.weekNum)}`;
      scheduledForTimestamp = weekEnd;
    } else {
      facts = await buildMilestoneSource(
        ctx,
        season,
        week,
        args.issueType,
        scheduledFor,
      );
      editionKey = `milestone:${args.issueType}`;
      issueLabel = facts.issueLabel;
      const timestamp = toUtcTimestamp(scheduledFor);
      if (timestamp === null) {
        throw new Error("The weekly edition schedule contains an invalid date");
      }
      scheduledForTimestamp = timestamp;
    }

    const existing = await ctx.db
      .query("weeklyEditions")
      .withIndex("by_seasonId_editionKey", (q) =>
        q.eq("seasonId", season._id).eq("editionKey", editionKey),
      )
      .unique();
    return {
      existingEditionId: existing?._id,
      expectedUpdatedAt: existing
        ? requiredPublicTimestamp("updatedAt", existing.updatedAt)
        : undefined,
      seasonId: season._id,
      weekId: week._id,
      editionKey,
      issueType: args.issueType,
      issueLabel,
      seasonName: season.name,
      weekNum: asNumber(week.weekNum),
      startDate: weekStart,
      endDate: weekEnd,
      scheduledFor: scheduledForTimestamp,
      facts,
      sourceHash: hashWeeklyEditionSource(facts),
    };
  },
});

export const finalizeAiGeneration = internalMutation({
  args: {
    existingEditionId: v.optional(v.id("weeklyEditions")),
    expectedUpdatedAt: v.optional(v.number()),
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    editionKey: v.string(),
    issueType: weeklyEditionIssueTypeValidator,
    issueLabel: v.string(),
    seasonName: v.string(),
    weekNum: v.number(),
    startDate: v.number(),
    endDate: v.number(),
    scheduledFor: v.number(),
    facts: v.any(),
    sourceHash: v.string(),
    raw: v.string(),
    editedBy: v.id("authUsers"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.editedBy);
    if (user?.status !== "active" || user.role !== "commissioner") {
      throw new Error("Forbidden");
    }

    const facts = args.facts as WeeklyEditionFactPacket;
    if (hashWeeklyEditionSource(facts) !== args.sourceHash) {
      throw new Error("The newsletter fact packet failed its integrity check");
    }
    const validation = validateWeeklyEditionImport(args.raw, facts);
    if (!validation.valid || !validation.content) {
      throw new Error(validation.errors.join("\n"));
    }

    const existing = args.existingEditionId
      ? await ctx.db.get(args.existingEditionId)
      : null;
    if (args.existingEditionId && !existing) {
      throw new Error("The newsletter changed while OpenAI was writing it");
    }
    if (
      existing &&
      (existing.seasonId !== args.seasonId ||
        existing.weekId !== args.weekId ||
        existing.editionKey !== args.editionKey ||
        requiredPublicTimestamp("updatedAt", existing.updatedAt) !==
          args.expectedUpdatedAt)
    ) {
      throw new Error("The newsletter changed while OpenAI was writing it");
    }
    if (!existing) {
      const concurrent = await ctx.db
        .query("weeklyEditions")
        .withIndex("by_seasonId_editionKey", (q) =>
          q.eq("seasonId", args.seasonId).eq("editionKey", args.editionKey),
        )
        .unique();
      if (concurrent) {
        throw new Error("The newsletter changed while OpenAI was writing it");
      }
    }

    const now = Date.now();
    const values = {
      editionKey: args.editionKey,
      issueType: args.issueType,
      issueLabel: args.issueLabel,
      seasonName: args.seasonName,
      weekNum: args.weekNum,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "published" as const,
      generationMode: "openai" as const,
      content: validation.content,
      facts,
      sourceHash: args.sourceHash,
      scheduledFor: args.scheduledFor,
      updatedAt: now,
      editedBy: args.editedBy,
    };

    if (existing) {
      await saveRevision(ctx, existing, args.editedBy);
      await ctx.db.patch(existing._id, values);
      return publicRow(await ctx.db.get(existing._id));
    }

    const editionId = await ctx.db.insert("weeklyEditions", {
      seasonId: args.seasonId,
      weekId: args.weekId,
      ...values,
      publishedAt: now,
      createdAt: now,
    });
    return publicRow(await ctx.db.get(editionId));
  },
});

export const generateWithAi = action({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    issueType: weeklyEditionIssueTypeValidator,
    articleCount: v.optional(weeklyEditionArticleCountValidator),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    state: "inserted" | "updated";
    model: string;
    articleCount: WeeklyEditionArticleCount;
    edition: WeeklyEdition;
  }> => {
    const commissioner = await ctx.runQuery(
      internal.weeklyEditions.currentAiCommissioner,
      {},
    );
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "OpenAI is not configured. Add OPENAI_API_KEY to this Convex deployment.",
      );
    }

    const articleCount =
      args.articleCount ?? DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT;
    const prepared = await ctx.runMutation(
      internal.weeklyEditions.prepareAiGeneration,
      {
        seasonId: args.seasonId,
        weekId: args.weekId,
        issueType: args.issueType,
      },
    );
    const facts = prepared.facts;
    const model = newsroomModel();
    const scoutPrompt = buildWeeklyEditionStoryScoutPrompt(facts, articleCount);
    let pitchRaw = await requestNewsroomJson({
      apiKey,
      failureLabel: "run the newsroom pitch meeting",
      request: buildWeeklyEditionPitchOpenAiRequest({
        model,
        prompt: scoutPrompt,
      }),
    });
    let assignments: ReturnType<typeof selectWeeklyEditionStoryAssignments>;
    try {
      assignments = selectWeeklyEditionStoryAssignments(
        facts,
        parseWeeklyEditionStorySubmissions(pitchRaw),
        articleCount,
      );
    } catch (error) {
      const correctionPrompt = [
        scoutPrompt,
        "",
        "PITCH_REVISION_REQUIRED: The pitch desk response failed validation.",
        `Return every supplied writer exactly once, keep each pitch inside that writer's beat, use only exact STORY_LEDGER candidate IDs, and provide enough distinct eligible leads for ${articleCount} different writers.`,
        `VALIDATION_ERROR=${error instanceof Error ? error.message : "Invalid pitch response"}`,
        `REJECTED_PITCHES=${pitchRaw}`,
      ].join("\n");
      pitchRaw = await requestNewsroomJson({
        apiKey,
        failureLabel: "correct the newsroom pitches",
        request: buildWeeklyEditionPitchOpenAiRequest({
          model,
          prompt: correctionPrompt,
        }),
      });
      assignments = selectWeeklyEditionStoryAssignments(
        facts,
        parseWeeklyEditionStorySubmissions(pitchRaw),
        articleCount,
      );
    }
    const prompt = buildWeeklyEditionChatGptPrompt(
      facts,
      assignments,
      articleCount,
    );
    let raw = await requestNewsroomJson({
      apiKey,
      failureLabel: "write the newsletter",
      request: buildWeeklyEditionOpenAiRequest({
        model,
        prompt,
        articleCount,
      }),
    });
    let validation = validateWeeklyEditionImport(raw, facts);
    let validationErrors =
      validation.valid && validation.content
        ? validateWeeklyEditionStoryAssignments(
            validation.content,
            assignments,
            facts,
          )
        : validation.errors;

    if (!validation.valid || validationErrors.length > 0) {
      const correctionPrompt = [
        prompt,
        "",
        "REVISION_REQUIRED: The draft below failed the newsroom validator.",
        `Correct every listed error without changing supported facts, adding claims, or changing the required ${articleCount}-article structure. Return only the corrected JSON object.`,
        `VALIDATION_ERRORS=${JSON.stringify(validationErrors)}`,
        `REJECTED_DRAFT=${raw}`,
      ].join("\n");
      raw = await requestNewsroomJson({
        apiKey,
        failureLabel: "correct the newsletter",
        request: buildWeeklyEditionOpenAiRequest({
          model,
          prompt: correctionPrompt,
          articleCount,
        }),
      });
      validation = validateWeeklyEditionImport(raw, facts);
      validationErrors =
        validation.valid && validation.content
          ? validateWeeklyEditionStoryAssignments(
              validation.content,
              assignments,
              facts,
            )
          : validation.errors;
    }

    if (!validation.valid || validationErrors.length > 0) {
      throw new Error(
        `OpenAI returned a newsletter that failed validation:\n${validationErrors.join(
          "\n",
        )}`,
      );
    }

    const edition = await ctx.runMutation(
      internal.weeklyEditions.finalizeAiGeneration,
      {
        ...prepared,
        raw,
        editedBy: commissioner.userId,
      },
    );
    if (!edition)
      throw new Error("The generated newsletter could not be saved");
    return {
      state: prepared.existingEditionId ? "updated" : "inserted",
      model,
      articleCount,
      edition: edition as unknown as WeeklyEdition,
    };
  },
});

export const generateHistorical = mutation({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    issueType: v.optional(weeklyEditionIssueTypeValidator),
    replaceEditorial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const [season, week, allSeasons] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db.get(args.weekId),
      ctx.db.query("seasons").collect(),
    ]);
    if (!season || !week || week.seasonId !== season._id)
      throw new Error("Season or week not found");
    const issueType = args.issueType ?? "weekly";
    const analysisSeason = nextChronologicalSeason(allSeasons, season);
    const scheduledFor =
      milestoneSchedule(analysisSeason, week).find(
        (item) => item.issueType === issueType,
      )?.scheduledFor ?? dateKey(week.endDate);
    const result =
      issueType === "weekly"
        ? await generateForWeek(ctx, season, week, {
            replaceEditorial: args.replaceEditorial,
            editedBy: user._id,
          })
        : await generateMilestoneForSeason(
            ctx,
            season,
            week,
            issueType,
            scheduledFor,
            {
              replaceEditorial: args.replaceEditorial,
              editedBy: user._id,
              refreshSource: true,
            },
          );
    return { state: result.state, edition: publicRow(result.existing) };
  },
});

export const publishImport = mutation({
  args: { editionId: v.id("weeklyEditions"), raw: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const edition = await ctx.db.get(args.editionId);
    if (!edition) throw new Error("Edition not found");
    const result = validateWeeklyEditionImport(args.raw, edition.facts);
    if (!result.valid || !result.content)
      throw new Error(result.errors.join("\n"));
    await saveRevision(ctx, edition, user._id);
    await ctx.db.patch(edition._id, {
      content: result.content,
      generationMode: "chatgpt_import",
      status: "published",
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(edition._id));
  },
});

export const updateManual = mutation({
  args: { editionId: v.id("weeklyEditions"), content: v.any() },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const edition = await ctx.db.get(args.editionId);
    if (!edition) throw new Error("Edition not found");
    const result = validateWeeklyEditionContent(args.content, edition.facts);
    if (!result.valid || !result.content)
      throw new Error(result.errors.join("\n"));
    await saveRevision(ctx, edition, user._id);
    await ctx.db.patch(edition._id, {
      content: result.content,
      generationMode: "manual",
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(edition._id));
  },
});

export const setVisibility = mutation({
  args: {
    editionId: v.id("weeklyEditions"),
    status: v.union(v.literal("published"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const edition = await ctx.db.get(args.editionId);
    if (!edition) throw new Error("Edition not found");
    await ctx.db.patch(args.editionId, {
      status: args.status,
      isHomeActive: args.status === "hidden" ? false : edition.isHomeActive,
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(args.editionId));
  },
});

export const setHomeActive = mutation({
  args: { editionId: v.optional(v.id("weeklyEditions")) },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const target = args.editionId ? await ctx.db.get(args.editionId) : null;
    if (args.editionId && !target) throw new Error("Edition not found");
    if (target && target.status !== "published") {
      throw new Error("Only a published edition can appear on the homepage");
    }

    const activeEditions = await ctx.db
      .query("weeklyEditions")
      .withIndex("by_homeActive_publishedAt", (q) => q.eq("isHomeActive", true))
      .collect();
    const now = Date.now();
    for (const edition of activeEditions) {
      if (edition._id === args.editionId) continue;
      await ctx.db.patch(edition._id, {
        isHomeActive: false,
        editedBy: user._id,
        updatedAt: now,
      });
    }
    if (target) {
      await ctx.db.patch(target._id, {
        isHomeActive: true,
        editedBy: user._id,
        updatedAt: now,
      });
    }
    return {
      activeEditionId: target ? String(target._id) : null,
    };
  },
});

export const setSectionActive = mutation({
  args: {
    editionId: v.id("weeklyEditions"),
    sectionId: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const edition = await ctx.db.get(args.editionId);
    if (!edition) throw new Error("Edition not found");
    const sections = edition.content.sections as Array<{ id: string }>;
    if (!sections.some((section) => section.id === args.sectionId)) {
      throw new Error("Article not found in this edition");
    }
    const inactive = new Set(edition.inactiveSectionIds ?? []);
    if (args.active) inactive.delete(args.sectionId);
    else inactive.add(args.sectionId);
    await ctx.db.patch(edition._id, {
      inactiveSectionIds: [...inactive],
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(edition._id));
  },
});

export const restoreRevision = mutation({
  args: { revisionId: v.id("weeklyEditionRevisions") },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) throw new Error("Revision not found");
    const edition = await ctx.db.get(revision.editionId);
    if (!edition) throw new Error("Edition not found");
    await saveRevision(ctx, edition, user._id);
    await ctx.db.patch(edition._id, {
      content: revision.content,
      generationMode: revision.generationMode,
      sourceHash: revision.sourceHash,
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(edition._id));
  },
});

export const processGenerationJob = internalMutation({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    if (run.status === "cancelling") return { cancelled: true };
    if (!run.apply)
      return {
        cancelled: false,
        apply: false,
        counts: {
          processed: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          skipped: 0,
        },
      };
    const requestedSeasonId =
      typeof run.args?.seasonId === "string" ? run.args.seasonId : undefined;
    const allSeasons = await ctx.db.query("seasons").collect();
    const seasons = requestedSeasonId
      ? allSeasons.filter(
          (season) =>
            String(season._id) === requestedSeasonId ||
            String(season.legacyId ?? "") === requestedSeasonId,
        )
      : allSeasons.filter((season) => season.isActive);
    const counts = {
      processed: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    };
    const today = dateKey(Date.now());
    for (const season of seasons) {
      const weeks = await ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect();
      for (const week of weeks.filter(
        (item) => dateKey(item.endDate) < today,
      )) {
        counts.processed += 1;
        try {
          const result = await generateForWeek(ctx, season, week);
          if (result.state === "inserted") counts.inserted += 1;
          else if (result.state === "updated") counts.updated += 1;
          else if (result.state === "unchanged") counts.unchanged += 1;
          else counts.skipped += 1;
        } catch {
          counts.skipped += 1;
        }
      }
    }
    for (const season of allSeasons) {
      const weeks = await ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect();
      const finalWeek = [...weeks].sort(
        (left, right) => asNumber(right.weekNum) - asNumber(left.weekNum),
      )[0];
      if (!finalWeek) continue;
      const analysisSeason = nextChronologicalSeason(allSeasons, season);
      for (const milestone of milestoneSchedule(
        analysisSeason,
        finalWeek,
      ).filter((item) => item.scheduledFor <= today)) {
        counts.processed += 1;
        try {
          const result = await generateMilestoneForSeason(
            ctx,
            season,
            finalWeek,
            milestone.issueType,
            milestone.scheduledFor,
          );
          if (result.state === "inserted") counts.inserted += 1;
          else if (result.state === "updated") counts.updated += 1;
          else if (result.state === "unchanged") counts.unchanged += 1;
          else counts.skipped += 1;
        } catch {
          counts.skipped += 1;
        }
      }
    }
    await ctx.db.patch(args.runId, {
      progress: counts,
      heartbeatAt: Date.now(),
    });
    return { cancelled: false, apply: true, counts };
  },
});

export const scanDueMilestones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = dateKey(Date.now());
    const seasons = await ctx.db.query("seasons").collect();
    const result = {
      processed: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    };
    for (const season of seasons) {
      const weeks = await ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect();
      const finalWeek = [...weeks].sort(
        (left, right) => asNumber(right.weekNum) - asNumber(left.weekNum),
      )[0];
      if (!finalWeek) continue;
      const analysisSeason = nextChronologicalSeason(seasons, season);
      for (const milestone of milestoneSchedule(
        analysisSeason,
        finalWeek,
      ).filter((item) => item.scheduledFor <= today)) {
        result.processed += 1;
        try {
          const generated = await generateMilestoneForSeason(
            ctx,
            season,
            finalWeek,
            milestone.issueType,
            milestone.scheduledFor,
          );
          if (generated.state === "inserted") result.inserted += 1;
          else if (generated.state === "updated") result.updated += 1;
          else if (generated.state === "unchanged") result.unchanged += 1;
          else result.skipped += 1;
        } catch {
          result.skipped += 1;
        }
      }
    }
    return result;
  },
});
