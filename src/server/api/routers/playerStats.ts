import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter, canUpdatePlayerDay } from "@gshl-sheets";
import { baseQuerySchema } from "./_schemas";
import {
  RosterPosition,
  PositionGroup,
  type Week,
  type PlayerDayStatLine,
  type PlayerSplitStatLine,
  type PlayerTotalStatLine,
  type PlayerWeekStatLine,
  type AggregationConfig,
} from "@gshl-types";

// Player stats schemas
const playerStatsWhereSchema = z
  .object({
    playerId: z.string().optional(),
    seasonId: z.string().optional(),
    weekId: z.string().optional(),
    teamId: z.string().optional(),
    position: z.string().optional(),
  })
  .optional();

/**
 * Complete PlayerDay creation schema matching all 46 fields of PlayerDayStatLine.
 * All stats stored as strings. Position fields use enums.
 */
const playerDayStatsCreateSchema = z.object({
  // Core identifiers (required)
  playerId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  gshlTeamId: z.string(),
  date: z.date(),

  // Position & game info
  nhlPos: z.array(z.nativeEnum(RosterPosition)).default([]),
  posGroup: z.nativeEnum(PositionGroup),
  nhlTeam: z.string(),
  dailyPos: z.union([z.nativeEnum(RosterPosition), z.string()]).default("BN"),
  bestPos: z.union([z.nativeEnum(RosterPosition), z.string()]).default("BN"),
  fullPos: z.union([z.nativeEnum(RosterPosition), z.string()]).default("BN"),
  opp: z.string().optional(),
  score: z.string().optional(),

  // Skater stats (optional - only present if game played)
  GP: z.string().optional(),
  MG: z.string().optional(),
  IR: z.string().optional(),
  IRplus: z.string().optional(),
  GS: z.string().optional(),
  G: z.string().optional(),
  A: z.string().optional(),
  P: z.string().optional(),
  PM: z.string().optional(),
  PIM: z.string().optional(),
  PPP: z.string().optional(),
  SOG: z.string().optional(),
  HIT: z.string().optional(),
  BLK: z.string().optional(),

  // Goalie stats (optional - only present if game played)
  W: z.string().optional(),
  GA: z.string().optional(),
  GAA: z.string().optional(),
  SV: z.string().optional(),
  SA: z.string().optional(),
  SVP: z.string().optional(),
  SO: z.string().optional(),
  TOI: z.string().optional(),

  // Calculated stats (optional - computed separately)
  Rating: z.string().optional(),
  ADD: z.string().optional(),
  MS: z.string().optional(),
  BS: z.string().optional(),
});

/**
 * Complete PlayerDay update schema.
 * All fields optional except id. Validates date is within ±1 day window.
 * Use with playerDayAdapter.update() which enforces time-based validation.
 */
const playerDayStatsUpdateSchema = z.object({
  // ID required for updates
  id: z.string(),

  // Core identifiers (optional for updates)
  playerId: z.string().optional(),
  seasonId: z.string().optional(),
  weekId: z.string().optional(),
  gshlTeamId: z.string().optional(),
  date: z.date().optional(),

  // Position & game info
  nhlPos: z.array(z.nativeEnum(RosterPosition)).optional(),
  posGroup: z.nativeEnum(PositionGroup).optional(),
  nhlTeam: z.string().optional(),
  dailyPos: z.union([z.nativeEnum(RosterPosition), z.string()]).optional(),
  bestPos: z.union([z.nativeEnum(RosterPosition), z.string()]).optional(),
  fullPos: z.union([z.nativeEnum(RosterPosition), z.string()]).optional(),
  opp: z.string().optional(),
  score: z.string().optional(),

  // Skater stats (all optional strings)
  GP: z.string().optional(),
  MG: z.string().optional(),
  IR: z.string().optional(),
  IRplus: z.string().optional(),
  GS: z.string().optional(),
  G: z.string().optional(),
  A: z.string().optional(),
  P: z.string().optional(),
  PM: z.string().optional(),
  PIM: z.string().optional(),
  PPP: z.string().optional(),
  SOG: z.string().optional(),
  HIT: z.string().optional(),
  BLK: z.string().optional(),

  // Goalie stats (all optional strings)
  W: z.string().optional(),
  GA: z.string().optional(),
  GAA: z.string().optional(),
  SV: z.string().optional(),
  SA: z.string().optional(),
  SVP: z.string().optional(),
  SO: z.string().optional(),
  TOI: z.string().optional(),

  // Calculated stats (all optional strings)
  Rating: z.string().optional(),
  ADD: z.string().optional(),
  MS: z.string().optional(),
  BS: z.string().optional(),
});

const playerWeekStatsCreateSchema = z.object({
  playerId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  gshlTeamId: z.string(),
  position: z.string(),
  GP: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPG: z.string().default("0"),
  PPA: z.string().default("0"),
  SHG: z.string().default("0"),
  SHA: z.string().default("0"),
  GWG: z.string().default("0"),
  GTG: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  // Add other stat fields as needed
});

export const playerStatsRouter = createTRPCRouter({
  // Daily stats operations
  daily: createTRPCRouter({
    // Get all daily stats with filtering
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: playerStatsWhereSchema,
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "PlayerDayStatLine",
          input,
        ) as unknown as Promise<PlayerDayStatLine[]>;
      }),

    // Get daily stats by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
          weekId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerDayStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
            ...(input.weekId && { weekId: input.weekId }),
          },
        }) as unknown as Promise<PlayerDayStatLine[]>;
      }),

    // Get daily stats by week
    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerDayStatLine[]>;
      }),

    // Create daily stats
    create: publicProcedure
      .input(playerDayStatsCreateSchema)
      .mutation(async ({ input }): Promise<PlayerDayStatLine> => {
        return optimizedSheetsAdapter.create("PlayerDayStatLine", {
          data: input,
        }) as unknown as Promise<PlayerDayStatLine>;
      }),

    // Batch create daily stats
    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerDayStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("PlayerDayStatLine", {
          data: input.data,
        });
      }),

    // Update daily stats
    update: publicProcedure
      .input(playerDayStatsUpdateSchema)
      .mutation(async ({ input }): Promise<PlayerDayStatLine> => {
        const { id, ...data } = input;
        return optimizedSheetsAdapter.update("PlayerDayStatLine", {
          where: { id },
          data,
        }) as unknown as Promise<PlayerDayStatLine>;
      }),

    // Batch update daily stats
    updateMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerDayStatsUpdateSchema),
        }),
      )
      .mutation(
        async ({ input }): Promise<{ count: number; errors: string[] }> => {
          const results = await Promise.allSettled(
            input.data.map(async (record) => {
              const { id, ...data } = record;
              return optimizedSheetsAdapter.update("PlayerDayStatLine", {
                where: { id },
                data,
              });
            }),
          );

          const errors: string[] = [];
          let successCount = 0;

          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              successCount++;
            } else {
              errors.push(
                `Record ${index} (id: ${input.data[index]?.id}): ${result.reason}`,
              );
            }
          });

          return { count: successCount, errors };
        },
      ),

    // Upsert (create or update) daily stats with duplicate prevention
    // Automatically detects if a player already has a record for that date
    // and converts it to an update instead of creating a duplicate
    upsert: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string(),
          date: z.date(),
          data: playerDayStatsCreateSchema.omit({
            playerId: true,
            seasonId: true,
            date: true,
          }),
        }),
      )
      .mutation(async ({ input }): Promise<PlayerDayStatLine> => {
        const { playerId, seasonId, date, data } = input;

        // Check if record already exists for this player/date
        const existing = (await optimizedSheetsAdapter.findMany(
          "PlayerDayStatLine",
          {
            where: {
              playerId,
              seasonId,
              date: date.toISOString().split("T")[0], // Convert to date string
            },
            take: 1,
          },
        )) as unknown as PlayerDayStatLine[];

        if (existing.length > 0) {
          // Record exists - perform update
          const existingRecord = existing[0]!;
          return optimizedSheetsAdapter.update("PlayerDayStatLine", {
            where: { id: existingRecord.id },
            data: { ...data, playerId, seasonId, date },
          }) as unknown as Promise<PlayerDayStatLine>;
        } else {
          // No existing record - perform create
          return optimizedSheetsAdapter.create("PlayerDayStatLine", {
            data: { ...data, playerId, seasonId, date },
          }) as unknown as Promise<PlayerDayStatLine>;
        }
      }),

    // Batch upsert with automatic duplicate prevention and validation
    upsertMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerDayStatsCreateSchema),
          dryRun: z.boolean().optional().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          created: number;
          updated: number;
          rejected: Array<{ record: unknown; reason: string }>;
          errors: string[];
        }> => {
          const { data, dryRun } = input;
          const errors: string[] = [];
          const rejected: Array<{ record: unknown; reason: string }> = [];
          let created = 0;
          let updated = 0;

          // Collect records to batch create/update
          const recordsToCreate: Array<Omit<(typeof data)[0], "dateKey">> = [];
          const recordsToUpdate: Array<{
            id: string;
            data: Omit<(typeof data)[0], "dateKey">;
          }> = [];

          // Group records by seasonId for efficient querying
          const recordsByPlayer = new Map<
            string,
            Array<(typeof data)[0] & { dateKey: string }>
          >();

          for (const record of data) {
            const key = `${record.playerId}:${record.seasonId}`;
            const dateKey = record.date.toISOString().split("T")[0]!;

            if (!recordsByPlayer.has(key)) {
              recordsByPlayer.set(key, []);
            }
            recordsByPlayer.get(key)!.push({ ...record, dateKey });
          }

          // Process each player's records to categorize creates vs updates
          for (const [playerKey, records] of recordsByPlayer) {
            const [playerId, seasonId] = playerKey.split(":");

            try {
              // Fetch existing records for this player in this season
              const existingRecords = (await optimizedSheetsAdapter.findMany(
                "PlayerDayStatLine",
                {
                  where: { playerId, seasonId },
                },
              )) as unknown as PlayerDayStatLine[];

              // Build map of existing date keys to record IDs
              const existingByDate = new Map<string, string>();
              for (const existing of existingRecords) {
                const dateKey =
                  typeof existing.date === "string"
                    ? existing.date
                    : existing.date.toISOString().split("T")[0]!;
                existingByDate.set(dateKey, existing.id);
              }

              // Categorize each record
              for (const record of records) {
                const existingId = existingByDate.get(record.dateKey);
                const { dateKey: _omitDateKey, ...recordData } = record;
                void _omitDateKey;

                if (existingId) {
                  // Record exists - check if update is allowed
                  const validation = canUpdatePlayerDay(record.dateKey);

                  if (validation.allowed) {
                    recordsToUpdate.push({ id: existingId, data: recordData });
                    updated++;
                  } else {
                    // Update not allowed due to time window
                    rejected.push({
                      record: { playerId, date: record.dateKey },
                      reason:
                        validation.reason ??
                        "Update not allowed - outside ±1 day window",
                    });
                  }
                } else {
                  // No existing record - queue for creation
                  recordsToCreate.push(recordData);
                  created++;
                }
              }
            } catch (error) {
              errors.push(
                `Failed to process records for ${playerKey}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          // Batch create new records
          if (!dryRun && recordsToCreate.length > 0) {
            try {
              console.log(
                `📝 [PlayerStats] Batch creating ${recordsToCreate.length} records...`,
              );
              await optimizedSheetsAdapter.createMany("PlayerDayStatLine", {
                data: recordsToCreate,
              });
              console.log(
                `✅ [PlayerStats] Successfully created ${recordsToCreate.length} records`,
              );
            } catch (error) {
              errors.push(
                `Failed to batch create records: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          // Bulk update existing records using optimized bulk update
          if (!dryRun && recordsToUpdate.length > 0) {
            try {
              console.log(
                `📝 [PlayerStats] Bulk updating ${recordsToUpdate.length} records...`,
              );

              // Use new bulkUpdateByIds method which does all updates in parallel
              const result = await optimizedSheetsAdapter.bulkUpdateByIds(
                "PlayerDayStatLine",
                recordsToUpdate,
              );

              console.log(
                `✅ [PlayerStats] Successfully updated ${result.count} records`,
              );
            } catch (error) {
              errors.push(
                `Failed to bulk update records: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          return { created, updated, rejected, errors };
        },
      ),
  }),

  // Weekly stats operations
  weekly: createTRPCRouter({
    // Get all weekly stats with filtering
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: playerStatsWhereSchema,
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "PlayerWeekStatLine",
          input,
        ) as unknown as Promise<PlayerWeekStatLine[]>;
      }),

    // Get weekly stats by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerWeekStatLine[]>;
      }),

    // Get weekly stats by week
    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerWeekStatLine[]>;
      }),

    // Get leaderboard
    getLeaderboard: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          statType: z.enum(["G", "A", "P", "PIM", "PPG", "SOG", "HIT", "BLK"]),
          take: z.number().int().positive().max(100).default(25),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        }) as unknown as Promise<PlayerWeekStatLine[]>;
      }),

    // Create weekly stats
    create: publicProcedure
      .input(playerWeekStatsCreateSchema)
      .mutation(async ({ input }): Promise<PlayerWeekStatLine> => {
        return optimizedSheetsAdapter.create("PlayerWeekStatLine", {
          data: input,
        }) as unknown as Promise<PlayerWeekStatLine>;
      }),

    // Batch create weekly stats
    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerWeekStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("PlayerWeekStatLine", {
          data: input.data,
        });
      }),

    /**
     * Aggregate player day stats into player week stats and bulk insert.
     *
     * Takes all player day stat lines from a specified week and:
     * 1. Groups by playerId + weekId + gshlTeamId
     * 2. Sums stats only for days where GS = 1 (player was started)
     * 3. Always sums GP, MG, IR, ADD, MS, BS
     * 4. Combines NHL teams and positions into unique arrays
     * 5. Counts roster days (distinct dates)
     * 6. Bulk inserts into PlayerWeekStatLine table
     *
     * @returns Count of player week records created and summary
     */
    aggregateAndCreateFromDays: publicProcedure
      .input(
        z.object({
          weekId: z.string().describe("Week ID to aggregate stats for"),
          dryRun: z
            .boolean()
            .optional()
            .describe("If true, returns stats without inserting"),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: {
              totalPlayerDays: number;
              uniquePlayers: number;
              uniqueTeams: number;
              uniqueWeeks: number;
            };
            output: {
              totalPlayerWeeks: number;
              averageDaysPerWeek: string;
            };
          };
          preview?: unknown[];
        }> => {
          const { aggregate, playerDayToWeekConfig } = await import(
            "@gshl-utils"
          );
          const { playerDayAdapter } = await import("@gshl-sheets");

          // First, fetch the week to get its seasonId
          const week = (await optimizedSheetsAdapter.findUnique("Week", {
            where: { id: input.weekId },
          })) as unknown as Week | null;

          if (!week) {
            throw new Error(`Week not found: ${input.weekId}`);
          }

          // Fetch all player day stat lines for the specified week using the partitioned adapter
          const playerDays = (await playerDayAdapter.findMany({
            where: { weekId: input.weekId, seasonId: week.seasonId },
          })) as unknown as PlayerDayStatLine[];

          if (playerDays.length === 0) {
            return {
              count: 0,
              summary: {
                input: {
                  totalPlayerDays: 0,
                  uniquePlayers: 0,
                  uniqueTeams: 0,
                  uniqueWeeks: 0,
                },
                output: {
                  totalPlayerWeeks: 0,
                  averageDaysPerWeek: "0.00",
                },
              },
            };
          }

          // Aggregate player days into player weeks using unified system
          const playerWeekStats = aggregate(
            playerDays as unknown as Record<string, unknown>[],
            playerDayToWeekConfig as unknown as AggregationConfig<
              Record<string, unknown>,
              PlayerWeekStatLine
            >,
          );

          // Generate summary
          const uniquePlayers = new Set(playerDays.map((d) => d.playerId));
          const uniqueTeams = new Set(playerDays.map((d) => d.gshlTeamId));
          const uniqueWeeks = new Set(playerDays.map((d) => d.weekId));

          const summary = {
            input: {
              totalPlayerDays: playerDays.length,
              uniquePlayers: uniquePlayers.size,
              uniqueTeams: uniqueTeams.size,
              uniqueWeeks: uniqueWeeks.size,
            },
            output: {
              totalPlayerWeeks: playerWeekStats.length,
              averageDaysPerWeek:
                playerWeekStats.length > 0
                  ? (playerDays.length / playerWeekStats.length).toFixed(2)
                  : "0.00",
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: playerWeekStats.slice(0, 10), // Preview first 10
            };
          }

          // Step: Fetch existing player week records for this week
          const existingWeekRecords = (await optimizedSheetsAdapter.findMany(
            "PlayerWeekStatLine",
            {
              where: { weekId: input.weekId },
            },
          )) as unknown as PlayerWeekStatLine[];

          // Build a map of existing records by composite key (playerId-weekId-gshlTeamId)
          const existingRecordsMap = new Map<string, PlayerWeekStatLine>();
          for (const record of existingWeekRecords) {
            const key = `${record.playerId}:${record.weekId}:${record.gshlTeamId}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof playerWeekStats = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof playerWeekStats)[0];
          }> = [];

          for (const weekStat of playerWeekStats) {
            const key = `${weekStat.playerId}:${weekStat.weekId}:${weekStat.gshlTeamId}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              // Record exists - prepare for update
              recordsToUpdate.push({
                id: existing.id,
                data: weekStat,
              });
            } else {
              // New record - prepare for create
              recordsToCreate.push(weekStat);
            }
          }

          console.log(
            `📊 Upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "PlayerWeekStatLine",
              {
                data: recordsToCreate as Partial<PlayerWeekStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records (single API call)
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "PlayerWeekStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<PlayerWeekStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
          };
        },
      ),
  }),

  // Season splits operations (player stats per team)
  splits: createTRPCRouter({
    // Get all splits
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonId: z.string().optional(),
              gshlTeamId: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerSplitStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "PlayerSplitStatLine",
          input,
        ) as unknown as Promise<PlayerSplitStatLine[]>;
      }),

    // Get splits by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerSplitStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerSplitStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerSplitStatLine[]>;
      }),

    // Aggregate player weeks into splits
    aggregateAndCreateFromWeeks: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: { totalPlayerWeeks: number; uniquePlayers: number };
            output: { totalPlayerSplits: number };
          };
          preview?: unknown[];
        }> => {
          const { aggregate, playerWeekToSplitConfig } = await import(
            "@gshl-utils"
          );

          // Fetch all player week stat lines for the specified season
          const playerWeeks = (await optimizedSheetsAdapter.findMany(
            "PlayerWeekStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as PlayerWeekStatLine[];

          if (playerWeeks.length === 0) {
            return {
              count: 0,
              summary: {
                input: { totalPlayerWeeks: 0, uniquePlayers: 0 },
                output: { totalPlayerSplits: 0 },
              },
            };
          }

          // Fetch week metadata for seasonType classification
          const weeks = (await optimizedSheetsAdapter.findMany("Week", {
            where: { seasonId: input.seasonId },
          })) as unknown as Array<{ id: string; weekType: string }>;

          const weekMetadata = new Map(
            weeks.map((w) => [w.id, { weekType: w.weekType }]),
          );

          // Aggregate player weeks into player splits using unified system
          const playerSplitStats = aggregate(
            playerWeeks as unknown as Record<string, unknown>[],
            playerWeekToSplitConfig as unknown as AggregationConfig<
              Record<string, unknown>,
              PlayerSplitStatLine
            >,
            weekMetadata,
          );

          // Generate summary
          const uniquePlayers = new Set(playerWeeks.map((w) => w.playerId));
          const summary = {
            input: {
              totalPlayerWeeks: playerWeeks.length,
              uniquePlayers: uniquePlayers.size,
            },
            output: {
              totalPlayerSplits: playerSplitStats.length,
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: playerSplitStats.slice(0, 10),
            };
          }

          // Fetch existing player split records for this season
          const existingSplitRecords = (await optimizedSheetsAdapter.findMany(
            "PlayerSplitStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as PlayerSplitStatLine[];

          // Build a map of existing records by composite key
          const existingRecordsMap = new Map<string, PlayerSplitStatLine>();
          for (const record of existingSplitRecords) {
            const key = `${record.playerId}:${record.seasonId}:${record.gshlTeamId}:${record.seasonType}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof playerSplitStats = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof playerSplitStats)[0];
          }> = [];

          for (const splitStat of playerSplitStats) {
            const key = `${splitStat.playerId}:${splitStat.seasonId}:${splitStat.gshlTeamId}:${splitStat.seasonType}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              recordsToUpdate.push({
                id: existing.id,
                data: splitStat,
              });
            } else {
              recordsToCreate.push(splitStat);
            }
          }

          console.log(
            `📊 Split upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "PlayerSplitStatLine",
              {
                data: recordsToCreate as Partial<PlayerSplitStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "PlayerSplitStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<PlayerSplitStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
          };
        },
      ),
  }),

  // Season totals operations
  totals: createTRPCRouter({
    // Get all season totals
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonId: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "PlayerTotalStatLine",
          input,
        ) as unknown as Promise<PlayerTotalStatLine[]>;
      }),

    // Get season totals by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerTotalStatLine[]>;
      }),

    // Aggregate player weeks into totals
    aggregateAndCreateFromWeeks: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: { totalPlayerWeeks: number; uniquePlayers: number };
            output: { totalPlayerTotals: number };
          };
          preview?: unknown[];
        }> => {
          const { aggregate, playerWeekToTotalConfig } = await import(
            "@gshl-utils"
          );

          // Fetch all player week stat lines for the specified season
          const playerWeeks = (await optimizedSheetsAdapter.findMany(
            "PlayerWeekStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as PlayerWeekStatLine[];

          if (playerWeeks.length === 0) {
            return {
              count: 0,
              summary: {
                input: { totalPlayerWeeks: 0, uniquePlayers: 0 },
                output: { totalPlayerTotals: 0 },
              },
            };
          }

          // Fetch week metadata for seasonType classification
          const weeks = (await optimizedSheetsAdapter.findMany("Week", {
            where: { seasonId: input.seasonId },
          })) as unknown as Array<{ id: string; weekType: string }>;

          const weekMetadata = new Map(
            weeks.map((w) => [w.id, { weekType: w.weekType }]),
          );

          // Aggregate player weeks into player totals using unified system
          const playerTotalStats = aggregate(
            playerWeeks as unknown as Record<string, unknown>[],
            playerWeekToTotalConfig as unknown as AggregationConfig<
              Record<string, unknown>,
              PlayerTotalStatLine
            >,
            weekMetadata,
          );

          // Generate summary
          const uniquePlayers = new Set(playerWeeks.map((w) => w.playerId));
          const summary = {
            input: {
              totalPlayerWeeks: playerWeeks.length,
              uniquePlayers: uniquePlayers.size,
            },
            output: {
              totalPlayerTotals: playerTotalStats.length,
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: playerTotalStats.slice(0, 10),
            };
          }

          // Fetch existing player total records for this season
          const existingTotalRecords = (await optimizedSheetsAdapter.findMany(
            "PlayerTotalStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as PlayerTotalStatLine[];

          // Build a map of existing records by composite key
          const existingRecordsMap = new Map<string, PlayerTotalStatLine>();
          for (const record of existingTotalRecords) {
            const key = `${record.playerId}:${record.seasonId}:${record.seasonType}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof playerTotalStats = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof playerTotalStats)[0];
          }> = [];

          for (const totalStat of playerTotalStats) {
            const key = `${totalStat.playerId}:${totalStat.seasonId}:${totalStat.seasonType}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              recordsToUpdate.push({
                id: existing.id,
                data: totalStat,
              });
            } else {
              recordsToCreate.push(totalStat);
            }
          }

          console.log(
            `📊 Total upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "PlayerTotalStatLine",
              {
                data: recordsToCreate as Partial<PlayerTotalStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "PlayerTotalStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<PlayerTotalStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
          };
        },
      ),

    // Get season leaderboard
    getLeaderboard: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          statType: z.enum(["G", "A", "P", "PIM", "PPG", "SOG", "HIT", "BLK"]),
          take: z.number().int().positive().max(100).default(25),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        }) as unknown as Promise<PlayerTotalStatLine[]>;
      }),
  }),
});

// Export schemas for use in other parts of the codebase
export { playerDayStatsCreateSchema, playerDayStatsUpdateSchema };
