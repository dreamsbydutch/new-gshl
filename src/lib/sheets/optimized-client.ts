import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { env } from "@gshl-env";
import type { sheets_v4 } from "googleapis";

// Enhanced types for better performance
type CellValue = string | number | boolean | null;
type BatchOperation = {
  type: "update" | "append" | "clear";
  range: string;
  values: CellValue[][];
  spreadsheetId: string;
};

interface SheetMetadata {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
  retryAttempts: number;
  baseDelay: number;
}

interface QueuedRequest {
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

export class OptimizedSheetsClient {
  private sheets: sheets_v4.Sheets;
  private auth: GoogleAuth;
  private connectionPool: Map<string, sheets_v4.Sheets> = new Map();
  private metadataCache: Map<string, SheetMetadata[]> = new Map();
  private readonly BATCH_SIZE = 1000;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Rate limiting properties
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private requestTimestamps: number[] = [];
  private readonly rateLimitConfig: RateLimitConfig = {
    requestsPerMinute: 300, // Conservative limit (Google's limit is 300/min)
    burstLimit: 10, // Max requests in burst
    retryAttempts: 5,
    baseDelay: 1000, // 1 second base delay
  };

  constructor() {
    try {
      this.auth = new GoogleAuth({
        keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "./gsconfig.json",
        credentials: env.GOOGLE_SERVICE_ACCOUNT_KEY
          ? (JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as object)
          : undefined,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      this.sheets = google.sheets({ version: "v4", auth: this.auth });
    } catch (error) {
      console.error("❌ Failed to initialize Google Sheets client:", error);
      throw error;
    }
  }

  // Rate limiting and retry logic
  private async withRateLimit<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) break;

      try {
        await this.waitForRateLimit();
        const result = await this.executeWithRetry(request.operation);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo,
    );

    // Check if we've exceeded the rate limit
    if (
      this.requestTimestamps.length >= this.rateLimitConfig.requestsPerMinute
    ) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest ? oldestRequest + 60 * 1000 - now : 1000;

      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached. Waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }

    // Add current timestamp
    this.requestTimestamps.push(now);
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 1,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (this.shouldRetry(error, attempt)) {
        const delay = this.calculateBackoffDelay(attempt);
        console.log(
          `🔄 Retrying request (attempt ${attempt}/${this.rateLimitConfig.retryAttempts}) after ${delay}ms...`,
        );
        await this.sleep(delay);
        return this.executeWithRetry(operation, attempt + 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.rateLimitConfig.retryAttempts) return false;

    // Retry on rate limit errors (429) or temporary server errors (5xx)
    const statusCode = error.code || error.status;
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.rateLimitConfig.baseDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Debug method to check queue status
  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    requestsInLastMinute: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const recentRequests = this.requestTimestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo,
    );

    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      requestsInLastMinute: recentRequests.length,
    };
  }

  // Get or create connection for spreadsheet
  private async getConnection(
    spreadsheetId: string,
  ): Promise<sheets_v4.Sheets> {
    if (!this.connectionPool.has(spreadsheetId)) {
      this.connectionPool.set(spreadsheetId, this.sheets);
    }
    return this.connectionPool.get(spreadsheetId)!;
  }

  // Get sheet metadata with caching
  async getSheetMetadata(spreadsheetId: string): Promise<SheetMetadata[]> {
    const cacheKey = `metadata_${spreadsheetId}`;
    const cached = this.metadataCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    return this.withRateLimit(async () => {
      try {
        const response = await this.sheets.spreadsheets.get({
          spreadsheetId,
          fields:
            "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
        });

        const metadata: SheetMetadata[] =
          response.data.sheets?.map((sheet) => ({
            sheetId: sheet.properties?.sheetId ?? 0,
            title: sheet.properties?.title ?? "",
            rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
            columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
          })) ?? [];

        this.metadataCache.set(cacheKey, metadata);

        // Clear cache after TTL
        setTimeout(() => {
          this.metadataCache.delete(cacheKey);
        }, this.CACHE_TTL);

        return metadata;
      } catch (error) {
        console.error("❌ Failed to get sheet metadata:", error);
        throw error;
      }
    });
  }

  // Batch operations for better performance
  async batchUpdate(operations: BatchOperation[]): Promise<void> {
    const groupedOps = new Map<string, BatchOperation[]>();

    // Group operations by spreadsheet
    operations.forEach((op) => {
      if (!groupedOps.has(op.spreadsheetId)) {
        groupedOps.set(op.spreadsheetId, []);
      }
      groupedOps.get(op.spreadsheetId)!.push(op);
    });

    // Execute batch operations for each spreadsheet
    const promises = Array.from(groupedOps.entries()).map(
      async ([spreadsheetId, ops]) => {
        const batchRequests = ops
          .map((op) => {
            if (op.type === "update") {
              return {
                updateCells: {
                  range: this.parseRange(op.range),
                  fields: "userEnteredValue",
                  rows: op.values.map((row) => ({
                    values: row.map((cell) => ({
                      userEnteredValue: this.formatCellValue(cell),
                    })),
                  })),
                },
              };
            } else if (op.type === "append") {
              return {
                appendCells: {
                  sheetId: this.getSheetIdFromRange(op.range),
                  rows: op.values.map((row) => ({
                    values: row.map((cell) => ({
                      userEnteredValue: this.formatCellValue(cell),
                    })),
                  })),
                },
              };
            }
            return null;
          })
          .filter(
            (request): request is NonNullable<typeof request> =>
              request !== null,
          );

        if (batchRequests.length > 0) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: batchRequests },
          });
        }
      },
    );

    await Promise.all(promises);
  }

  // Optimized read with range batching
  async getValuesOptimized(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<Map<string, CellValue[][]>> {
    return this.withRateLimit(async () => {
      try {
        const response = await this.sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges,
          valueRenderOption: "UNFORMATTED_VALUE",
        });

        const result = new Map<string, CellValue[][]>();

        response.data.valueRanges?.forEach((valueRange, index) => {
          const range = ranges[index];
          if (range) {
            result.set(range, (valueRange.values as CellValue[][]) ?? []);
          }
        });

        return result;
      } catch (error) {
        console.error("❌ Error in batch get values:", error);
        throw error;
      }
    });
  }

  // Direct row access by ID (assumes ID is first column)
  async getRowByIds(
    spreadsheetId: string,
    sheetName: string,
    ids: number[],
    columnCount: number,
  ): Promise<Map<number, CellValue[]>> {
    try {
      const ranges = ids.map(
        (id) =>
          `${sheetName}!A${id + 1}:${this.getColumnLetter(columnCount)}${id + 1}`,
      );

      const results = await this.getValuesOptimized(spreadsheetId, ranges);
      const idToRow = new Map<number, CellValue[]>();

      results.forEach((rows, range) => {
        const id = ids[Array.from(results.keys()).indexOf(range)];
        if (id !== undefined && rows.length > 0) {
          idToRow.set(id, rows[0] ?? []);
        }
      });

      return idToRow;
    } catch (error) {
      console.error("❌ Error getting rows by IDs:", error);
      throw error;
    }
  }

  // Optimized update by ID
  async updateRowsByIds(
    spreadsheetId: string,
    sheetName: string,
    updates: Map<number, CellValue[]>,
  ): Promise<void> {
    const operations: BatchOperation[] = [];

    updates.forEach((values, id) => {
      const range = `${sheetName}!A${id + 1}:${this.getColumnLetter(values.length)}${id + 1}`;
      operations.push({
        type: "update",
        range,
        values: [values],
        spreadsheetId,
      });
    });

    await this.batchUpdate(operations);
  }

  // Efficient append with batch processing
  async appendValuesBatch(
    spreadsheetId: string,
    sheetName: string,
    values: CellValue[][],
  ): Promise<void> {
    const batches = this.chunkArray(values, this.BATCH_SIZE);

    for (const batch of batches) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: "RAW",
        requestBody: { values: batch },
      });
    }
  }

  // Utility methods
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private parseRange(range: string) {
    // Parse A1 notation to grid coordinates
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) throw new Error(`Invalid range format: ${range}`);

    const [, startCol, startRow, endCol, endRow] = match;
    if (!startCol || !startRow || !endCol || !endRow) {
      throw new Error(`Invalid range format: ${range}`);
    }

    return {
      startRowIndex: parseInt(startRow) - 1,
      endRowIndex: parseInt(endRow),
      startColumnIndex: this.columnLetterToIndex(startCol),
      endColumnIndex: this.columnLetterToIndex(endCol) + 1,
    };
  }

  private getSheetIdFromRange(range: string): number {
    // This would need to be implemented based on sheet metadata
    return 0; // Placeholder
  }

  private formatCellValue(value: CellValue) {
    if (value === null || value === undefined) return { stringValue: "" };
    if (typeof value === "boolean") return { boolValue: value };
    if (typeof value === "number") return { numberValue: value };
    return { stringValue: String(value) };
  }

  private columnLetterToIndex(letter: string): number {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  private getColumnLetter(index: number): string {
    let letter = "";
    while (index > 0) {
      index--;
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26);
    }
    return letter;
  }

  // Legacy methods for backward compatibility
  async testAccess(spreadsheetId: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      try {
        await this.sheets.spreadsheets.get({
          spreadsheetId,
          fields: "properties.title",
        });
        return true;
      } catch (error) {
        console.error("❌ Failed to access spreadsheet:", error);
        return false;
      }
    });
  }

  async createSheet(
    spreadsheetId: string,
    sheetName: string,
    headers: string[],
  ): Promise<void> {
    try {
      const metadata = await this.getSheetMetadata(spreadsheetId);
      const existingSheet = metadata.find((sheet) => sheet.title === sheetName);

      if (existingSheet) return;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetName },
              },
            },
          ],
        },
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:${this.getColumnLetter(headers.length)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    } catch (error) {
      console.error(`❌ Error creating sheet "${sheetName}":`, error);
      throw error;
    }
  }

  async getValues(
    spreadsheetId: string,
    range: string,
  ): Promise<CellValue[][]> {
    return this.withRateLimit(async () => {
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
          valueRenderOption: "UNFORMATTED_VALUE",
        });
        return (response.data.values as CellValue[][]) ?? [];
      } catch (error) {
        console.error(`❌ Error getting values from range "${range}":`, error);
        throw error;
      }
    });
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: CellValue[][],
  ): Promise<void> {
    return this.withRateLimit(async () => {
      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: "RAW",
          requestBody: { values },
        });
      } catch (error) {
        console.error(`❌ Error updating values in range "${range}":`, error);
        throw error;
      }
    });
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: CellValue[][],
  ): Promise<void> {
    return this.withRateLimit(async () => {
      try {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: "RAW",
          requestBody: { values },
        });
      } catch (error) {
        console.error(`❌ Error appending values to range "${range}":`, error);
        throw error;
      }
    });
  }

  async clearValues(spreadsheetId: string, range: string): Promise<void> {
    return this.withRateLimit(async () => {
      try {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId,
          range,
        });
      } catch (error) {
        console.error(`❌ Error clearing values in range "${range}":`, error);
        throw error;
      }
    });
  }
}

// Export singleton instance
export const optimizedSheetsClient = new OptimizedSheetsClient();
