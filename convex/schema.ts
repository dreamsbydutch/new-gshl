import { defineSchema, defineTable } from "convex/server";
import { v, type GenericValidator } from "convex/values";

type TableShape = Record<string, GenericValidator>;

const id = (tableName: string) => v.id(tableName);
const nullable = <T extends GenericValidator>(validator: T) =>
  v.union(validator, v.null());
const optional = <T extends GenericValidator>(validator: T) =>
  v.optional(validator);
const optionalNullable = <T extends GenericValidator>(validator: T) =>
  v.optional(nullable(validator));

const legacyId = optional(v.string());
const stringValue = v.string();
const optionalString = optional(v.string());
const optionalNullableString = optionalNullable(v.string());
const numberValue = v.number();
const optionalNullableNumber = optionalNullable(v.number());
const boolValue = v.boolean();
const optionalNullableBool = optionalNullable(v.boolean());
const stringArray = v.array(v.string());
const optionalNullableStringArray = optionalNullable(stringArray);
const statValue = optional(v.union(v.number(), v.string(), v.null()));
const ratingValue = optional(v.union(v.number(), v.string(), v.null()));
const timestampValue = optionalNullableString;
const dateOnlyValue = optionalNullableString;

const statFields = {
  days: statValue,
  GP: statValue,
  MG: statValue,
  IR: statValue,
  IRplus: statValue,
  GS: statValue,
  G: statValue,
  A: statValue,
  P: statValue,
  PM: statValue,
  PIM: statValue,
  PPP: statValue,
  SOG: statValue,
  HIT: statValue,
  BLK: statValue,
  W: statValue,
  GA: statValue,
  GAA: statValue,
  SV: statValue,
  SA: statValue,
  SVP: statValue,
  SO: statValue,
  TOI: statValue,
  Rating: ratingValue,
  ADD: statValue,
  MS: statValue,
  BS: statValue,
  createdAt: timestampValue,
  updatedAt: timestampValue,
} satisfies TableShape;

const skaterGoalieStatFields = {
  GP: statValue,
  G: statValue,
  A: statValue,
  P: statValue,
  PM: statValue,
  PIM: statValue,
  PPP: statValue,
  SOG: statValue,
  HIT: statValue,
  BLK: statValue,
  W: statValue,
  GA: statValue,
  GAA: statValue,
  SV: statValue,
  SA: statValue,
  SVP: statValue,
  SO: statValue,
  QS: statValue,
  RBS: statValue,
  TOI: statValue,
} satisfies TableShape;

function table(
  fields: TableShape,
  indexes: readonly (string | readonly string[])[] = [],
) {
  let definition = defineTable({
    legacyId,
    ...fields,
  }).index("by_legacyId", ["legacyId"]);

  for (const index of indexes) {
    const fields = typeof index === "string" ? [index] : [...index];
    definition = definition.index(
      `by_${fields.join("_")}` as never,
      fields as never,
    );
  }

  return definition;
}

export default defineSchema({
  authUsers: defineTable({
    googleSubject: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    role: v.union(
      v.literal("viewer"),
      v.literal("owner"),
      v.literal("commissioner"),
    ),
    ownerId: v.optional(id("owners")),
    status: v.union(v.literal("active"), v.literal("disabled")),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastLoginAt: v.string(),
  })
    .index("by_googleSubject", ["googleSubject"])
    .index("by_email", ["email"])
    .index("by_ownerId", ["ownerId"]),

  seasons: table({
    year: stringValue,
    name: stringValue,
    categories: stringArray,
    rosterSpots: stringArray,
    startDate: dateOnlyValue,
    endDate: dateOnlyValue,
    isActive: boolValue,
    usesLegacyTies: boolValue,
    signingEndDate: dateOnlyValue,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  }),

  conferences: table({
    name: stringValue,
    logoUrl: optionalNullableString,
    abbr: stringValue,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  }),

  owners: table({
    firstName: stringValue,
    lastName: stringValue,
    nickName: optionalNullableString,
    email: optionalNullableString,
    owing: numberValue,
    isActive: boolValue,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  }),

  franchises: table(
    {
      ownerId: id("owners"),
      name: stringValue,
      abbr: stringValue,
      logoUrl: optionalNullableString,
      confId: id("conferences"),
      isActive: boolValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["ownerId", "confId"],
  ),

  teams: table(
    {
      seasonId: id("seasons"),
      franchiseId: id("franchises"),
      yahooId: optionalNullableString,
      confId: id("conferences"),
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "franchiseId", "confId", ["seasonId", "franchiseId"]],
  ),

  players: table(
    {
      yahooId: optionalNullableString,
      firstName: stringValue,
      lastName: stringValue,
      fullName: stringValue,
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      isActive: boolValue,
      isSignable: boolValue,
      isResignable: v.union(v.boolean(), v.string(), v.null()),
      preDraftRk: statValue,
      seasonRk: statValue,
      seasonRating: statValue,
      overallRk: statValue,
      overallRating: statValue,
      salary: statValue,
      age: statValue,
      birthday: dateOnlyValue,
      country: optionalNullableString,
      handedness: optionalNullableString,
      jerseyNum: optional(v.union(v.number(), v.string(), v.null())),
      weight: optional(v.union(v.number(), v.string(), v.null())),
      height: optionalNullableString,
      lineupPos: optionalNullableString,
      gshlTeamId: optionalNullable(id("teams")),
      nhlContractStatus: optionalNullableString,
      nhlContractLength: optionalNullableString,
      nhlCapHit: statValue,
      nhlClauses: optionalNullableString,
      nhlStartYear: optionalNullableString,
      nhlSigningStatus: optionalNullableString,
      nhlExpiryYear: optionalNullableString,
      nhlExpiryStatus: optionalNullableString,
      createdAt: timestampValue,
      updatedAt: timestampValue,
      nhlApiId: optionalNullableString,
    },
    ["gshlTeamId"],
  ),

  contracts: table(
    {
      playerId: id("players"),
      ownerId: id("owners"),
      seasonId: id("seasons"),
      contractType: stringValue,
      contractLength: statValue,
      contractSalary: statValue,
      signingDate: dateOnlyValue,
      startDate: dateOnlyValue,
      signingStatus: optionalNullableString,
      expiryStatus: optionalNullableString,
      expiryDate: dateOnlyValue,
      capHit: optional(v.union(v.number(), v.string(), v.null())),
      capHitEndDate: dateOnlyValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["playerId", "ownerId", "seasonId"],
  ),

  weeks: table(
    {
      seasonId: id("seasons"),
      weekNum: v.union(v.number(), v.string()),
      weekType: stringValue,
      gameDays: v.union(v.number(), v.string()),
      startDate: dateOnlyValue,
      endDate: dateOnlyValue,
      isActive: boolValue,
      isPlayoffs: boolValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", ["seasonId", "weekNum"], ["seasonId", "startDate"]],
  ),

  matchups: table(
    {
      seasonId: id("seasons"),
      weekId: id("weeks"),
      homeTeamId: id("teams"),
      awayTeamId: id("teams"),
      gameType: stringValue,
      homeRank: optionalNullableNumber,
      awayRank: optionalNullableNumber,
      homeScore: optionalNullableNumber,
      awayScore: optionalNullableNumber,
      homeWin: optionalNullableBool,
      awayWin: optionalNullableBool,
      tie: optionalNullableBool,
      isComplete: optionalNullableBool,
      rating: optionalNullableNumber,
      ratingPre: ratingValue,
      ratingRealized: ratingValue,
      ratingCompetitive: ratingValue,
      ratingImportance: ratingValue,
      ratingRosterStrength: ratingValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    [
      "seasonId",
      "weekId",
      "homeTeamId",
      "awayTeamId",
      ["seasonId", "weekId"],
      ["seasonId", "homeTeamId"],
      ["seasonId", "awayTeamId"],
    ],
  ),

  events: table(
    {
      seasonId: id("seasons"),
      name: stringValue,
      description: optionalNullableString,
      date: dateOnlyValue,
      type: stringValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "date"],
  ),

  awards: table(
    {
      seasonId: id("seasons"),
      winnerId: id("players"),
      nomineeIds: optionalNullable(v.array(id("players"))),
      award: stringValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "winnerId"],
  ),

  playerAwards: table(
    {
      seasonId: id("seasons"),
      playerId: id("players"),
      nomineeIds: optionalNullable(v.array(id("players"))),
      award: stringValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "playerId"],
  ),

  teamAwards: table(
    {
      seasonId: id("seasons"),
      teamId: id("teams"),
      nomineeIds: optionalNullable(v.array(id("teams"))),
      award: stringValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "teamId"],
  ),

  draftPicks: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: optionalNullable(id("teams")),
      originalTeamId: optionalNullable(id("teams")),
      round: v.union(v.number(), v.string()),
      pick: statValue,
      playerId: optionalNullable(id("players")),
      isTraded: boolValue,
      isSigning: boolValue,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "gshlTeamId", "playerId"],
  ),

  nhlTeams: table({
    name: stringValue,
    abbr: optionalString,
    fullName: optionalString,
    abbreviation: optionalString,
    logoUrl: optionalNullableString,
    createdAt: timestampValue,
    updatedAt: timestampValue,
  }),

  playerDayStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: id("teams"),
      playerId: id("players"),
      weekId: id("weeks"),
      date: dateOnlyValue,
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      dailyPos: optionalNullableString,
      bestPos: optionalNullableString,
      fullPos: optionalNullableString,
      opp: optionalNullableString,
      score: optionalNullableString,
      ...statFields,
    },
    [
      "seasonId",
      "gshlTeamId",
      "playerId",
      "weekId",
      "date",
      ["seasonId", "date"],
      ["seasonId", "weekId", "gshlTeamId"],
      ["seasonId", "playerId", "date"],
    ],
  ),

  playerWeekStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: id("teams"),
      playerId: id("players"),
      weekId: id("weeks"),
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      ...statFields,
    },
    [
      "seasonId",
      "gshlTeamId",
      "playerId",
      "weekId",
      ["seasonId", "weekId", "gshlTeamId"],
      ["seasonId", "playerId"],
    ],
  ),

  playerSplitStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: id("teams"),
      playerId: id("players"),
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      seasonType: stringValue,
      ...statFields,
    },
    [
      "seasonId",
      "gshlTeamId",
      "playerId",
      "seasonType",
      ["seasonId", "seasonType", "gshlTeamId", "playerId"],
    ],
  ),

  playerTotalStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamIds: optionalNullable(v.array(id("teams"))),
      playerId: id("players"),
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      seasonType: stringValue,
      ...statFields,
    },
    [
      "seasonId",
      "playerId",
      "seasonType",
      ["seasonId", "seasonType", "playerId"],
    ],
  ),

  playerCareerSplitStatLines: table(
    {
      gshlTeamId: id("teams"),
      playerId: id("players"),
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      seasonType: stringValue,
      ...statFields,
    },
    ["gshlTeamId", "playerId", "seasonType"],
  ),

  playerCareerTotalStatLines: table(
    {
      gshlTeamIds: optionalNullable(v.array(id("teams"))),
      playerId: id("players"),
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      seasonType: stringValue,
      ...statFields,
    },
    ["playerId", "seasonType"],
  ),

  playerNhlStatLines: table(
    {
      seasonId: id("seasons"),
      playerId: stringValue,
      nhlPos: optionalNullableStringArray,
      posGroup: stringValue,
      nhlTeam: optionalNullableStringArray,
      age: optional(v.union(v.number(), v.string(), v.null())),
      ...skaterGoalieStatFields,
      seasonRating: optionalNullableNumber,
      overallRating: optionalNullableNumber,
      salary: optionalNullableNumber,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
    ["seasonId", "playerId", ["seasonId", "playerId"]],
  ),

  teamDayStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: id("teams"),
      weekId: id("weeks"),
      date: dateOnlyValue,
      ...statFields,
    },
    [
      "seasonId",
      "gshlTeamId",
      "weekId",
      "date",
      ["seasonId", "date"],
      ["seasonId", "weekId", "gshlTeamId"],
    ],
  ),

  teamWeekStatLines: table(
    {
      seasonId: id("seasons"),
      gshlTeamId: id("teams"),
      weekId: id("weeks"),
      ...statFields,
      powerRating: optionalNullableNumber,
      powerElo: optionalNullableNumber,
      powerEloPre: optionalNullableNumber,
      powerEloPost: optionalNullableNumber,
      powerEloDelta: optionalNullableNumber,
      powerEloExpected: optionalNullableNumber,
      powerEloK: optionalNullableNumber,
      powerStatScore: optionalNullableNumber,
      powerStatEwma: optionalNullableNumber,
      powerTalent: optionalNullableNumber,
      powerHistoryPrior: optionalNullableNumber,
      powerComposite: optionalNullableNumber,
      powerRk: optionalNullableNumber,
    },
    ["seasonId", "gshlTeamId", "weekId", ["seasonId", "weekId", "gshlTeamId"]],
  ),

  teamSeasonStatLines: table(
    {
      seasonId: id("seasons"),
      seasonType: stringValue,
      gshlTeamId: id("teams"),
      ...statFields,
      streak: optionalNullableString,
      powerRk: optionalNullableNumber,
      teamW: optionalNullableNumber,
      teamHW: optionalNullableNumber,
      teamHL: optionalNullableNumber,
      teamL: optionalNullableNumber,
      teamT: optionalNullableNumber,
      teamCCW: optionalNullableNumber,
      teamCCHW: optionalNullableNumber,
      teamCCHL: optionalNullableNumber,
      teamCCL: optionalNullableNumber,
      teamCCT: optionalNullableNumber,
      overallRk: optionalNullableNumber,
      conferenceRk: optionalNullableNumber,
      wildcardRk: optionalNullableNumber,
      playersUsed: statValue,
      hartRating: ratingValue,
      hartRk: optionalNullableNumber,
      norrisRating: ratingValue,
      norrisRk: optionalNullableNumber,
      vezinaRating: ratingValue,
      vezinaRk: optionalNullableNumber,
      calderRating: ratingValue,
      calderRk: optionalNullableNumber,
      jackAdamsRating: ratingValue,
      jackAdamsRk: optionalNullableNumber,
      GMOYRating: ratingValue,
      GMOYRk: optionalNullableNumber,
    },
    [
      "seasonId",
      "seasonType",
      "gshlTeamId",
      ["seasonId", "seasonType", "gshlTeamId"],
    ],
  ),

  jobRuns: defineTable({
    jobName: v.string(),
    args: v.any(),
    apply: v.boolean(),
    mode: v.union(
      v.literal("manual"),
      v.literal("scheduled"),
      v.literal("pipeline"),
      v.literal("retry"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting_external"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelling"),
      v.literal("cancelled"),
    ),
    lockKey: v.string(),
    progress: v.optional(v.any()),
    cursor: v.optional(v.string()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    parentRunId: v.optional(id("jobRuns")),
    pipelineStage: v.optional(v.number()),
    attempt: v.number(),
    requestedBy: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    heartbeatAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_jobName_createdAt", ["jobName", "createdAt"])
    .index("by_lockKey_status", ["lockKey", "status"])
    .index("by_parentRunId", ["parentRunId"]),

  jobEvents: defineTable({
    runId: id("jobRuns"),
    level: v.union(
      v.literal("debug"),
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
    ),
    message: v.string(),
    data: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_runId_createdAt", ["runId", "createdAt"]),

  jobSchedules: defineTable({
    name: v.string(),
    jobName: v.string(),
    args: v.any(),
    apply: v.boolean(),
    enabled: v.boolean(),
    intervalMinutes: v.number(),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    lastRunId: v.optional(id("jobRuns")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_enabled_nextRunAt", ["enabled", "nextRunAt"])
    .index("by_name", ["name"]),

  externalTasks: defineTable({
    runId: id("jobRuns"),
    kind: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("leased"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    leaseOwner: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    heartbeatAt: v.optional(v.number()),
    resultChunks: v.optional(v.array(v.any())),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_runId", ["runId"]),

  jobArtifacts: defineTable({
    runId: id("jobRuns"),
    storageId: id("_storage"),
    kind: v.string(),
    name: v.string(),
    contentType: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_runId", ["runId"]),
});
