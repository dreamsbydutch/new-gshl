/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-optional-chain */
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCommissioner } from "./lib/auth";
import { buildLeagueActivity } from "../src/lib/utils/features/league-activity";
import type { ContractStatus, WeeklyEditionIssueType } from "../src/lib/types";
import { ContractStatus as ContractStatusValues } from "../src/lib/utils/domain/constants";
import {
  buildWeeklyEditionCareerRecordFacts,
  buildMilestoneEditionFactPacket,
  buildTemplateWeeklyEdition,
  buildWeeklyEditionMilestoneFacts,
  buildWeeklyEditionMilestoneSchedule,
  buildWeeklyEditionCategoryMargins,
  buildWeeklyEditionChatGptPrompt,
  buildWeeklyEditionFactPacket,
  buildWeeklyEditionPeriodRecordFacts,
  hashWeeklyEditionSource,
  isWeeklyEditionPlayingContract,
  validateWeeklyEditionContent,
  validateWeeklyEditionImport,
  weeklyEditionContractAffectsSeason,
} from "../src/lib/utils/features/weekly-edition";
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
const descendingTimestamp = (
  left: { publishedAt?: unknown },
  right: { publishedAt?: unknown },
) =>
  (toUtcTimestamp(right.publishedAt) ?? 0) -
  (toUtcTimestamp(left.publishedAt) ?? 0);
const publicRow = <Row extends { _id: string }>(
  row: Row | null,
): PublicRow<Row> | null => {
  if (!row) return null;
  const output: Record<string, unknown> = { ...row, id: row._id };
  delete output._id;
  delete output._creationTime;
  for (const field of PUBLIC_TIMESTAMP_FIELDS) {
    if (!(field in output)) continue;
    const timestamp = toUtcTimestamp(output[field]);
    if (timestamp === null) {
      throw new Error(`Weekly edition ${field} is not a valid UTC timestamp`);
    }
    output[field] = timestamp;
  }
  return output as PublicRow<Row>;
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
  const [teams, franchises, matchups, playerWeekRows, currentPower, weeks] =
    await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect(),
      ctx.db.query("franchises").collect(),
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
    allTeams,
    allMatchups,
    allTeamWeeks,
    teamSeasonRows,
    careerSplits,
    playerAwards,
    teamAwards,
    playerTotals,
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
    ctx.db.query("teams").collect(),
    ctx.db.query("matchups").collect(),
    ctx.db.query("teamWeekStatLines").collect(),
    ctx.db.query("teamSeasonStatLines").collect(),
    ctx.db.query("playerCareerSplitStatLines").collect(),
    ctx.db
      .query("playerAwards")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db
      .query("teamAwards")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect(),
    ctx.db.query("playerTotalStatLines").collect(),
  ]);

  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise._id), franchise]),
  );
  const teamById = new Map(
    teams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
        },
      ];
    }),
  );
  const allTeamById = new Map(
    allTeams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          franchiseId: String(team.franchiseId),
          franchiseName: franchise?.name ?? "Unknown team",
          ownerId: String(franchise?.ownerId ?? ""),
          seasonId: String(team.seasonId),
        },
      ];
    }),
  );
  const currentTeamByOwnerId = new Map(
    [...teamById.entries()].map(([teamId, team]) => {
      const source = allTeamById.get(teamId);
      return [
        source?.ownerId ?? "",
        { ...team, franchiseId: source?.franchiseId ?? "" },
      ];
    }),
  );
  const playerById = new Map(
    players.map((player) => [String(player._id), player]),
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

  const careerByFranchisePlayer = new Map<
    string,
    {
      id: string;
      entityType: "player";
      period: "career";
      periodId: string;
      playerId: string;
      playerName: string;
      franchiseId: string;
      franchiseName: string;
      metrics: Record<string, number>;
      deltaMetrics: Record<string, number>;
    }
  >();
  for (const row of careerSplits.filter(
    (item) => String(item.seasonType) === "RS",
  )) {
    const team = allTeamById.get(String(row.gshlTeamId));
    if (!team) continue;
    const playerId = String(row.playerId);
    const key = `${team.franchiseId}:${playerId}`;
    const current = careerByFranchisePlayer.get(key) ?? {
      id: key,
      entityType: "player" as const,
      period: "career" as const,
      periodId: "career",
      playerId,
      playerName: playerById.get(playerId)?.fullName ?? "Unknown player",
      franchiseId: team.franchiseId,
      franchiseName: team.franchiseName,
      metrics: {},
      deltaMetrics: {},
    };
    for (const stat of EDITORIAL_STAT_KEYS) {
      current.metrics[stat] =
        (current.metrics[stat] ?? 0) + asNumber(row[stat]);
    }
    careerByFranchisePlayer.set(key, current);
  }
  for (const row of playerWeekRows) {
    const team = allTeamById.get(String(row.gshlTeamId));
    const snapshot = team
      ? careerByFranchisePlayer.get(
          `${team.franchiseId}:${String(row.playerId)}`,
        )
      : undefined;
    if (!snapshot) continue;
    snapshot.deltaMetrics = editorialMetrics(row);
  }
  const franchiseCareerSnapshots = [...careerByFranchisePlayer.values()];
  const leagueCareerByPlayer = new Map<
    string,
    (typeof franchiseCareerSnapshots)[number]
  >();
  for (const snapshot of franchiseCareerSnapshots) {
    const existing = leagueCareerByPlayer.get(snapshot.playerId) ?? {
      ...snapshot,
      id: `league:${snapshot.playerId}`,
      franchiseId: "",
      franchiseName: "",
      metrics: {},
      deltaMetrics: {},
    };
    for (const stat of EDITORIAL_STAT_KEYS) {
      existing.metrics[stat] =
        (existing.metrics[stat] ?? 0) + (snapshot.metrics[stat] ?? 0);
      existing.deltaMetrics[stat] =
        (existing.deltaMetrics[stat] ?? 0) + (snapshot.deltaMetrics[stat] ?? 0);
    }
    leagueCareerByPlayer.set(snapshot.playerId, existing);
  }
  const careerRecords = [
    ...buildWeeklyEditionCareerRecordFacts({
      snapshots: franchiseCareerSnapshots,
      metricLabels: EDITORIAL_CAREER_RECORD_LABELS,
      recordScopes: ["franchise"],
    }),
    ...buildWeeklyEditionCareerRecordFacts({
      snapshots: [...leagueCareerByPlayer.values()],
      metricLabels: EDITORIAL_CAREER_RECORD_LABELS,
      recordScopes: ["league"],
    }),
  ];

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
    teams: [...teamById.values()],
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
    players,
    contracts,
    draftPicks,
    weeks,
    teamWeekRows,
    finalMatchups,
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
    ctx.db
      .query("matchups")
      .withIndex("by_weekId", (q) => q.eq("weekId", anchorWeek._id))
      .collect(),
    ctx.db
      .query("playerWeekStatLines")
      .withIndex("by_weekId", (q) => q.eq("weekId", anchorWeek._id))
      .collect(),
  ]);
  if (teams.length === 0) throw new Error("Season teams are not available");
  if (
    issueType === "final_recap" &&
    (finalMatchups.length === 0 ||
      finalMatchups.some((matchup) => !matchup.isComplete))
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
  const teamById = new Map(
    teams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
          ownerId: String(franchise?.ownerId ?? ""),
        },
      ];
    }),
  );
  const sourceTeamById = new Map(
    sourceTeams.map((team) => {
      const franchise = franchiseById.get(String(team.franchiseId));
      return [
        String(team._id),
        {
          teamId: String(team._id),
          name: franchise?.name ?? "Unknown team",
          abbr: franchise?.abbr ?? "GSHL",
          logoUrl: franchise?.logoUrl ?? undefined,
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
  const relevantContracts = teamContracts.filter((contract) =>
    weeklyEditionContractAffectsSeason(
      contract,
      analysisContractSeason,
      contractSeasons,
    ),
  );
  const expiringRows = teamContracts.filter(
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
  const recentRows = teamContracts.filter((contract) => {
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
  const contractFact = (contract: Doc<"contracts">) => ({
    contractId: String(contract._id),
    playerName:
      playerById.get(String(contract.playerId))?.fullName ?? "Unknown player",
    teamName:
      teamByOwnerId.get(String(contract.ownerId))?.name ?? "Unknown team",
    salary: asNumber(contract.capHit ?? contract.contractSalary),
    expiryStatus: String(contract.expiryStatus ?? ""),
    expiryDate: dateKey(contract.expiryDate),
  });
  const draftFacts = draftPicks.map((pick) => ({
    pickId: String(pick._id),
    teamName: teamById.get(String(pick.gshlTeamId))?.name ?? "Unknown team",
    round: asNumber(pick.round),
    pick:
      pick.pick === null || pick.pick === undefined
        ? undefined
        : asNumber(pick.pick),
    selectedPlayerName: pick.playerId
      ? playerById.get(String(pick.playerId))?.fullName
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
    const ratings = roster
      .map((player) =>
        asNumber(player.overallRating ?? player.seasonRating ?? 0),
      )
      .filter((rating) => rating > 0);
    const ownerContracts = relevantContracts.filter(
      (contract) => String(contract.ownerId) === team.ownerId,
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
      capSpace: Math.max(0, 25_000_000 - committedSalary),
      committedSalary,
      rosterSize: roster.length,
      rosterTalent:
        ratings.length > 0
          ? ratings.reduce((total, rating) => total + rating, 0) /
            ratings.length
          : asNumber(latestPowerByTeam.get(team.teamId)?.powerTalent),
      expiringCount: expiringRows.filter(
        (contract) => String(contract.ownerId) === team.ownerId,
      ).length,
      draftPickCount: teamDraftPicks.length,
      firstRoundPickCount: teamDraftPicks.filter(
        (pick) => asNumber(pick.round) === 1,
      ).length,
    };
  });
  const currentPowerByTeam = new Map(
    [...latestPowerByTeam.entries()].map(([teamId, row]) => [teamId, row]),
  );
  const finalEditorialCandidates =
    issueType === "final_recap"
      ? (await buildSource(ctx, season, anchorWeek)).editorialCandidates
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
        ? finalMatchups.map((matchup) => ({
            matchupId: String(matchup._id),
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
                currentPowerByTeam.get(String(matchup.homeTeamId)) ?? {},
              awayStats:
                currentPowerByTeam.get(String(matchup.awayTeamId)) ?? {},
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
    })),
    teamOutlooks,
    expiringContracts: expiringRows.map(contractFact),
    recentSignings: recentRows.map(contractFact),
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
  args: { seasonId: v.optional(v.id("seasons")) },
  handler: async (ctx, args) => {
    const seasonId = args.seasonId;
    if (seasonId) {
      const rows = await ctx.db.query("weeklyEditions").collect();
      return publicRow(
        rows
          .filter(
            (row) => row.seasonId === seasonId && row.status === "published",
          )
          .sort(descendingTimestamp)[0] ?? null,
      );
    }
    const rows = await ctx.db.query("weeklyEditions").collect();
    return publicRow(
      rows
        .filter((row) => row.status === "published")
        .sort(descendingTimestamp)[0] ?? null,
    );
  },
});

export const publishedArchive = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("weeklyEditions").collect();
    return rows
      .filter(
        (row) =>
          row.status === "published" &&
          (!args.seasonId || row.seasonId === args.seasonId),
      )
      .sort(descendingTimestamp)
      .slice(0, Math.min(Math.max(args.limit ?? 40, 1), 100))
      .map(publicRow);
  },
});

export const publishedById = query({
  args: { editionId: v.id("weeklyEditions") },
  handler: async (ctx, args) => {
    const edition = await ctx.db.get(args.editionId);
    return edition?.status === "published" ? publicRow(edition) : null;
  },
});

export const newsroom = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return (await ctx.db.query("weeklyEditions").order("desc").take(100)).map(
      publicRow,
    );
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
      .collect();
    return rows
      .sort(
        (left, right) =>
          (toUtcTimestamp(right.createdAt) ?? 0) -
          (toUtcTimestamp(left.createdAt) ?? 0),
      )
      .map(publicRow);
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

export const generateHistorical = mutation({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    issueType: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("final_recap"),
        v.literal("resigning_outlook"),
        v.literal("offseason_market"),
        v.literal("pre_draft"),
        v.literal("preseason"),
      ),
    ),
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
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return publicRow(await ctx.db.get(args.editionId));
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
