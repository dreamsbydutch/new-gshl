/**
 * PlayerDay Adapter
 * ==================
 * Wrapper around OptimizedSheetsAdapter that handles partitioned PlayerDay data.
 * Routes queries to the correct workbook based on season ranges.
 * Enforces validation rules: updates only allowed within a 2-day window.
 */

import { optimizedSheetsAdapter } from "./optimized-adapter";
import {
  SHEETS_CONFIG,
  convertModelToRow,
  convertRowToModel,
  type DatabaseRecord,
} from "../config/config";
import { optimizedSheetsClient } from "../client/optimized-client";
import {
  PLAYERDAY_WORKBOOKS,
  getPlayerDaySpreadsheetId,
  groupPlayerDaysByWorkbook,
  type PlayerDayWorkbookKey,
} from "../playerday/playerday-partition";
import {
  canUpdatePlayerDay,
  categorizePlayerDayRecords,
  buildPlayerDayKey,
  formatValidationError,
} from "../playerday/playerday-validation";
import type { FindManyOptions } from "./optimized-adapter";

const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const PLAYER_DAY_SHEET_NAME = SHEETS_CONFIG.SHEETS[PLAYER_DAY_MODEL];
const PLAYER_DAY_COLUMNS = SHEETS_CONFIG.COLUMNS[PLAYER_DAY_MODEL];

if (!PLAYER_DAY_SHEET_NAME) {
  throw new Error("PlayerDay sheet name is not configured in SHEETS_CONFIG.");
}

if (!PLAYER_DAY_COLUMNS) {
  throw new Error("PlayerDay columns are not configured in SHEETS_CONFIG.");
}

const getColumnLetter = (index: number): string => {
  let letter = "";
  let current = index;
  while (current > 0) {
    current--;
    letter = String.fromCharCode((current % 26) + 65) + letter;
    current = Math.floor(current / 26);
  }
  return letter;
};

const PLAYER_DAY_MAX_COLUMN = getColumnLetter(PLAYER_DAY_COLUMNS.length);
const PLAYER_DAY_RANGE = `${PLAYER_DAY_SHEET_NAME}!A2:${PLAYER_DAY_MAX_COLUMN}`;

type WorkbookIndex = {
  rowById: Map<string, number>;
  rowByKey: Map<string, number>;
  rowsByIndex: Map<number, DatabaseRecord>;
};

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
    const workbookEntries = Object.entries(PLAYERDAY_WORKBOOKS) as Array<
      [PlayerDayWorkbookKey, string]
    >;

    const results = await Promise.all(
      workbookEntries.map(async ([workbookKey, spreadsheetId]) => {
        try {
          return await this.queryWorkbook<T>(spreadsheetId, options);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to query ${workbookKey} PlayerDay workbook: ${message}`,
          );
          return [] as T[];
        }
      }),
    );

    return results.flat();
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

    // Determine target workbook (used when this method is implemented)
    getPlayerDaySpreadsheetId(seasonId);

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
    const { data } = options;
    if (!data || data.length === 0) {
      return [];
    }

    const grouped = groupPlayerDaysByWorkbook(data);
    if (grouped.size === 0) {
      console.warn(
        "No PlayerDay records were created because none included a valid seasonId.",
      );
      return [];
    }

    for (const [workbookKey, records] of grouped) {
      const spreadsheetId = PLAYERDAY_WORKBOOKS[workbookKey];
      try {
        await this.appendRecordsToWorkbook(spreadsheetId, records);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to create PlayerDay records in ${workbookKey}: ${message}`,
        );
      }
    }

    return data as T[];
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

    // Determine target workbook (used when this method is implemented)
    getPlayerDaySpreadsheetId(seasonId);

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
        // Extract unique player IDs and dates (used when query is implemented)
        // const playerIds = [...new Set(seasonRecords.map((r) => r.playerId))];
        // const dates = [...new Set(seasonRecords.map((r) => r.date))];

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
      const createGroups = groupPlayerDaysByWorkbook(toCreate);
      for (const [workbookKey, records] of createGroups) {
        const spreadsheetId = PLAYERDAY_WORKBOOKS[workbookKey];
        try {
          await this.appendRecordsToWorkbook(spreadsheetId, records);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const errorMsg = `Failed to create ${records.length} PlayerDay records in ${workbookKey}: ${message}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      const updateGroups = groupPlayerDaysByWorkbook(toUpdate);
      for (const [workbookKey, records] of updateGroups) {
        const spreadsheetId = PLAYERDAY_WORKBOOKS[workbookKey];
        try {
          await this.updateRecordsInWorkbook(spreadsheetId, records);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const errorMsg = `Failed to update ${records.length} PlayerDay records in ${workbookKey}: ${message}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
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

    // Determine target workbook (used when this method is implemented)
    getPlayerDaySpreadsheetId(seasonId);

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

  private getStringField(
    record: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private buildFallbackId(record: Record<string, unknown>): string | undefined {
    const playerId = this.getStringField(record, "playerId");
    const seasonId = this.getStringField(record, "seasonId");
    const date = this.getStringField(record, "date");

    if (playerId && seasonId && date) {
      return buildPlayerDayKey(playerId, seasonId, date);
    }
    return undefined;
  }

  private async appendRecordsToWorkbook(
    spreadsheetId: string,
    records: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (records.length === 0) return;

    const now = new Date();
    const values = records.map((record) => {
      const prepared: Record<string, unknown> = { ...record };
      if (!prepared.id) {
        const generatedId = this.buildFallbackId(prepared);
        if (generatedId) {
          prepared.id = generatedId;
        }
      }
      if (!prepared.createdAt) {
        prepared.createdAt = now;
      }
      prepared.updatedAt = now;
      return convertModelToRow(prepared as DatabaseRecord, PLAYER_DAY_COLUMNS);
    });

    await optimizedSheetsClient.appendValues(
      spreadsheetId,
      `${PLAYER_DAY_SHEET_NAME}!A:A`,
      values,
    );
  }

  private async updateRecordsInWorkbook(
    spreadsheetId: string,
    records: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (records.length === 0) return;

    const indexData = await this.buildWorkbookIndex(spreadsheetId);
    const now = new Date();

    for (const record of records) {
      const rowIndex = this.resolveRowIndex(record, indexData);
      if (!rowIndex) {
        const id = this.getStringField(record, "id") ?? "unknown";
        const key = this.buildFallbackId(record) ?? "unknown";
        console.warn(
          `PlayerDay update skipped: unable to locate row for id ${id} (key ${key}).`,
        );
        continue;
      }

      const existing = indexData.rowsByIndex.get(rowIndex) ?? {};
      const merged: Record<string, unknown> = {
        ...existing,
        ...record,
        updatedAt: now,
      };

      if (existing.createdAt && record.createdAt === undefined) {
        merged.createdAt = existing.createdAt;
      }

      const range = `${PLAYER_DAY_SHEET_NAME}!A${rowIndex}:${PLAYER_DAY_MAX_COLUMN}${rowIndex}`;
      const rowValues = convertModelToRow(
        merged as DatabaseRecord,
        PLAYER_DAY_COLUMNS,
      );

      await optimizedSheetsClient.updateValues(spreadsheetId, range, [
        rowValues,
      ]);
    }
  }

  private async buildWorkbookIndex(
    spreadsheetId: string,
  ): Promise<WorkbookIndex> {
    const values = await optimizedSheetsClient.getValues(
      spreadsheetId,
      PLAYER_DAY_RANGE,
    );

    const rowById = new Map<string, number>();
    const rowByKey = new Map<string, number>();
    const rowsByIndex = new Map<number, DatabaseRecord>();

    values.forEach((row, index) => {
      if (!row || row.length === 0) return;
      const model = convertRowToModel<DatabaseRecord>(row, PLAYER_DAY_COLUMNS);
      const rowIndex = index + 2; // account for header row
      rowsByIndex.set(rowIndex, model);

      const idValue = this.getStringField(model, "id");
      if (idValue) {
        rowById.set(idValue, rowIndex);
      }

      const composite = this.buildFallbackId(model);
      if (composite) {
        rowByKey.set(composite, rowIndex);
      }
    });

    return { rowById, rowByKey, rowsByIndex };
  }

  private resolveRowIndex(
    record: Record<string, unknown>,
    indexData: WorkbookIndex,
  ): number | undefined {
    const id = this.getStringField(record, "id");
    if (id) {
      const byId = indexData.rowById.get(id);
      if (byId) return byId;
    }

    const fallback = this.buildFallbackId(record);
    if (fallback) {
      return indexData.rowByKey.get(fallback);
    }

    return undefined;
  }
}

// Export singleton instance
export const playerDayAdapter = new PlayerDayAdapter();
