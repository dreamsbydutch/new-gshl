/**
 * PlayerDay Adapter
 * ==================
 * Wrapper around OptimizedSheetsAdapter that handles partitioned PlayerDay data.
 * Routes queries to the correct workbook based on season ranges.
 * Enforces validation rules: updates only allowed within a 2-day window.
 */

import { optimizedSheetsAdapter } from "./optimized-adapter";
import type { DatabaseRecord } from "../config/config";
import {
  getPlayerDaySpreadsheetId,
  groupPlayerDaysByWorkbook,
} from "../playerday/playerday-partition";
import {
  canUpdatePlayerDay,
  categorizePlayerDayRecords,
  buildPlayerDayKey,
  formatValidationError,
} from "../playerday/playerday-validation";
import type { FindManyOptions } from "./optimized-adapter";

export class PlayerDayAdapter {
  /**
   * Find PlayerDayStatLine records.
   * If a seasonId is provided in the where clause, routes to the correct workbook.
   * If no seasonId is provided, searches all PlayerDay workbooks (expensive!).
   */
  async findMany<T extends DatabaseRecord>(
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    const where = options.where as Record<string, unknown> | undefined;
    const seasonId = where?.seasonId as string | undefined;

    if (seasonId) {
      // Route to specific workbook for this season
      const spreadsheetId = getPlayerDaySpreadsheetId(seasonId);
      return this.queryWorkbook<T>(spreadsheetId, options);
    }

    // No seasonId provided - must search all workbooks (not recommended!)
    console.warn(
      "PlayerDay query without seasonId will search all partitions. Consider adding a seasonId filter.",
    );

    // TODO: Implement multi-workbook search if needed
    throw new Error(
      "PlayerDay queries without seasonId are not yet supported. Please specify a seasonId in your where clause.",
    );
  }

  /**
   * Find a single PlayerDayStatLine record.
   * Requires seasonId to route to the correct workbook.
   */
  async findUnique<T extends DatabaseRecord>(options: {
    where: Record<string, unknown>;
  }): Promise<T | null> {
    const seasonId = options.where.seasonId as string | undefined;

    if (!seasonId) {
      throw new Error(
        "PlayerDay findUnique requires seasonId to determine which workbook to query.",
      );
    }

    const spreadsheetId = getPlayerDaySpreadsheetId(seasonId);
    const results = await this.queryWorkbook<T>(spreadsheetId, {
      where: options.where as Partial<T>,
      take: 1,
    });

    return results[0] ?? null;
  }

  /**
   * Create a new PlayerDayStatLine record.
   * Routes to the correct workbook based on the seasonId in the data.
   */
  async create<T>(options: { data: Record<string, unknown> }): Promise<T> {
    const seasonId = options.data.seasonId as string | undefined;

    if (!seasonId) {
      throw new Error(
        "PlayerDay create requires seasonId to determine which workbook to write to.",
      );
    }

    const _spreadsheetId = getPlayerDaySpreadsheetId(seasonId);

    // Use the underlying adapter with the correct spreadsheet ID
    // This requires extending the adapter to support custom spreadsheet IDs
    // For now, throw an error indicating this needs implementation
    throw new Error(
      "PlayerDay create not yet implemented. Need to extend optimizedSheetsAdapter to support custom spreadsheet routing.",
    );
  }

  /**
   * Create many PlayerDayStatLine records.
   * Automatically groups them by workbook and writes to the correct sheets.
   */
  async createMany<T>(options: {
    data: Array<Record<string, unknown>>;
  }): Promise<T[]> {
    const _groupedRecords = groupPlayerDaysByWorkbook(options.data);

    // TODO: Batch write to each workbook
    throw new Error(
      "PlayerDay createMany not yet implemented. Need to extend optimizedSheetsAdapter to support batch writes to multiple workbooks.",
    );
  }

  /**
   * Update a PlayerDayStatLine record.
   * Requires seasonId to route to the correct workbook.
   * Validates that update is within allowed timeframe (same day or next day).
   */
  async update<T>(options: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<T> {
    // To update, we need to know which workbook the record is in
    // This requires either:
    // 1. Including seasonId in the update data
    // 2. Fetching the record first to get its seasonId
    // For now, require seasonId in data
    const seasonId = options.data.seasonId as string | undefined;
    const date = options.data.date as string | undefined;

    if (!seasonId) {
      throw new Error(
        "PlayerDay update requires seasonId in data to determine which workbook to write to.",
      );
    }

    if (!date) {
      throw new Error("PlayerDay update requires date field for validation.");
    }

    // Validate update timeframe
    const validation = canUpdatePlayerDay(date);
    if (!validation.allowed) {
      throw new Error(
        validation.reason ??
          "Update not allowed for this date. Updates only permitted on the same day or within 1 day.",
      );
    }

    const _spreadsheetId = getPlayerDaySpreadsheetId(seasonId);

    // Use the underlying adapter with the correct spreadsheet ID
    throw new Error(
      "PlayerDay update not yet implemented. Need to extend optimizedSheetsAdapter to support custom spreadsheet routing.",
    );
  }

  /**
   * Upsert (create or update) many PlayerDayStatLine records with validation.
   * - Creates new records without date restrictions
   * - Updates existing records only if within allowed timeframe (2-day window)
   * - Rejects updates for older dates
   *
   * Returns categorized results showing what was created, updated, and rejected.
   */
  async upsertMany(options: {
    data: Array<{
      id?: string;
      playerId: string;
      seasonId: string;
      date: string;
      [key: string]: unknown;
    }>;
    dryRun?: boolean;
  }): Promise<{
    created: number;
    updated: number;
    rejected: Array<{
      record: (typeof options.data)[0];
      reason: string;
    }>;
    errors: string[];
  }> {
    const { data, dryRun = false } = options;
    const errors: string[] = [];

    // Step 1: Fetch existing records to determine create vs update
    // Build a set of existing keys for quick lookup
    const existingKeys = new Set<string>();

    // Group by season to query each workbook
    const groupedBySeason = new Map<string, Array<(typeof options.data)[0]>>();
    for (const record of data) {
      if (!groupedBySeason.has(record.seasonId)) {
        groupedBySeason.set(record.seasonId, []);
      }
      groupedBySeason.get(record.seasonId)!.push(record);
    }

    // Query each season's workbook to get existing records
    for (const [seasonId, seasonRecords] of groupedBySeason) {
      try {
        const _playerIds = [...new Set(seasonRecords.map((r) => r.playerId))];
        const _dates = [...new Set(seasonRecords.map((r) => r.date))];

        // Query existing records for these players and dates
        // This is a placeholder - actual implementation depends on adapter capabilities
        // const existing = await this.findMany({
        //   where: {
        //     seasonId,
        //     playerId: { in: playerIds },
        //     date: { in: dates },
        //   },
        // });

        // For now, build keys from the input data assuming they might exist
        for (const record of seasonRecords) {
          const key = buildPlayerDayKey(
            record.playerId,
            record.seasonId,
            record.date,
          );
          // In real implementation, only add if found in query results
          if (record.id) {
            existingKeys.add(record.id);
            existingKeys.add(key);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to query existing records for season ${seasonId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // Step 2: Categorize records (create, update, reject)
    const { toCreate, toUpdate, rejected } = categorizePlayerDayRecords(
      data,
      existingKeys,
    );

    // Step 3: Log validation results
    for (const { record, reason } of rejected) {
      const errorMsg = formatValidationError(record, reason);
      errors.push(errorMsg);
      console.warn(errorMsg);
    }

    // Step 4: Execute operations (if not dry run)
    if (!dryRun) {
      // TODO: Implement actual create/update operations
      // This requires extending optimizedSheetsAdapter to support:
      // 1. Custom spreadsheet routing
      // 2. Batch operations within each workbook

      console.log(
        `Would create ${toCreate.length} and update ${toUpdate.length} PlayerDay records`,
      );
    }

    return {
      created: toCreate.length,
      updated: toUpdate.length,
      rejected,
      errors,
    };
  }

  /**
   * Delete a PlayerDayStatLine record.
   * Requires seasonId to route to the correct workbook.
   */
  async delete(options: {
    where: { id: string; seasonId?: string };
  }): Promise<void> {
    const seasonId = options.where.seasonId;

    if (!seasonId) {
      throw new Error(
        "PlayerDay delete requires seasonId to determine which workbook contains the record.",
      );
    }

    const _spreadsheetId = getPlayerDaySpreadsheetId(seasonId);

    // Use the underlying adapter with the correct spreadsheet ID
    throw new Error(
      "PlayerDay delete not yet implemented. Need to extend optimizedSheetsAdapter to support custom spreadsheet routing.",
    );
  }

  /**
   * Internal helper to query a specific workbook
   */
  private async queryWorkbook<T extends DatabaseRecord>(
    spreadsheetId: string,
    options: FindManyOptions<T>,
  ): Promise<T[]> {
    // Use the optimizedSheetsAdapter's new method for custom spreadsheet queries
    return optimizedSheetsAdapter.findManyWithSpreadsheet<T>(
      "PlayerDayStatLine",
      options,
      spreadsheetId,
    );
  }
}

// Export singleton instance
export const playerDayAdapter = new PlayerDayAdapter();
